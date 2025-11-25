---
title: Rebase
sidebar_label: rebase
---

# rebase

Re-applies commits from the current branch on top of another branch, creating a linear history.

## Overview

Rebase allows you to:
- Move commits from one branch to another
- Create a linear commit history
- Clean up commit history before merging
- Apply commits on top of the latest changes

## Basic Usage

```typescript
import { rebase } from 'universal-git'

// Rebase current branch onto another branch
const result = await rebase({
  fs,
  dir: '/path/to/repo',
  upstream: 'main'
})

console.log(result)
// { oid: 'abc123...' } - New HEAD after rebase
```

## Examples

### Example 1: Basic Rebase

```typescript
import { rebase, checkout, log } from 'universal-git'

// Switch to feature branch
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})

// Rebase onto main
const result = await rebase({
  fs,
  dir: '/path/to/repo',
  upstream: 'main'
})

console.log('Rebase complete:', result.oid)
```

### Example 2: Handle Conflicts

```typescript
try {
  const result = await rebase({
    fs,
    dir: '/path/to/repo',
    upstream: 'main'
  })
  console.log('Rebase successful:', result.oid)
} catch (error) {
  if (error.code === 'MergeConflictError') {
    console.log('Conflicts during rebase:', error.data.filepaths)
    // Resolve conflicts manually
    // Then continue or abort
  }
}
```

### Example 3: Continue Rebase

```typescript
// If rebase is in progress, continue it
const result = await rebase({
  fs,
  dir: '/path/to/repo',
  upstream: 'main'
})

// Rebase will continue from where it left off
```

## API Reference

### `rebase(options)`

Re-applies commits on top of another base.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `upstream` - Branch or commit to rebase onto (required)
- `branch` - Branch to rebase (optional, defaults to current branch)
- `interactive` - Interactive rebase mode (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<RebaseResult>` - Object with `oid` (new HEAD) and optional `conflicts` array

**RebaseResult:**
```typescript
{
  oid: string           // New HEAD after rebase
  conflicts?: string[]  // Array of conflicted file paths (if conflicts occur)
}
```

## How Rebase Works

1. **Finds the merge base** between current branch and upstream
2. **Saves the current branch state** (ORIG_HEAD)
3. **Resets the branch** to the upstream commit
4. **Re-applies each commit** from the original branch one by one
5. **Creates new commits** with the same changes but different parents
6. **Updates the branch ref** to point to the new commits

## Important Notes

### ⚠️ Rewrites History

**WARNING**: Rebase rewrites commit history:
- **Original commits are replaced** with new commits
- **Commit hashes change** (different parents)
- **Don't rebase commits that have been pushed** if others are using them

### Conflicts

Rebase may cause conflicts when:
- The same files were modified in both branches
- Changes overlap in ways that can't be automatically merged

When conflicts occur:
- The rebase pauses
- You must resolve conflicts manually
- Then continue or abort the rebase

### Interactive Mode

Interactive rebase (`interactive: true`) is planned but not yet fully implemented. Currently, all commits are re-applied automatically.

## Best Practices

### 1. Rebase Before Merging

```typescript
// Rebase feature branch onto main before merging
await checkout({ fs, dir, ref: 'feature-branch' })
await rebase({ fs, dir, upstream: 'main' })
await checkout({ fs, dir, ref: 'main' })
await merge({ fs, dir, theirs: 'feature-branch' })
```

### 2. Don't Rebase Public Commits

```typescript
// ❌ Bad: Don't rebase commits that others are using
// If you've pushed commits, don't rebase them

// ✅ Good: Rebase local commits before pushing
await rebase({ fs, dir, upstream: 'main' })
await push({ fs, dir, remote: 'origin', ref: 'feature-branch' })
```

### 3. Handle Conflicts Gracefully

```typescript
try {
  await rebase({ fs, dir, upstream: 'main' })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    // Resolve conflicts
    // ... resolve conflicts ...
    
    // Continue rebase
    await rebase({ fs, dir, upstream: 'main' })
  }
}
```

## Rebase State

Rebase operations use sequencer state files:
- `.git/rebase-merge/` - Rebase state directory
- `.git/rebase-merge/onto` - Target commit
- `.git/rebase-merge/head-name` - Branch being rebased
- `.git/ORIG_HEAD` - Original HEAD before rebase

## Limitations

1. **Interactive Mode**: Not fully implemented
2. **Conflicts**: Must be resolved manually
3. **History Rewrite**: Original commits are replaced
4. **Public Commits**: Should not rebase commits others are using

## Troubleshooting

### Rebase in Progress

If a rebase is already in progress:

```typescript
// Continue the rebase
await rebase({ fs, dir, upstream: 'main' })

// Or abort it
// (abort functionality to be implemented)
```

### Conflicts During Rebase

If conflicts occur:

1. Check conflicted files:
   ```typescript
   const status = await status({ fs, dir })
   console.log(status) // Shows conflicted files
   ```

2. Resolve conflicts manually

3. Continue rebase:
   ```typescript
   await rebase({ fs, dir, upstream: 'main' })
   ```

### Lost Commits After Rebase

If you need to recover commits:

1. Check ORIG_HEAD:
   ```typescript
   const origHead = await readStateFile({ fs, gitdir, name: 'ORIG_HEAD' })
   console.log('Original HEAD:', origHead)
   ```

2. Reset to original state:
   ```typescript
   await resetToCommit({ fs, dir, ref: origHead })
   ```

## Internal Merge Architecture

Rebase uses the `mergeTrees()` capability module internally to merge each commit's tree with the upstream branch's tree. This is a pure algorithm capability module that:

- **Location**: `src/git/merge/mergeTrees.ts`
- **Purpose**: Performs recursive three-way merge on tree structures
- **Input**: Tree OIDs (base, ours, theirs)
- **Output**: `{ mergedTree: TreeEntry[], mergedTreeOid: string, conflicts: string[] }`
- **No index or worktree operations** - only reads/writes Git objects

The `mergeTrees()` capability module uses `mergeBlobs()` internally for merging individual files, ensuring consistent merge behavior across all operations.

**Why `mergeTrees()` instead of `mergeTree()`?**
- Rebase needs a pure algorithm without index management
- It creates new commits for each rebased commit rather than updating the worktree directly
- It uses the merged tree result to create new commit objects
- It needs to handle multiple commits in sequence without side effects

For more details on merge capability modules, see [Merge Architecture](./merge.md#merge-architecture) and [Architecture](./architecture.md#5-merge-capability-modules).

## See Also

- [Cherry Pick](./cherry-pick.md) - Apply individual commits
- [Merge](./merge.md) - Merge branches
- [Abort Merge](./abort-merge.md) - Abort operations
- [Reset](./reset.md) - Reset repository state

