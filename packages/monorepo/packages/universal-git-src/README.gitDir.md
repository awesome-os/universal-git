## The Handle System

We do not operate on raw strings or filesystem paths. Instead, the architecture operates on **`gitDirEntries`**. This provides a type-safe abstraction over different kinds of resources (files, directories, remote streams, etc.).

The primary types are:

1.  **`gitDirHandle`**: Represents a directory or a structural node.
2.  **`gitDirFileHandle`**: Represents a file or a data stream.

By abstracting these handles, we can interact with a file in a local `.git/objects` folder exactly the same way we interact with a generic object in a database or a stream from a remote HTTP server.

```typescript
// Conceptual usage
const refsDir = await gitDir.getHandle('refs/heads');
const mainRef = await refsDir.getFileHandle('main');
const oid = await mainRef.read();
```

---
title: Architecture
sidebar_label: Architecture
---

# Architecture: The Virtual `gitDir` Provider

Universal-git utilizes a **Virtual `gitDir` Provider** architecture. Instead of treating `.git` as a static directory on a physical filesystem, we model it as a composition of virtual providers.

The core concept is simple: we parse or create a virtual `.git` directory—the **`gitDir`**—which acts as an aggregator. It is composed of an array of `gitDir` implementations, each responsible for a specific slice of the Git structure.

## The Core Concept: Recursive Composition

The true power of this architecture lies in **Recursive Composition**. Since `gitDir` is an interface defined by handles and providers, any subset of git operations can be modeled as a valid `gitDir`.

This means **Namespaces** and **Worktrees** are not just sub-directories; they are fully functional `gitDir` instances constructed by reusing and wrapping specific parts of the main repository.

### 1. Git Namespaces (`.git/namespaces`)

In traditional Git, namespaces allow different references to exist in the same repository without colliding (e.g., `refs/namespaces/user-a/refs/heads/main`). Implementing this usually requires complex logic in every git command to check if a namespace is active.

In our architecture, a Namespace is simply a **Derived `gitDir` Provider**.

When you operate inside a namespace, you are given a `gitDir` instance that is a *virtual slice* of the main repository:

*   **Objects Provider:** Reused directly from the root. (Shared database).
*   **Config Provider:** Reused from root (mostly), or overlaid.
*   **Refs Provider:** A **Virtual Wrapper**.
    *   When the generic code asks to read `refs/heads/main`, the Namespace Provider transparently translates this request to `refs/namespaces/my-feature/refs/heads/main` in the underlying storage.

**Implication of Reuse:**
The core logic for `commit`, `log`, or `checkout` **does not need to know namespaces exist**. It operates on the `gitDir` interface as usual. The provider handles the path translation.

### 2. Worktrees (`.git/worktrees`)

Git worktrees allow multiple working directories attached to the same repository history. This requires a complex split of state: `HEAD` and `index` are private to the worktree, while `objects` and `refs` are shared with the main repo.

In our architecture, a Worktree is a **Composite `gitDir` Provider**.

When a `gitDir` is instantiated for a specific worktree (e.g., at `.git/worktrees/feature-branch`), it is assembled via composition:

*   **Shared Providers (Delegated to Main Repo):**
    *   `gitDirObjects`: Points to Main `.git/objects`
    *   `gitDirRefs`: Points to Main `.git/refs`
    *   `gitDirConfig`: Points to Main `.git/config`
*   **Private Providers (Local to Worktree):**
    *   `gitDirHEAD`: Reads/Writes `.git/worktrees/feature-branch/HEAD`
    *   `gitDirIndex`: Reads/Writes `.git/worktrees/feature-branch/index`
    *   `gitDirState`: Manages `MERGE_HEAD`, `rebase-merge/`, etc. locally.

**Implication of Reuse:**
We reuse the exact same `gitDirObjects` and `gitDirRefs` implementations from the main repository. The Worktree `gitDir` acts as a router: requests for `HEAD` go to the private folder; requests for objects go to the shared provider.

