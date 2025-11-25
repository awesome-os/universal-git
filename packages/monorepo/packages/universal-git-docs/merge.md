---
title: Merge
sidebar_label: merge
---

# merge

Merge two branches together, combining their changes into a single branch.

## Overview

The `merge` command:
- Combines changes from two branches
- Creates a merge commit (or fast-forwards if possible)
- Handles conflicts automatically or reports them
- Supports custom merge drivers
- Can abort on conflicts or continue

## Basic Usage

```typescript
import { merge } from 'universal-git'

// Merge a branch into the current branch
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch'
})

console.log(result)
// { oid: 'abc123...', mergeCommit: true }
```

## Examples

### Example 1: Basic Merge

```typescript
// Merge feature-branch into current branch
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch'
})

if (result.mergeCommit) {
  console.log('Merge commit created:', result.oid)
} else if (result.fastForward) {
  console.log('Fast-forward merge:', result.oid)
}
```

### Example 2: Fast-Forward Only

```typescript
// Only merge if it can be fast-forwarded
try {
  const result = await merge({
    fs,
    dir: '/path/to/repo',
    theirs: 'feature-branch',
    fastForwardOnly: true
  })
  console.log('Fast-forwarded:', result.oid)
} catch (error) {
  if (error.code === 'FastForwardError') {
    console.log('Cannot fast-forward, merge required')
  }
}
```

### Example 3: Handle Conflicts

```typescript
try {
  const result = await merge({
    fs,
    dir: '/path/to/repo',
    theirs: 'feature-branch',
    abortOnConflict: true  // Throw error on conflicts
  })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    console.log('Conflicts in:', error.data.filepaths)
    // Resolve conflicts manually, then commit
  }
}
```

### Example 4: Custom Merge Message

```typescript
// Merge with custom commit message
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch',
  message: 'Merge feature-branch into main'
})
```

### Example 5: Custom Merge Driver

```typescript
// Use custom merge driver for conflict resolution
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch',
  mergeDriver: ({ branches, contents, path }) => {
    // Custom merge logic
    const [base, ours, theirs] = contents
    
    // Simple strategy: prefer theirs
    return {
      cleanMerge: true,
      mergedText: theirs
    }
  }
})
```

### Example 6: Dry Run

```typescript
// Test merge without actually merging
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch',
  dryRun: true
})

console.log('Would create merge commit:', result.oid)
// No actual merge performed
```

## API Reference

### `merge(options)`

Merge two branches.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ours` - Branch to merge into (optional, defaults to current branch)
- `theirs` - Branch to merge from (required)
- `fastForward` - Allow fast-forward merge (optional, default: `true`)
- `fastForwardOnly` - Only allow fast-forward (optional, default: `false`)
- `dryRun` - Don't actually merge (optional, default: `false`)
- `noUpdateBranch` - Don't update branch ref (optional, default: `false`)
- `abortOnConflict` - Throw error on conflicts (optional, default: `true`)
- `message` - Merge commit message (optional)
- `author` - Author information (optional)
- `committer` - Committer information (optional)
- `signingKey` - Key ID for signing (optional)
- `onSign` - Signing callback (optional)
- `allowUnrelatedHistories` - Allow merging unrelated histories (optional, default: `false`)
- `mergeDriver` - Custom merge driver function (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<MergeResult>` - Merge operation result

**MergeResult:**
```typescript
{
  oid?: string           // Commit OID (if merge commit created)
  alreadyMerged?: boolean // True if branches were already merged
  fastForward?: boolean   // True if fast-forward merge occurred
  mergeCommit?: boolean   // True if merge commit was created
  tree?: string          // Tree OID of the merge result
}
```

## How Merge Works

1. **Finds the merge base** (common ancestor) of the two branches
2. **Determines merge type**:
   - If one branch is ahead: fast-forward (if allowed)
   - If branches diverged: create merge commit
   - If already merged: no-op
3. **Merges the trees** using three-way merge algorithm
4. **Handles conflicts**:
   - If conflicts found and `abortOnConflict: true`: throws `MergeConflictError`
   - If conflicts found and `abortOnConflict: false`: marks conflicts in index
5. **Creates merge commit** (if needed) with both branches as parents
6. **Updates branch ref** to point to the merge result

## Merge Types

### Fast-Forward Merge

When one branch is directly ahead of another:

```typescript
// Current: A -> B -> C
// Theirs:  A -> B -> C -> D -> E
// Result:  A -> B -> C -> D -> E (fast-forward)
const result = await merge({ fs, dir, theirs: 'feature-branch' })
// result.fastForward === true
```

### Merge Commit

When branches have diverged:

```typescript
// Current: A -> B -> C
// Theirs:  A -> B -> D -> E
// Result:  A -> B -> C -> F (merge commit with parents C and E)
//          A -> B -> D -> E /
const result = await merge({ fs, dir, theirs: 'feature-branch' })
// result.mergeCommit === true
```

### Already Merged

When the branches are already merged:

```typescript
// Current: A -> B -> C -> D (merge commit)
// Theirs:  A -> B -> E
// Result:  Already merged, no action needed
const result = await merge({ fs, dir, theirs: 'feature-branch' })
// result.alreadyMerged === true
```

## Conflict Handling

### Automatic Conflict Detection

Conflicts occur when:
- The same file was modified in both branches
- Changes overlap in ways that can't be automatically merged

### Abort on Conflict

```typescript
// Throw error when conflicts detected
try {
  await merge({
    fs,
    dir: '/path/to/repo',
    theirs: 'feature-branch',
    abortOnConflict: true  // Default
  })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    const conflicts = error.data.filepaths
    console.log('Conflicts in:', conflicts)
    // Resolve conflicts manually, then commit
  }
}
```

### Continue on Conflict

```typescript
// Mark conflicts but don't throw error
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch',
  abortOnConflict: false
})

// Check for conflicts in index
const index = await readIndex({ fs, gitdir })
const conflictedFiles = index.unmergedPaths
if (conflictedFiles.length > 0) {
  // Resolve conflicts, then commit
}
```

## Best Practices

### 1. Check Status Before Merging

```typescript
// Ensure working directory is clean
const status = await statusMatrix({ fs, dir })
const hasChanges = status.some(([filepath, head, index, workdir]) => {
  return index !== head || workdir !== index
})

if (hasChanges) {
  // Commit or stash changes first
  await commit({ fs, dir, message: 'Save work' })
}
```

### 2. Use Fast-Forward When Appropriate

```typescript
// Prefer fast-forward for cleaner history
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch',
  fastForward: true  // Default
})
```

### 3. Handle Conflicts Gracefully

```typescript
try {
  await merge({ fs, dir, theirs: 'feature-branch' })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    // Resolve conflicts
    // ... resolve conflicts ...
    // Then commit
    await commit({ fs, dir, message: 'Merge feature-branch' })
  }
}
```

## Limitations

1. **Conflicts**: Must be resolved manually
2. **Unrelated Histories**: Requires `allowUnrelatedHistories: true`
3. **Merge Drivers**: Custom merge drivers are limited to text files

## Troubleshooting

### Fast-Forward Error

If fast-forward is required but not possible:

```typescript
try {
  await merge({ fs, dir, theirs: 'feature-branch', fastForwardOnly: true })
} catch (error) {
  if (error.code === 'FastForwardError') {
    // Use regular merge instead
    await merge({ fs, dir, theirs: 'feature-branch' })
  }
}
```

### Unrelated Histories

If branches have no common ancestor:

```typescript
// Allow merging unrelated histories
await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'unrelated-branch',
  allowUnrelatedHistories: true
})
```

## Merge Architecture

The merge system is organized into capability modules (pure algorithms) and higher-level utilities:

### Pure Algorithm Capability Modules

**`mergeBlobs()`** - Pure algorithm for merging blob content
- **Location**: `src/git/merge/mergeBlobs.ts`
- **Purpose**: Stateless capability module that performs three-way merge on raw content
- **Input**: `{ base, ours, theirs, ourName?, theirName? }` (strings or UniversalBuffer)
- **Output**: `{ mergedContent: UniversalBuffer, hasConflict: boolean }`
- **Use when**: You have raw content to merge, need a pure algorithm, or are implementing merge operations in `cherryPick`/`rebase`
- **No file system operations** - works with raw content only

**`mergeTrees()`** - Pure algorithm for merging tree structures
- **Location**: `src/git/merge/mergeTrees.ts`
- **Purpose**: Stateless capability module that performs recursive three-way merge on trees
- **Input**: `{ fs, cache, gitdir, base, ours, theirs }` (tree OIDs)
- **Output**: `{ mergedTree: TreeEntry[], mergedTreeOid: string, conflicts: string[] }`
- **Use when**: You have tree OIDs and need a merged tree without index management
- **No index or worktree operations** - only reads/writes Git objects

