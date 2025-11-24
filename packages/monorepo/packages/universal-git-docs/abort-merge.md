---
title: Abort Merge
sidebar_label: abortMerge
---

# abortMerge

Aborts a merge in progress by resetting conflicted files to their state at HEAD and cleaning up merge state files.

## Overview

The `abortMerge` command:
- Resets files affected by merge conflicts to their state at HEAD
- Cleans up merge state files (MERGE_HEAD, MERGE_MODE, MERGE_MSG)
- Preserves unstaged changes that weren't part of the merge
- Resets the index to match HEAD

## Basic Usage

```typescript
import { abortMerge } from 'universal-git'

// Abort merge in progress
await abortMerge({
  fs,
  dir: '/path/to/repo'
})

// Abort merge and reset to specific commit
await abortMerge({
  fs,
  dir: '/path/to/repo',
  commit: 'HEAD~1'
})
```

## How It Works

`abortMerge` performs the following operations:

1. **Resolves the target commit** (defaults to HEAD)
2. **Identifies conflicted files** from the index
3. **Determines which files to reset**:
   - Unmerged files → Reset to HEAD
   - Staged changes with no unstaged changes → Reset to HEAD
   - Files with unstaged changes → Keep workdir, reset index to HEAD
4. **Updates the working directory** to match HEAD
5. **Updates the index** to match HEAD
6. **Cleans up merge state files**

## Examples

### Example 1: Basic Merge Abort

```typescript
import { merge, abortMerge, status } from 'universal-git'

// Start a merge that will conflict
try {
  await merge({
    fs,
    dir: '/path/to/repo',
    theirs: 'feature-branch'
  })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    // Merge has conflicts, abort it
    await abortMerge({
      fs,
      dir: '/path/to/repo'
    })
    
    // Repository is now back to pre-merge state
    const fileStatus = await status({ fs, dir: '/path/to/repo' })
    console.log(fileStatus) // Should show clean state
  }
}
```

### Example 2: Abort After Examining Conflicts

```typescript
import { merge, abortMerge, status } from 'universal-git'

// Attempt merge
try {
  await merge({
    fs,
    dir: '/path/to/repo',
    theirs: 'feature-branch'
  })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    // Examine conflicts
    const conflicts = error.data.filepaths
    console.log('Conflicts in:', conflicts)
    
    // Decide to abort
    await abortMerge({
      fs,
      dir: '/path/to/repo'
    })
  }
}
```

### Example 3: Reset to Specific Commit

```typescript
// Abort merge and reset to a previous commit
await abortMerge({
  fs,
  dir: '/path/to/repo',
  commit: 'HEAD~1'  // Reset to previous commit
})
```

## API Reference

### `abortMerge(options)`

Aborts a merge in progress.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `commit` - Commit to reset to (optional, defaults to `'HEAD'`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when merge is aborted

## Behavior Details

### File Handling

`abortMerge` handles files differently based on their state:

1. **Unmerged files** (conflict markers):
   - Reset to HEAD state
   - Removed from index if not in HEAD

2. **Staged changes** (no unstaged changes):
   - Reset to HEAD state
   - Index updated to match HEAD

3. **Unstaged changes** (working directory differs from index):
   - Working directory preserved
   - Index reset to HEAD

4. **Files not in HEAD**:
   - Removed from working directory
   - Removed from index

### Merge State Cleanup

After aborting, the following merge state files are removed:
- `.git/MERGE_HEAD` - Merge commit reference
- `.git/MERGE_MODE` - Merge mode (if exists)
- `.git/MERGE_MSG` - Merge message (if exists)

## Important Notes

### ⚠️ Warning About Uncommitted Changes

**WARNING**: Running `merge` with non-trivial uncommitted changes is discouraged. If there were uncommitted changes when the merge started (especially if those changes were further modified after the merge was started), `abortMerge` may be unable to reconstruct the original (pre-merge) changes in some cases.

### Difference from Canonical Git

The behavior of this command differs slightly from canonical Git:
- If a file exists in the index but nowhere else, universal-git will throw an error
- Canonical Git will reset the file and continue aborting the merge

## Best Practices

### 1. Check for Merge in Progress

```typescript
import { readStateFile } from 'universal-git/git/state'

// Check if merge is in progress
const mergeHead = await readStateFile({ fs, gitdir, name: 'MERGE_HEAD' })
if (mergeHead) {
  // Merge is in progress
  await abortMerge({ fs, dir })
}
```

### 2. Handle Merge Conflicts Gracefully

```typescript
try {
  await merge({ fs, dir, theirs: 'feature-branch' })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    // Option 1: Abort
    await abortMerge({ fs, dir })
    
    // Option 2: Resolve conflicts manually
    // ... resolve conflicts ...
    // ... then commit ...
  }
}
```

### 3. Use After Failed Merge

```typescript
// Always abort if merge fails
try {
  await merge({ fs, dir, theirs: 'feature-branch' })
} catch (error) {
  // Abort to return to clean state
  await abortMerge({ fs, dir })
  throw error  // Re-throw if needed
}
```

## Troubleshooting

### Merge State Not Cleared

If merge state files still exist after aborting:

```typescript
// Manually check and clean up
const mergeHead = await readStateFile({ fs, gitdir, name: 'MERGE_HEAD' })
if (mergeHead) {
  // Merge state still exists, abort again
  await abortMerge({ fs, dir })
}
```

### Files Not Reset

If files are not reset correctly:

1. Check that you're using the correct `dir`:
   ```typescript
   await abortMerge({ fs, dir: '/correct/path/to/repo' })
   ```

2. Verify HEAD is correct:
   ```typescript
   const head = await resolveRef({ fs, gitdir, ref: 'HEAD' })
   console.log('HEAD:', head)
   ```

3. Try with explicit commit:
   ```typescript
   await abortMerge({ fs, dir, commit: 'HEAD' })
   ```

## See Also

- [Merge](./merge.md) - Merge branches
- [Status](./status.md) - Check repository status
- [Reset](./reset.md) - Reset repository state

