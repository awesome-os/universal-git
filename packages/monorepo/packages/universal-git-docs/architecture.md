---
title: Architecture
sidebar_label: Architecture
---

# Architecture

Universal-git's codebase is organized to mirror the actual `.git` directory structure. This design makes the codebase intuitive, maintainable, and easy to navigate.

## Why Match `.git` Directory Structure?

The code structure directly mirrors the `.git` directory structure for several key reasons:

1. **Intuitive Navigation**: Want to work with the index? Look in `src/git/index/`. Need to read refs? Check `src/git/refs/`.
2. **Single Source of Truth**: The `.git/index` file is the source of truth, and the code that reads/writes it is right there.
3. **Less Abstraction**: Direct file operations with minimal indirection make the code easier to understand.
4. **Easier Debugging**: You can trace code directly to specific `.git` files.
5. **Better Maintainability**: The structure matches Git's actual organization, making it familiar to Git users.

## Directory Structure

### High-Level Organization

```
src/
├── commands/          # High-level Git commands (public API)
├── git/              # Direct .git directory operations
├── core-utils/       # Low-level utilities (some deprecated)
├── models/           # Data structures and parsers
├── backends/         # Storage backend implementations
├── errors/           # Error classes
├── utils/            # Utility functions
└── wire/             # Git wire protocol implementations
```

### Commands Layer (`src/commands/`)

The **commands layer** provides the public API for Git operations. These are high-level functions that users call directly:

- `add.ts` - Stage files
- `commit.ts` - Create commits
- `checkout.ts` - Checkout branches/files
- `merge.ts` - Merge branches
- `clone.ts` - Clone repositories
- And 65+ more commands...

**Example:**
```typescript
import { add, commit } from 'universal-git'

await add({ fs, dir, filepath: 'file.txt' })
await commit({ fs, dir, message: 'Add file' })
```

### Git Operations Layer (`src/git/`)

The **git operations layer** contains direct operations on `.git` directory files. This layer mirrors the actual `.git` directory structure:

```
src/git/
├── HEAD.ts              # .git/HEAD operations
├── config.ts            # .git/config operations
├── shallow.ts           # .git/shallow operations
├── index/               # .git/index (staging area)
│   ├── GitIndex.ts      # Index model/parser
│   ├── readIndex.ts     # Read index from disk
│   └── writeIndex.ts    # Write index to disk
├── objects/             # .git/objects/ (object database)
│   ├── loose/           # Loose object operations
│   ├── pack/            # Packfile operations
│   └── info/            # ODB metadata (alternates, etc.)
├── refs/                # .git/refs/ (references) ✅ MIGRATED
│   ├── readRef.ts       # Read and resolve refs
│   ├── writeRef.ts      # Write refs (with reflog)
│   ├── listRefs.ts      # List refs
│   ├── deleteRef.ts     # Delete refs
│   └── notes/           # Git notes operations
├── logs/                # .git/logs/ (reflogs)
│   ├── logRefUpdate.ts  # Create reflog entries
│   ├── readLog.ts       # Read reflog
│   └── writeLog.ts      # Write reflog
├── info/                # .git/info/ (local overrides)
│   └── isIgnored.ts     # Check if file is ignored
├── hooks/               # .git/hooks/ (git hooks)
├── state/               # Temporary state files
│   ├── FETCH_HEAD.ts    # Fetch state
│   ├── MERGE_HEAD.ts    # Merge state
│   └── sequencer/       # Rebase/cherry-pick state
├── bundle/              # Git bundle format
├── lfs/                 # Git LFS operations
├── remote/              # Remote operations
├── forge/               # Git forge adapters (GitHub, GitLab, etc.)
├── merge/               # Merge capability modules
│   ├── mergeBlobs.ts   # Pure algorithm for merging blob content
│   ├── mergeTrees.ts   # Pure algorithm for merging tree structures
│   ├── mergeTree.ts    # Higher-level utility with index management (TO BE MOVED TO GitWorktreeBackend)
│   └── mergeFile.ts    # Merge driver callback
```