## Visualizing the Composition

This diagram illustrates how specific `gitDir` instances are composed of reusable units.

```text
┌────────────────────────────────────────────────────────┐
│  ROOT REPO (Standard gitDir)                           │
│  [Provider: Composite]                                 │
│                                                        │
│  ├── .git/objects  ➔ [Implementation: S3/FS/SQL]     │◄───┐
│  ├── .git/refs     ➔ [Implementation: FS-Packed]     │◄─┐ │
│  ├── .git/HEAD     ➔ [Implementation: FS File]       │  │ │
│  └── .git/index    ➔ [Implementation: BinaryParser]  │  │ │
└────────────────────────────────────────────────────────┘  │ │
                                                            │ │
┌────────────────────────────────────────────────────────┐  │ │
│  NAMESPACE "TEAM-A" (Derived gitDir)                   │  │ │
│  [Provider: NamespaceWrapper]                          │  │ │
│                                                        │  │ │
│  ├── .git/objects  ➔ REUSES Root Implementation ──────│───┘ │
│  ├── .git/refs     ➔ [Virtual Mapper] ────────────────│─────┘
│  │                   (Maps "main" ➔ "ns/team-a/main") │
│  └── .git/HEAD     ➔ [Virtual Symref]                  │
└────────────────────────────────────────────────────────┘
                                                            │
┌────────────────────────────────────────────────────────┐  │
│  WORKTREE "HOTFIX" (Composite gitDir)                  │  │
│  [Provider: WorktreeComposite]                         │  │
│                                                        │  │
│  ├── .git/objects  ➔ REUSES Root Implementation ──────│───┘
│  ├── .git/refs     ➔ REUSES Root Implementation ──────┘
│  ├── .git/HEAD     ➔ [Implementation: Local FS] (Private)
│  └── .git/index    ➔ [Implementation: Local FS] (Private)
└────────────────────────────────────────────────────────┘
```

## The Handle System

We do not operate on raw strings or filesystem paths. Instead, the architecture operates on **`gitDirEntries`**. This provides a type-safe abstraction over different kinds of resources.

The primary types are:

1.  **`gitDirHandle`**: Represents a directory or a structural node.
2.  **`gitDirFileHandle`**: Represents a file or a data stream.

By abstracting these handles, we can interact with a file in a local `.git/objects` folder exactly the same way we interact with a generic object in a database or a stream from a remote HTTP server.

## Why this Architecture?

### 1. Correcting the Boundary: The Shift from "Backends"

In previous iterations, abstraction relied on "Backends" (e.g., `FileSystemBackend`). We found this to be the **wrong boundary**.

By moving the abstraction to the **Directory and Handle level**, we gain significantly more power. We can mix and match: store Objects in S3, Refs in Redis, and Namespace mappings in memory, all within a single `gitDir` instance.

### 2. Encapsulated Logic & Traversal

Each `gitDir` implementation owns its own logic for traversal (walking).

*   A `gitDirWorktree` implementation knows how to handle `.gitignore` rules specific to its context.
*   A `gitDirObjects` implementation backed by a database doesn't need to "scan directories"; it queries indices directly while exposing a directory-like structure.

### 3. Remote as Local

We can mount abstract providers like `.git/remote/http`. By implementing a `gitDirRemoteHttp` provider:
1.  We mount it at `.git/remote/origin`.
2.  Fetching data becomes a standard "read" operation on a file handle.
3.  The provider handles the translation between "File Read" and "HTTP Request/Response".

## Worktree Integration (`worktreeDir`)

Just as we have `gitDir` for repository data, we have `worktreeDir` for the actual project files.

*   **`worktreeDir`**: Represents the working directory where files are checked out.
*   **`worktreeFileHandles`**: Represents the actual files users edit.

This separation ensures that the version control database (`gitDir`) and the user's workspace (`worktreeDir`) can exist on completely different storage mediums or abstraction layers, bridged only by the logic that moves data between them (checkout/commit).