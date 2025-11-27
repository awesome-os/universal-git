---
title: Worktrees
sidebar_label: Worktrees
---

# Worktrees

Git worktrees allow you to check out multiple branches of the same repository simultaneously. Each worktree has its own working directory but shares the same `.git` directory.

## Overview

Worktrees enable you to:
- Work on multiple branches at the same time
- Test different branches without switching
- Keep separate working directories for different features
- Share the same repository data (objects, refs, config)

## Basic Usage

### Add a Worktree

```typescript
import { worktree } from 'universal-git'

// Add a new worktree for a branch
const result = await worktree({
  fs,
  dir: '/path/to/main/repo',
  add: true,
  path: '/path/to/new/worktree',
  ref: 'feature-branch'
})

console.log(result)
// { path: '/path/to/new/worktree', HEAD: 'abc123...' }
```

### List Worktrees

```typescript
// List all worktrees
const worktrees = await worktree({
  fs,
  dir: '/path/to/repo',
  list: true
})

console.log(worktrees)
// [
//   { path: '/path/to/main/repo', HEAD: 'abc123...', branch: 'main' },
//   { path: '/path/to/worktree', HEAD: 'def456...', branch: 'feature-branch' }
// ]
```

### Remove a Worktree

```typescript
// Remove a worktree
await worktree({
  fs,
  dir: '/path/to/main/repo',
  remove: true,
  path: '/path/to/worktree'
})
```

## Repository and Multiple Worktrees

`Repository` is a thin wrapper that manages:
- **1 `GitBackend`** (always present) - handles all Git repository data
- **Multiple linked worktree checkouts** (optional) - each with its own `WorktreeBackend` instance

### Opening a Repository with a Worktree

When working with linked worktrees, you can use `Repository.open()` with both `dir` and `gitdir` parameters:

```typescript
import { Repository } from 'universal-git'

// Open a linked worktree
// gitdir points to the main repository's .git directory
// dir points to the worktree checkout directory
const repo = await Repository.open({
  fs,
  dir: '/path/to/worktree',           // Worktree checkout directory
  gitdir: '/path/to/main-repo/.git', // Main repository gitdir
  cache: {},
})
```

**Important**: When both `dir` and `gitdir` are provided, `Repository.open()` treats this as a linked worktree scenario:
- **`gitdir`** === bare repository (or main repository) - the path to the `.git` directory
- **`dir`** === linked worktree checkout - the working directory

The worktree's `.git` is typically a **file** (not a directory) pointing to the gitdir. The implementation treats the gitdir as a bare repository and uses the dir as the working directory. No inference is performed - the provided paths are used as-is.

### Creating Worktrees with Custom Backends

You can create worktrees with specific `WorktreeBackend` types:

```typescript
import { Repository } from 'universal-git'
import { GitWorktreeS3 } from 'universal-git/git/worktree/s3'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })

// Create a worktree with a custom backend (e.g., S3 storage)
const worktree = await repo.createWorktree(
  '/path/to/s3-worktree',
  'feature-branch',
  's3-worktree',
  {
    worktreeBackendFactory: (dir) => {
      // Create a custom backend for this worktree
      return new GitWorktreeS3(s3Client, bucket, `${prefix}/${dir}`)
    }
  }
)

// Or pass a pre-created backend instance
const s3Backend = new GitWorktreeS3(s3Client, bucket, prefix)
const worktree2 = await repo.createWorktree(
  '/path/to/another-s3-worktree',
  'other-branch',
  's3-worktree-2',
  {
    worktreeBackend: s3Backend
  }
)
```

### Managing Multiple Worktrees

```typescript
// Get worktree by name
const worktree = repo.getWorktreeByName('feature-worktree')

// Get worktree by the ref it's checked out to
const worktreeByRef = await repo.getWorktree('feature-branch')
// Searches all worktrees (main + linked) to find which one has 'feature-branch' checked out

// Get worktree by directory path
const worktreeByPath = repo.getWorktreeByPath('/path/to/worktree')

// List all worktrees (returns array)
const allWorktrees = repo.listWorktrees()
// Or use the property getter
const worktrees = repo.worktrees

// Access worktree properties
for (const worktree of allWorktrees) {
  console.log(`Worktree: ${worktree.getName() || 'main'}, Dir: ${worktree.dir}`)
}
```

