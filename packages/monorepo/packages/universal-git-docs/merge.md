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

## See Also

- [Abort Merge](./abort-merge.md) - Abort merge in progress
- [Cherry Pick](./cherry-pick.md) - Apply individual commits
- [Rebase](./rebase.md) - Rebase branches
- [Status](./status.md) - Check repository status