**Example:**
```typescript
import { readRef, writeRef } from 'universal-git/git/refs'

// Read a ref
const oid = await readRef({ fs, gitdir, ref: 'refs/heads/main' })

// Write a ref (with automatic reflog)
await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: oid })
```

### Core Utils Layer (`src/core-utils/`)

The **core utils layer** contains low-level utilities and algorithms:

- `Repository.ts` - Repository context object
- `MergeStream.ts` - Merge operation stream
- `algorithms/` - Merge, diff, and other algorithms
- `parsers/` - Various parsers
- `filesystem/` - Filesystem utilities

**Note**: Some parts of this layer are deprecated in favor of `src/git/` functions.

### Models Layer (`src/models/`)

The **models layer** contains data structures and parsers:

- `GitIndex.ts` - Index file parser
- `GitCommit.ts` - Commit object parser
- `GitTree.ts` - Tree object parser
- `GitConfig.ts` - Config file parser
- `GitPackIndex.ts` - Pack index parser
- And more...

### Backends Layer (`src/backends/`)

The **backends layer** provides storage abstractions for Git repository data:

- `GitBackend.ts` - Complete Git repository backend interface (storage + operations)
- `FilesystemBackend.ts` - Filesystem implementation
- `SQLiteBackend.ts` - SQLite implementation
- `InMemoryBackend.ts` - In-memory implementation

See [Backends](./backends.md) for more information.

### Worktree Layer (`src/git/worktree/`)

The **worktree layer** provides working directory abstractions and operations:

```
src/git/worktree/
├── GitWorktreeBackend.ts      # Interface for working directory operations
├── Worktree.ts                 # Thin wrapper class that delegates to backend
├── fs/
│   └── GitWorktreeFs.ts       # Filesystem implementation
├── memory/
│   └── GitWorktreeMemory.ts    # In-memory storage (future)
├── indexeddb/
│   └── GitWorktreeIndexedDb.ts # Browser IndexedDB storage (future)
├── s3/
│   └── GitWorktreeS3.ts        # S3 storage (future)
├── sql/
│   └── GitWorktreeSql.ts       # SQL database storage (future)
└── blob/
    └── GitWorktreeBlob.ts      # Blob storage (future)
```

**Purpose**: Complete working directory abstraction (storage + operations)

**Operations**: All worktree-related operations are unified in `GitWorktreeBackend`:
- File operations: `add()`, `remove()`
- Commit operations: `commit()`
- Branch/checkout: `checkout()`, `switch()`
- Status: `status()`, `statusMatrix()`
- Reset: `reset()`
- Diff: `diff()`
- Sparse checkout: `sparseCheckoutInit()`, `sparseCheckoutSet()`, `sparseCheckoutList()`
- Merge: `mergeTree()` (with index management and worktree file writing)

**Architecture**: `Worktree` class is a thin wrapper that delegates to `GitWorktreeBackend` implementations, enabling chainable API patterns.

See [Worktrees](./worktrees.md) for more information.

## Mapping: Code to `.git` Directory

| `.git` File/Directory | Code Location |
|----------------------|----------------|
| `.git/HEAD` | `src/git/HEAD.ts` |
| `.git/config` | `src/git/config.ts` |
| `.git/index` | `src/git/index/` |
| `.git/objects/` | `src/git/objects/` |
| `.git/refs/` | `src/git/refs/` |
| `.git/logs/` | `src/git/logs/` |
| `.git/info/` | `src/git/info/` |
| `.git/hooks/` | `src/git/hooks/` |
| `.git/state/` | `src/git/state/` |
| `.git/shallow` | `src/git/shallow.ts` |

## How Commands Use Git Operations

Commands typically use git operations like this:

```typescript
// src/commands/commit.ts
import { writeCommit } from '../git/objects/writeCommit.ts'
import { writeRef } from '../git/refs/writeRef.ts'
import { readIndex } from '../git/index/readIndex.ts'

export async function commit({ fs, dir, gitdir, message, ... }) {
  // 1. Read the index
  const index = await readIndex({ fs, gitdir })
  
  // 2. Write the commit object
  const oid = await writeCommit({ fs, gitdir, tree: index.tree, message, ... })
  
  // 3. Update the ref (with automatic reflog)
  await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: oid })
  
  return oid
}
```

## Migration Status

The codebase has been migrated from an older structure to match the `.git` directory:

### ✅ Completed Migrations

- **Index operations** → `src/git/index/`
- **Refs operations** → `src/git/refs/`
- **Object database** → `src/git/objects/`
- **Configuration** → `src/git/config.ts`
- **Shallow operations** → `src/git/shallow.ts`
- **API layer** → `src/commands/`
- **Reflogs** → `src/git/logs/`
- **Hooks** → `src/git/hooks/`
- **State files** → `src/git/state/`

### Removed Directories

- ~~`src/api/`~~ → Migrated to `src/commands/`
- ~~`src/managers/`~~ → Migrated to `src/git/`
- ~~`src/storage/`~~ → Migrated to `src/git/objects/`
- ~~`src/core-utils/odb/`~~ → Migrated to `src/git/objects/`

## Principles

### 1. Single Source of Truth

The `.git` directory files are the source of truth. Code reads and writes directly to these files.

### 2. Direct Operations

Functions in `src/git/` perform direct file operations with minimal abstraction.

### 3. Centralized Ref Operations

All ref operations go through `src/git/refs/` functions to ensure:
- Reflog entries are created
- File locking prevents concurrent writes
- Validation occurs before writing

See [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) for details.

### 4. Backend Abstraction

The codebase uses a unified backend architecture with three types of backends:

**1. `GitBackend`** (`src/backends/GitBackend.ts`)
- **Purpose**: Complete Git repository backend (storage + operations)
- **Storage**: Git repository data (objects, refs, config, index, reflogs, hooks, etc.)
- **Operations**: Repository operations (read/write objects, refs, config, etc.)
- **Remote Operations**: `clone()`, `fetch()`, `push()`, `discover()`, `connect()` (Git protocol)
- **REST API Operations**: `createPullRequest()`, `getIssue()`, `createRelease()`, etc. (optional, for forges)
- **Implementations**: `FilesystemBackend`, `SQLiteBackend`, `InMemoryBackend`, `GitBackendS3` (future), etc.

**2. `GitWorktreeBackend`** (`src/git/worktree/GitWorktreeBackend.ts`)
- **Purpose**: Complete working directory abstraction (storage + operations)
- **Storage**: Working directory files (project files, not Git repository data)
- **Operations**: All worktree-related operations (checkout, commit, add, status, reset, diff, sparseCheckout, mergeTree, etc.)
- **Index Management**: All operations that modify the worktree index (staging area) belong here
- **Implementations**: `GitWorktreeFs`, `GitWorktreeMemory` (future), `GitWorktreeS3` (future), etc.
- **Architecture**: `Worktree` class is a thin wrapper that delegates to `GitWorktreeBackend` implementations

**3. Remote Backends** (future)
- **Purpose**: Git protocol and REST API operations
- **Protocol Support**: HTTP, SSH, file://, git://, REST API
- **Implementations**: `GitProtocolHttp`, `GitProtocolSsh`, `GitForgeHttpApiGithub`, etc.

**Key Distinctions**:
- `GitBackend` = Repository data (objects, refs, config, index) + remote operations
- `GitWorktreeBackend` = Working directory files + worktree operations (checkout, commit, add, mergeTree, status, reset, diff, etc.)
- Both follow the same pattern: interface defines operations, implementations provide storage-specific optimizations
- **Important**: `mergeTree()` with index management belongs in `GitWorktreeBackend` (worktree operation), while pure merge algorithms (`mergeBlobs`, `mergeTrees`) stay in `src/git/merge/` (capability modules)