For more details, see [Repository.open() Behavior](./repository.md#linked-worktree-pattern) and [dir vs gitdir](./dir-vs-gitdir.md#linked-worktree-pattern).

## Examples

### Example 1: Working on Multiple Branches

```typescript
import { worktree, checkout, commit } from 'universal-git'

// Main repository
const mainDir = '/path/to/repo'

// Create worktree for feature branch
await worktree({
  fs,
  dir: mainDir,
  add: true,
  path: '/path/to/feature-worktree',
  ref: 'feature-branch'
})

// Now you can work in both directories:
// - /path/to/repo (main branch)
// - /path/to/feature-worktree (feature-branch)

// Make commits in feature worktree
await commit({
  fs,
  dir: '/path/to/feature-worktree',
  message: 'Feature work'
})

// Switch branches in main repo without affecting feature worktree
await checkout({
  fs,
  dir: mainDir,
  ref: 'other-branch'
})
```

### Example 2: Detached HEAD Worktree

```typescript
// Create worktree with detached HEAD
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/detached-worktree',
  ref: 'abc123...',  // Commit SHA
  detach: true
})
```

### Example 3: Force Add Worktree

```typescript
// Force add worktree (removes existing directory if needed)
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/worktree',
  ref: 'feature-branch',
  force: true  // Remove existing directory if it exists
})
```

### Example 4: Lock and Unlock Worktree

```typescript
// Lock a worktree (prevents accidental removal)
await worktree({
  fs,
  dir: '/path/to/repo',
  lock: true,
  path: '/path/to/worktree',
  reason: 'Long-running operation in progress'
})

// Later, unlock it
await worktree({
  fs,
  dir: '/path/to/repo',
  unlock: true,
  path: '/path/to/worktree'
})
```

### Example 5: Prune Worktrees

```typescript
// Remove worktrees that no longer exist on disk
const result = await worktree({
  fs,
  dir: '/path/to/repo',
  prune: true
})

console.log(result)
// { pruned: ['/path/to/missing/worktree'] }
```

## API Reference

### `worktree(options)`

Manages Git worktrees.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Main repository directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `add` - Add a new worktree (boolean)
- `list` - List all worktrees (boolean)
- `remove` - Remove a worktree (boolean)
- `prune` - Prune missing worktrees (boolean)
- `lock` - Lock a worktree (boolean)
- `unlock` - Unlock a worktree (boolean)
- `status` - Get worktree status (boolean)
- `path` - Worktree path (required for add/remove/lock/unlock/status)
- `ref` - Branch or commit to check out (required for add)
- `name` - Branch name for new branch (optional, for add)
- `force` - Force operation (boolean, optional)
- `detach` - Create detached HEAD (boolean, optional)
- `reason` - Lock reason (optional, for lock)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<WorktreeInfo[] | WorktreeInfo | { removed: string } | { pruned: string[] } | { locked: string } | { unlocked: string } | unknown>` - Operation result

**Operations:**

1. **`add`** - Add a new worktree
   - Creates a new working directory
   - Checks out the specified branch or commit
   - Links to the main repository's `.git` directory

2. **`list`** - List all worktrees
   - Returns array of worktree information
   - Includes path, HEAD, and branch name

3. **`remove`** - Remove a worktree
   - Removes the worktree directory
   - Cleans up worktree metadata
   - Use `force: true` to remove locked worktrees

4. **`prune`** - Prune missing worktrees
   - Removes worktree entries that no longer exist on disk
   - Cleans up orphaned worktree metadata

5. **`lock`** - Lock a worktree
   - Prevents accidental removal
   - Stores a reason (optional)

6. **`unlock`** - Unlock a worktree
   - Removes the lock
   - Allows removal

7. **`status`** - Get worktree status
   - Returns worktree information
   - Includes lock status if locked

## How Worktrees Work

### Directory Structure

When you create a worktree:

```
/path/to/main-repo/
├── .git/                    # Main repository
│   ├── worktrees/          # Worktree metadata
│   │   └── worktree-name/
│   │       ├── gitdir      # Points to worktree's .git
│   │       ├── HEAD        # Worktree HEAD
│   │       └── locked      # Lock file (if locked)
│   └── ...
└── ...                      # Main working directory

/path/to/worktree/
├── .git                     # Symlink or file pointing to main .git
└── ...                      # Worktree working directory
```

### Shared Repository Data

All worktrees share:
- Object database (`.git/objects/`)
- References (`.git/refs/`)
- Configuration (`.git/config`)
- Hooks (`.git/hooks/`)

Each worktree has its own:
- Working directory files
- Index (`.git/worktrees/<name>/index`)
- HEAD pointer

## Best Practices

### 1. Use Descriptive Paths

```typescript
// ✅ Good: Descriptive path
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/repo-feature-auth',
  ref: 'feature-auth'
})

