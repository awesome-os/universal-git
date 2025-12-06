This follow-up plan moves beyond the core "Plumbing" and into the "Porcelain" and "Optimization" layers.

This is where the **Virtual `gitDir` Architecture** truly pays off. Features like Partial Clones and LFS are difficult to bolt onto a monolithic backend, but here they are simply new **Providers** and **Smart Handles** that intercept standard calls.

---

## Phase 5: Advanced Worktree Projection (Sparse Checkout)

**Goal:** Support monorepos where the user only checks out a small subset of files (Cone Mode).

### 1. The Manager: `SparseCheckoutManager`
**Location:** `.git/info/sparse-checkout`
**Responsibility:** Parse patterns and decide what belongs in the Worktree.

*   **Logic (Cone Mode):** Unlike standard regex gitignore, Cone Mode is strictly prefix-based.
    *   *Include:* Root files.
    *   *Include:* Recursive contents of specified directories.
    *   *Performance:* $O(1)$ lookup via Set/Hash Map, rather than $O(N)$ regex matching.

### 2. The Integration: `GitIndexHandle` Extension
The Index is the source of truth for sparse checkout via the `skip-worktree` bit.

```typescript
// handles/GitIndexHandle.ts (Extension)

export class GitIndexHandle extends GitBaseHandle {
  // ... existing methods ...

  /**
   * Updates the 'skip-worktree' bit for all entries based on 
   * the current SparseCheckoutManager patterns.
   */
  async applySparsePatterns(manager: SparseCheckoutManager): Promise<void> {
    for (const entry of this.entries()) {
      const shouldBeInWorktree = manager.matches(entry.path);
      // If matches, clear skip-worktree. If not, set it.
      entry.flags.skipWorktree = !shouldBeInWorktree;
    }
    await this.flush();
  }
}
```

### 3. The View: `WorktreeDir` Projection
The `WorktreeDir` (where user files live) must effectively "hide" files that are in the Index but marked `skip-worktree`.

*   **Operation:** When `checkout` runs, it consults the Index.
*   **Logic:**
    *   If `entry.skipWorktree == true`: Do **not** write file to disk.
    *   If `entry.skipWorktree == false`: Write file to disk.

---

## Phase 6: Partial Clones (Promisor Remotes)

**Goal:** "Clone" a repo without downloading blobs. Fetch them only when read.

### 1. The Configuration: `PromisorConfig`
*   Read `.git/config`: `extensions.partialClone = origin`.
*   Read `.git/config`: `remote.origin.promisor = true`.

### 2. The Smart Handle: `PromisorObjectHandle`
This is a wrapper around a standard `GitObjectHandle`.

```typescript
// handles/PromisorObjectHandle.ts
import { GitObjectHandle } from './GitObjectHandle';

export class PromisorObjectHandle extends GitObjectHandle {
  constructor(
    private oid: string,
    private localProvider: GitDirObjectsProvider,
    private remoteFetcher: SmartProtocolFetcher
  ) { super(); }

  async readParsed() {
    // 1. Try Local (Fast)
    const local = await this.localProvider.getHandle([this.oid]);
    if (local) return local.readParsed();

    // 2. Local Miss -> Trigger Network Fetch (Slow)
    // "I promise I can get this object"
    await this.remoteFetcher.fetchObjects([this.oid]);

    // 3. Retry Local
    const retry = await this.localProvider.getHandle([this.oid]);
    return retry.readParsed();
  }
}
```

### 3. The Provider Logic
The `GitDirObjectsProvider` acts as the orchestrator.

*   **Init:** Check config. If partial clone is active, initialize the `PromisorRemote`.
*   **GetHandle:** If object is missing locally, do not return `null`. Return a `PromisorObjectHandle` configured for that OID.

---

## Phase 7: Data Transformation (Git LFS)

**Goal:** Store large binaries in a separate server, keeping the Git repo light.

### 1. The Filter Pipeline
We introduce a `FilterManager` that sits between the **ODB** and the **Worktree**.

*   **Clean (Worktree -> ODB):** Turn big file -> Pointer file.
*   **Smudge (ODB -> Worktree):** Turn Pointer file -> Big file.

### 2. The Smart Handle: `LFSWorktreeHandle`
When the Worktree accesses a file that tracks via LFS attributes.

```typescript
// handles/LFSWorktreeHandle.ts

export class LFSWorktreeHandle extends GitBaseHandle {
  
  /**
   * SMUDGE: Reading from Object DB to write to Disk.
   * Instead of writing the 100 bytes pointer, download the 1GB file.
   */
  async writeSmudge(pointerContent: Uint8Array): Promise<void> {
    const pointer = LFSPtrParser.parse(pointerContent);
    
    // 1. Check LFS Cache (usually .git/lfs/objects/...)
    const cached = await lfsCache.get(pointer.oid);
    
    if (cached) {
      await this.native.write(cached);
    } else {
      // 2. Download from LFS Server via HTTP
      const data = await lfsClient.download(pointer.oid);
      await this.native.write(data);
    }
  }
}
```

---

## Phase 8: Optimization (Commit Graph & Reachability)

**Goal:** Instant `git log` and `git merge-base` on repos with 1M+ commits.

### 1. The Entity: `CommitGraphFile`
**Location:** `.git/objects/info/commit-graph`
**Format:** Binary chunk-based format (Generation Numbers, Parent OIDs).

### 2. The Provider Enhancement: `GraphBackedWalker`
Instead of walking raw Commit Objects (which requires inflating zlib blobs for every step), we walk the binary graph.

```typescript
// algorithms/GraphWalker.ts

export class GraphWalker {
  constructor(private graphHandle: CommitGraphHandle) {}

  async findMergeBase(oidA: string, oidB: string): Promise<string> {
    // 1. Get Generation Numbers (Integer comparison is instant)
    const genA = await this.graphHandle.getGeneration(oidA);
    const genB = await this.graphHandle.getGeneration(oidB);

    // 2. Walk down efficiently without parsing full commit bodies
    // ...
  }
}
```

---

## Phase 9: Shallow Repository Support

**Goal:** Support `git clone --depth 1`.

### 1. The File: `.git/shallow`
Contains a list of OIDs that are "cut off" points.

### 2. The Logic: `ShallowBoundary`
*   **Provider Logic:** When walking ancestry, if an OID exists in `.git/shallow`, stop walking. It has no parents (virtually).
*   **Network Logic:** When fetching, we must send "shallow" OIDs to the server so it knows where our history stops.

---

## Implementation Roadmap Summary

| Phase | Feature | Key Component to Implement | Architectural Impact |
| :--- | :--- | :--- | :--- |
| **5** | **Sparse Checkout** | `SparseCheckoutManager` & `IndexHandle.skipWorktree` | Decouples Index "Entry" from Worktree "File". |
| **6** | **Partial Clone** | `PromisorObjectHandle` | `read()` becomes async network operation. |
| **7** | **Git LFS** | `FilterPipeline` & `LFSHandle` | Adds transformation layer on IO. |
| **8** | **Commit Graph** | `CommitGraphHandle` | Replaces `readParsed()` loops with binary lookups. |
| **9** | **Shallow** | `ShallowBoundary` | Modifies ancestry traversal termination conditions. |