**Benefits**:
- **Backend-Agnostic**: Operations work with any backend (filesystem, S3, SQL, etc.)
- **Optimization Opportunities**: Each backend can optimize operations (e.g., S3 batching, SQL transactions)
- **Testability**: Easy to mock backends for testing
- **Extensibility**: New backends can provide custom implementations
- **Separation of Concerns**: Clear distinction between repository data and working directory operations

See [Backends](./backends.md) and [Worktrees](./worktrees.md) for more information.

### 5. Merge Capability Modules

The merge system is organized into capability modules (pure algorithms) and higher-level utilities:

**Pure Algorithm Capability Modules** (`src/git/merge/`):
- `mergeBlobs()` - Pure algorithm for merging blob content (strings/buffers)
  - **Use when:** You have raw content to merge, need a pure algorithm, or are implementing merge operations in `cherryPick`/`rebase`
  - **No file system operations** - works with raw content only
- `mergeTrees()` - Pure algorithm for merging tree structures
  - **Use when:** You have tree OIDs and need a merged tree without index management
  - **No index or worktree operations** - only reads/writes Git objects

**Higher-Level Utilities**:
- `mergeTree()` - Higher-level utility with index management and worktree operations
  - **Use when:** You need to merge trees with index management, write conflicted files to worktree, or work with `Repository` and `GitIndex`
  - **Note:** Will be moved to `GitWorktreeBackend` in Phase 0A.1 as it's a worktree-level operation
  - **Why worktree operation?** It manages the worktree index (stages conflicts, updates index), writes conflicted files to the worktree, and uses the worktree's directory for file operations
  - **Future API:** `worktree.mergeTree(ourOid, baseOid, theirOid, options)` will be the preferred API
- `mergeFile()` - **Adapter function** that bridges the `MergeDriverCallback` interface to the `mergeBlobs()` capability module
  - **Use when:** You need a `MergeDriverCallback` for `mergeTree()` operations
  - **Purpose:** Adapter that converts between `MergeDriverCallback` format (`{ branches, contents, path }`) and `mergeBlobs()` format (`{ base, ours, theirs, ourName, theirName }`)
  - **Interface Bridging:** Converts array-based parameters to individual parameters and converts return format from `{ hasConflict }` to `{ cleanMerge }`

**Architecture Benefits:**
- **Single Source of Truth**: Merge algorithm logic lives in `mergeBlobs()` capability module
- **Clear Separation**: Pure algorithms vs. higher-level utilities with file system operations
- **Easier Maintenance**: Changes to merge algorithm only need to be made in one place
- **Better Test Coverage**: Algorithm tests are separate from utility tests

## Finding Code

### "Where is the code that reads the index?"

Look in `src/git/index/readIndex.ts`

### "Where is the code that writes refs?"

Look in `src/git/refs/writeRef.ts`

### "Where is the code that reads commits?"

Look in `src/git/objects/readCommit.ts` or `src/commands/readCommit.ts`

### "Where is the merge logic?"

Look in:
- `src/commands/merge.ts` - High-level merge command
- `src/core-utils/MergeStream.ts` - Merge operation stream
- `src/git/merge/mergeBlobs.ts` - Pure algorithm for merging blob content (capability module)
- `src/git/merge/mergeTrees.ts` - Pure algorithm for merging tree structures (capability module)
- `src/git/merge/mergeTree.ts` - Higher-level utility with index management (TO BE MOVED TO GitWorktreeBackend)
- `src/git/worktree/GitWorktreeBackend.ts` - Future location for `mergeTree()` (worktree operation)

### "Where are worktree operations?"

Look in:
- `src/git/worktree/GitWorktreeBackend.ts` - Interface for all worktree operations
- `src/git/worktree/Worktree.ts` - Thin wrapper class that delegates to backend
- `src/git/worktree/fs/GitWorktreeFs.ts` - Filesystem implementation
- `src/core-utils/Repository.ts` - Repository class with `worktree()` method
- `src/commands/` - Commands that delegate to worktree operations (checkout, commit, add, status, reset, diff, etc.)

