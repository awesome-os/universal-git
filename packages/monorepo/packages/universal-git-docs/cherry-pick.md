---
title: Cherry Pick
sidebar_label: cherryPick
---

# cherryPick

Applies the changes from one or more commits to the current branch, creating new commits with the same changes.

## Overview

Cherry-picking allows you to:
- Apply specific commits from other branches
- Copy commits without merging entire branches
- Selectively bring changes into your branch
- Create new commits with the same changes

## Basic Usage

```typescript
import { cherryPick } from 'universal-git'

// Cherry-pick a single commit
const result = await cherryPick({
  fs,
  dir: '/path/to/repo',
  commit: 'abc123...'
})

console.log(result)
// { oid: 'def456...' } - New commit created
```

## Examples

### Example 1: Cherry-Pick Single Commit

```typescript
import { cherryPick, log } from 'universal-git'

// Cherry-pick a commit from another branch
const result = await cherryPick({
  fs,
  dir: '/path/to/repo',
  commit: 'abc123...'  // Commit from feature-branch
})

console.log('New commit:', result.oid)

// View the commit
const commits = await log({
  fs,
  dir: '/path/to/repo',
  depth: 1
})
console.log(commits[0]) // Shows the cherry-picked commit
```

### Example 2: Cherry-Pick Without Committing

```typescript
// Cherry-pick but don't create a commit (stages changes)
const result = await cherryPick({
  fs,
  dir: '/path/to/repo',
  commit: 'abc123...',
  noCommit: true
})

// Changes are staged, you can review and commit manually
await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Cherry-picked with custom message'
})
```

### Example 3: Handle Conflicts

```typescript
try {
  const result = await cherryPick({
    fs,
    dir: '/path/to/repo',
    commit: 'abc123...'
  })
  console.log('Cherry-pick successful:', result.oid)
} catch (error) {
  if (error.code === 'MergeConflictError') {
    console.log('Conflicts in:', error.data.filepaths)
    // Resolve conflicts manually
    // Then continue or abort
  }
}
```

## API Reference

### `cherryPick(options)`

Applies changes from a commit to the current branch.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `commit` - Commit OID or ref to cherry-pick (required)
- `noCommit` - Don't create a commit, just stage changes (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<CherryPickResult>` - Object with `oid` (new commit hash) and optional `conflicts` array

**CherryPickResult:**
```typescript
{
  oid: string           // New commit hash
  conflicts?: string[]  // Array of conflicted file paths (if conflicts occur)
}
```

## How Cherry-Pick Works

1. **Reads the commit** to cherry-pick
2. **Finds the merge base** (the commit's parent)
3. **Computes the diff** between the commit and its parent
4. **Applies the diff** to the current HEAD
5. **Creates a new commit** with the same changes (unless `noCommit: true`)

## Important Notes

### ⚠️ Root Commits

You cannot cherry-pick a root commit (a commit with no parent). The command will throw an error.

### Conflicts

Cherry-pick may cause conflicts if:
- The same files were modified in both commits
- The changes overlap in ways that can't be automatically merged

When conflicts occur:
- The command throws a `MergeConflictError`
- Conflicted files are marked in the index
- You must resolve conflicts manually
- Then commit the resolution

### Commit Messages

The new commit will have:
- The same commit message as the original
- A different commit hash (different parent)
- The same author and committer (unless configured differently)

## Best Practices

### 1. Check for Conflicts Before Cherry-Picking

```typescript
// Read the commit first to understand what it changes
const commit = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Commit message:', commit.message)
console.log('Files changed:', commit.tree)
```

### 2. Use noCommit for Review

```typescript
// Cherry-pick without committing to review changes
await cherryPick({
  fs,
  dir: '/path/to/repo',
  commit: 'abc123...',
  noCommit: true
})

// Review the staged changes
const status = await status({ fs, dir: '/path/to/repo' })

// Then commit with a custom message if needed
await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Cherry-picked: original message'
})
```

### 3. Handle Conflicts Gracefully

```typescript
try {
  await cherryPick({ fs, dir, commit: 'abc123...' })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    // Option 1: Resolve conflicts and commit
    // ... resolve conflicts ...
    // ... commit ...
    
    // Option 2: Abort (if using sequencer)
    // await abortCherryPick({ fs, dir })
  }
}
```

## Limitations

1. **Root Commits**: Cannot cherry-pick commits with no parent
2. **Merge Commits**: Cherry-picking merge commits may not work as expected
3. **Conflicts**: Must be resolved manually
4. **Commit History**: Creates new commits (doesn't preserve original commit hash)

## Troubleshooting

### "Cannot cherry-pick a commit with no parent"

This means you're trying to cherry-pick a root commit. Root commits have no parent, so there's no base to compute a diff from.

**Solution**: Cherry-pick a different commit, or manually apply the changes.

### Conflicts Not Resolved

If conflicts occur:

1. Check conflicted files:
   ```typescript
   const status = await status({ fs, dir })
   console.log(status) // Shows conflicted files
   ```

2. Resolve conflicts manually in the files

3. Stage resolved files:
   ```typescript
   await add({ fs, dir, filepath: 'resolved-file.txt' })
   ```

4. Commit the resolution:
   ```typescript
   await commit({ fs, dir, message: 'Resolve cherry-pick conflicts' })
   ```

## Internal Merge Architecture

Cherry-pick uses the `mergeTrees()` capability module internally to merge the commit's tree with the current branch's tree. This is a pure algorithm capability module that:

- **Location**: `src/git/merge/mergeTrees.ts`
- **Purpose**: Performs recursive three-way merge on tree structures
- **Input**: Tree OIDs (base, ours, theirs)
- **Output**: `{ mergedTree: TreeEntry[], mergedTreeOid: string, conflicts: string[] }`
- **No index or worktree operations** - only reads/writes Git objects

The `mergeTrees()` capability module uses `mergeBlobs()` internally for merging individual files, ensuring consistent merge behavior across all operations.

**Why `mergeTrees()` instead of `mergeTree()`?**
- Cherry-pick needs a pure algorithm without index management
- It creates new commits rather than updating the worktree directly
- It uses the merged tree result to create a new commit object

For more details on merge capability modules, see [Merge Architecture](./merge.md#merge-architecture) and [Architecture](./architecture.md#5-merge-capability-modules).

## See Also

- [Rebase](./rebase.md) - Rebase branches
- [Merge](./merge.md) - Merge branches
- [Commit](./commit.md) - Create commits
- [Abort Merge](./abort-merge.md) - Abort operations