// ❌ Bad: Generic path
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/temp',
  ref: 'feature-auth'
})
```

### 2. Clean Up Unused Worktrees

```typescript
// Periodically prune missing worktrees
await worktree({
  fs,
  dir: '/path/to/repo',
  prune: true
})
```

### 3. Lock Important Worktrees

```typescript
// Lock worktrees that are in use
await worktree({
  fs,
  dir: '/path/to/repo',
  lock: true,
  path: '/path/to/worktree',
  reason: 'CI/CD testing in progress'
})
```

### 4. Use Force Sparingly

```typescript
// Only use force when necessary
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/worktree',
  ref: 'feature-branch',
  force: true  // Only if you're sure
})
```

## Limitations

1. **Same Branch**: You cannot check out the same branch in multiple worktrees
2. **Bare Repositories**: Worktrees require a non-bare repository
3. **Submodules**: Worktrees with submodules may have limitations
4. **File System**: Some file systems may not support all worktree features

## Troubleshooting

### Worktree Already Exists

If you get an error that the worktree already exists:

```typescript
// Remove existing worktree first
await worktree({
  fs,
  dir: '/path/to/repo',
  remove: true,
  path: '/path/to/worktree'
})

// Then add it again
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/worktree',
  ref: 'feature-branch'
})
```

### Cannot Remove Locked Worktree

If a worktree is locked:

```typescript
// Unlock it first
await worktree({
  fs,
  dir: '/path/to/repo',
  unlock: true,
  path: '/path/to/worktree'
})

// Then remove it
await worktree({
  fs,
  dir: '/path/to/repo',
  remove: true,
  path: '/path/to/worktree'
})

// Or force remove
await worktree({
  fs,
  dir: '/path/to/repo',
  remove: true,
  path: '/path/to/worktree',
  force: true
})
```

### Worktree Path Not Found

If the worktree path doesn't exist:

```typescript
// Check if worktree exists
const worktrees = await worktree({
  fs,
  dir: '/path/to/repo',
  list: true
})

console.log(worktrees) // Check if path is in the list
```

## Worktree Architecture

### GitWorktreeBackend Interface

The worktree system is built on the `GitWorktreeBackend` interface, which provides a unified API for all worktree operations. This enables:

- **Backend-Agnostic Operations**: Work with any backend (filesystem, S3, SQL, etc.)
- **Optimized Implementations**: Each backend can provide optimized versions of operations
- **Consistent API**: All worktree operations follow the same pattern
- **Chainable Operations**: Enable fluent API patterns for common workflows

### Worktree Operations

All worktree-related operations are unified in the `GitWorktreeBackend` interface:

- **File Operations**: `add()`, `remove()`
- **Commit Operations**: `commit()`
- **Branch/Checkout Operations**: `checkout()`, `switch()`
- **Status Operations**: `status()`, `statusMatrix()`
- **Reset Operations**: `reset()`
- **Diff Operations**: `diff()`
- **Sparse Checkout**: `sparseCheckoutInit()`, `sparseCheckoutSet()`, `sparseCheckoutList()`
- **Merge Operations**: `mergeTree()` (with index management and worktree file writing)

### Chainable API Pattern

The `Worktree` class provides a thin wrapper that delegates to `GitWorktreeBackend`, enabling chainable operations:

```typescript
import { Repository } from 'universal-git'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })
const worktree = await repo.worktree()