### "Where is the clone command?"

Look in `src/commands/clone.ts`

## Benefits of This Structure

1. **Familiar to Git Users**: If you know Git's structure, you know where to find code
2. **Easy to Navigate**: Want index code? Look in `src/git/index/`
3. **Clear Responsibilities**: Each directory has a clear purpose
4. **Less Indirection**: Direct file operations are easier to understand
5. **Better Debugging**: Can trace code to specific `.git` files
6. **Maintainable**: Structure matches Git's organization

## Unified Worktree API

The worktree system provides a unified, chainable API for all worktree operations through the `GitWorktreeBackend` interface and `Worktree` class.

### Chainable API Pattern

The `Worktree` class enables fluent, chainable operations:

```typescript
import { Repository } from 'universal-git'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })
const worktree = await repo.worktree()

// Chainable workflow: checkout -> add -> commit
await worktree
  .checkout('feature-branch', { create: true })
  .then(wt => wt.add(['file1.txt', 'file2.txt']))
  .then(wt => wt.commit('Add new files'))

// Or with async/await
const wt = await repo.worktree()
await wt.checkout('feature-branch', { create: true })
await wt.add(['file1.txt'])
await wt.commit('Add file1.txt')
```

### Worktree Operations

All worktree-related operations are unified in `GitWorktreeBackend`:

- **File Operations**: `add()`, `remove()`
- **Commit Operations**: `commit()`
- **Branch/Checkout**: `checkout()`, `switch()`
- **Status**: `status()`, `statusMatrix()`
- **Reset**: `reset()`
- **Diff**: `diff()`
- **Sparse Checkout**: `sparseCheckoutInit()`, `sparseCheckoutSet()`, `sparseCheckoutList()`
- **Merge**: `mergeTree()` (with index management and worktree file writing)

### Why `mergeTree()` is a Worktree Operation

`mergeTree()` belongs in `GitWorktreeBackend` (not in `git/merge/`) because it:

1. **Manages the worktree index**: Stages conflicts, updates index
2. **Writes conflicted files**: Writes conflicted files to the worktree
3. **Uses worktree directory**: Performs file operations in the worktree's directory

**Distinction**:
- **Pure algorithms** (`mergeBlobs()`, `mergeTrees()`) stay in `git/merge/` as capability modules
- **Worktree operations** (`mergeTree()` with index management) belong in `GitWorktreeBackend`

### Backend Implementations

**Current**:
- `GitWorktreeFs` - Filesystem implementation (default)

**Future** (planned):
- `GitWorktreeMemory` - In-memory storage
- `GitWorktreeIndexedDb` - Browser IndexedDB storage
- `GitWorktreeS3` - S3 storage (AWS S3, compatible services)
- `GitWorktreeSql` - SQL database storage
- `GitWorktreeBlob` - Blob storage (Azure Blob, GCS, etc.)

Each backend can provide optimized implementations (e.g., S3 batching, SQL transactions).

### Architecture Benefits

- **Backend-Agnostic**: Operations work with any backend
- **Optimization Opportunities**: Each backend can optimize operations
- **Testability**: Easy to mock backends for testing
- **Extensibility**: New backends can provide custom implementations
- **Separation of Concerns**: `Worktree` is a thin wrapper, backend handles implementation
- **Consistency**: Matches the pattern used by `GitBackend` (storage + operations in one interface)

For more details, see [Worktrees](./worktrees.md#worktree-architecture).

## See Also

- [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) - How refs work
- [Backends](./backends.md) - Storage backends
- [Repository Class](./repository.md) - Repository context
- [Worktrees](./worktrees.md) - Worktree operations and architecture
- [dir vs gitdir](./dir-vs-gitdir.md) - Working tree vs git directory