### Higher-Level Utilities

**`mergeTree()`** - Higher-level utility with index management
- **Location**: `src/git/merge/mergeTree.ts` (will be moved to `GitWorktreeBackend` in Phase 0A.1)
- **Purpose**: Merges trees with index management and worktree operations
- **Input**: `{ repo, index, ourOid, baseOid, theirOid, ... }`
- **Output**: `string | MergeConflictError` (tree OID or error)
- **Use when**: You need to merge trees with index management, write conflicted files to worktree, or work with `Repository` and `GitIndex`
- **Note**: This is a worktree-level operation and will be moved to `GitWorktreeBackend`

**`mergeFile()`** - Adapter function for merge drivers
- **Location**: `src/git/merge/mergeFile.ts`
- **Purpose**: Adapter that bridges the `MergeDriverCallback` interface to the `mergeBlobs()` capability module
- **Input**: `{ branches: [baseName, ourName, theirName], contents: [baseContent, ourContent, theirContent], path? }`
- **Output**: `{ cleanMerge: boolean, mergedText: string }`
- **Use when**: You need a `MergeDriverCallback` for `mergeTree()` operations
- **Interface Bridging**: Converts between `MergeDriverCallback` format and `mergeBlobs()` format

### How They Work Together

```
┌─────────────────────────────────────────────────────────────┐
│                    merge() command                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              MergeStream.ts                                  │
│  (Manages merge process, emits events)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         mergeTree() (Higher-level utility)                   │
│  - Manages GitIndex                                          │
│  - Writes conflicted files to worktree                       │
│  - Calls mergeBlobs() helper for each file                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│    mergeBlobs() helper (in mergeTree.ts)                     │
│  - Extracts content from WalkerEntry objects                 │
│  - Calls mergeFile() adapter OR mergeBlobs() capability      │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────┐         ┌──────────────────┐
│  mergeFile()     │         │  mergeBlobs()    │
│  (Adapter)       │────────▶│  (Capability)    │
│                  │         │                  │
│  Converts:       │         │  Pure algorithm │
│  - Array params  │         │  - diff3Merge    │
│  - Return format │         │  - Conflict      │
│                  │         │    markers       │
└──────────────────┘         └──────────────────┘
```

### Single Source of Truth

The merge algorithm logic lives in the `mergeBlobs()` capability module. Both `mergeFile()` (adapter) and `mergeTree()`'s `mergeBlobs()` helper use this capability module internally, ensuring:

- **No code duplication**: Merge algorithm logic exists in one place
- **Consistent behavior**: All merge operations use the same algorithm
- **Easier maintenance**: Changes to merge algorithm only need to be made once
- **Better testability**: Algorithm tests are separate from utility tests

### When to Use Each Function

**Use `mergeBlobs()` capability module** when:
- You have raw content (strings/buffers) to merge
- You need a pure algorithm (no file system operations)
- You're implementing merge operations in `cherryPick` or `rebase`
- You want to merge content without writing to Git object database

**Use `mergeTrees()` capability module** when:
- You have tree OIDs and need a merged tree
- You need a pure algorithm (no index management)
- You're implementing merge logic in commands like `cherryPick`, `rebase`

**Use `mergeTree()` utility** when:
- You need to merge trees with index management
- You need to write conflicted files to the worktree
- You're working with `Repository` and `GitIndex` in higher-level operations

**Use `mergeFile()` adapter** when:
- You need a `MergeDriverCallback` for `mergeTree()` operations
- You want the default merge behavior (uses `mergeBlobs()` capability module)
- You're implementing a custom merge driver that wraps `mergeBlobs()`

For more details, see [Merge Driver](./mergeDriver.md) and [Architecture](./architecture.md#5-merge-capability-modules).

## See Also

- [Abort Merge](./abort-merge.md) - Abort merge in progress
- [Cherry Pick](./cherry-pick.md) - Apply individual commits
- [Rebase](./rebase.md) - Rebase branches
- [Status](./status.md) - Check repository status
- [Merge Driver](./mergeDriver.md) - Custom merge drivers
- [Architecture](./architecture.md#5-merge-capability-modules) - Merge capability modules