// Chainable workflow: checkout -> add -> commit
await worktree
  .checkout('feature-branch', { create: true })
  .then(wt => wt.add(['file1.txt', 'file2.txt']))
  .then(wt => wt.commit('Add new files'))

// Or with async/await for better readability
const wt = await repo.worktree()
await wt.checkout('feature-branch', { create: true })
await wt.add(['file1.txt'])
await wt.commit('Add file1.txt')

// Switch branches and check status
await wt.switch('main')
const status = await wt.status()

// Reset and sparse checkout
await wt.reset('HEAD', 'hard')
await wt.sparseCheckoutSet(['src/'], true)
```

### Merge Operations in Worktree

**Important**: `mergeTree()` is a worktree-level operation, not a pure algorithm. It belongs in `GitWorktreeBackend` because it:

- **Manages the worktree index**: Stages conflicts, updates index
- **Writes conflicted files**: Writes conflicted files to the worktree
- **Uses worktree directory**: Performs file operations in the worktree's directory

**Usage**:

```typescript
const repo = await Repository.open({ fs, dir: '/path/to/repo' })
const worktree = await repo.worktree()

// Merge trees with index management
const mergedTreeOid = await worktree.mergeTree(
  ourOid,
  baseOid,
  theirOid,
  {
    abortOnConflict: false,
    ourName: 'main',
    theirName: 'feature'
  }
)

if (typeof mergedTreeOid === 'string') {
  console.log('Merge successful:', mergedTreeOid)
} else {
  // Handle MergeConflictError
  console.log('Conflicts in:', mergedTreeOid.filepaths)
}
```

**Note**: Pure merge algorithms (`mergeBlobs()`, `mergeTrees()`) stay in `git/merge/` as capability modules. They are stateless and don't interact with the worktree. Only `mergeTree()` with index management belongs in `GitWorktreeBackend`.

### Relationship to GitBackend

The architecture distinguishes between two types of backends:

- **`GitBackend`**: Repository data (objects, refs, config, index) + remote operations
- **`GitWorktreeBackend`**: Working directory files + worktree operations (checkout, commit, add, mergeTree, status, reset, diff, etc.)

Both follow the same pattern: interface defines operations, implementations provide storage-specific optimizations.

### Backend Implementations

**Current Implementations**:
- `GitWorktreeFs` - Filesystem implementation (default for most use cases)

**Future Implementations** (planned):
- `GitWorktreeMemory` - In-memory storage
- `GitWorktreeIndexedDb` - Browser IndexedDB storage
- `GitWorktreeS3` - S3 storage (AWS S3, compatible services)
- `GitWorktreeSql` - SQL database storage
- `GitWorktreeBlob` - Blob storage (Azure Blob, GCS, etc.)

Each backend can provide optimized implementations. For example:
- S3 backend can batch operations
- SQL backend can use transactions
- Memory backend can provide fast in-memory operations

### Migration Path

The unified worktree API is being gradually introduced:

1. **Current State**: Commands (`checkout`, `commit`, `add`, `status`, `reset`, `mergeTree`, etc.) work standalone
2. **Future State**: Commands will internally delegate to `Worktree` methods
3. **Preferred API**: Use `worktree().*()` methods for chainable, context-aware operations

**Backward Compatibility**: All existing commands remain available. The new API is additive, not a replacement.

For more details, see:
- [Merge Architecture](./merge.md#merge-architecture) - Merge capability modules vs. worktree operations
- [Architecture](./architecture.md#5-merge-capability-modules) - Merge capability modules
- [Repository](./repository.md) - Repository class and worktree integration

## See Also

- [Checkout](./checkout.md) - Checkout operations
- [Branch](./branch.md) - Branch management
- [Repository](./repository.md) - Repository class
- [Merge](./merge.md) - Merge operations and architecture
- [Architecture](./architecture.md#5-merge-capability-modules) - Merge capability modules

