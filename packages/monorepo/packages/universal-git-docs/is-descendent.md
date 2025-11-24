---
title: Is Descendent
sidebar_label: isDescendent
---

# isDescendent

Check whether a commit is a descendent of another commit.

## Overview

The `isDescendent` command:
- Checks if one commit is an ancestor of another
- Traverses commit history to verify ancestry
- Supports depth limiting for performance
- Useful for validating commit relationships

## Basic Usage

```typescript
import { isDescendent } from 'universal-git'

// Check if commit is descendent of ancestor
const isDesc = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  ancestor: 'def456...'
})

console.log('Is descendent:', isDesc)
```

## Examples

### Example 1: Check Branch Ancestry

```typescript
// Check if feature branch is based on main
const featureOid = await resolveRef({ fs, dir, ref: 'feature-branch' })
const mainOid = await resolveRef({ fs, dir, ref: 'main' })

const isBasedOnMain = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: featureOid,
  ancestor: mainOid
})

if (isBasedOnMain) {
  console.log('Feature branch is based on main')
} else {
  console.log('Feature branch has diverged from main')
}
```

### Example 2: Verify Commit is in History

```typescript
// Check if a commit is in the current branch's history
const currentOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const commitOid = 'abc123...'

const isInHistory = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: currentOid,
  ancestor: commitOid
})

if (isInHistory) {
  console.log('Commit is in current branch history')
} else {
  console.log('Commit is not in current branch history')
}
```

### Example 3: Limit Search Depth

```typescript
// Check ancestry with depth limit (for performance)
const isDesc = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  ancestor: 'def456...',
  depth: 100  // Limit to 100 commits
})

if (isDesc === undefined) {
  console.log('Depth limit reached, could not determine')
} else {
  console.log('Is descendent:', isDesc)
}
```

### Example 4: Validate Before Merge

```typescript
// Check if merge target is ahead of current branch
const currentOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const mergeTargetOid = await resolveRef({ fs, dir, ref: 'feature-branch' })

const isAhead = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: mergeTargetOid,
  ancestor: currentOid
})

if (isAhead) {
  console.log('Merge target is ahead, fast-forward possible')
} else {
  console.log('Branches have diverged, merge commit needed')
}
```

## API Reference

### `isDescendent(options)`

Check if a commit is a descendent of another.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oid` - The descendent commit OID (required)
- `ancestor` - The ancestor commit OID (required)
- `depth` - Maximum depth to search (optional, default: `-1` for unlimited)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<boolean>` - `true` if `oid` is a descendent of `ancestor`, `false` otherwise
- May throw `MaxDepthError` if depth limit is reached

## How It Works

1. **Starts from descendent** commit (`oid`)
2. **Traverses parent chain** backwards through history
3. **Checks if ancestor** is reached during traversal
4. **Returns true** if ancestor is found, `false` otherwise
5. **Respects depth limit** if specified

## Use Cases

### Branch Validation

```typescript
// Ensure feature branch is based on main
const featureOid = await resolveRef({ fs, dir, ref: 'feature-branch' })
const mainOid = await resolveRef({ fs, dir, ref: 'main' })

const isValid = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: featureOid,
  ancestor: mainOid
})

if (!isValid) {
  throw new Error('Feature branch is not based on main')
}
```

### Fast-Forward Check

```typescript
// Check if fast-forward merge is possible
const currentOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const targetOid = await resolveRef({ fs, dir, ref: 'upstream' })

const canFastForward = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: targetOid,
  ancestor: currentOid
})

if (canFastForward) {
  await fastForward({ fs, dir, ref: 'upstream' })
} else {
  await merge({ fs, dir, theirs: targetOid })
}
```

## Best Practices

### 1. Use Depth Limits for Performance

```typescript
// ✅ Good: Limit depth for large histories
const isDesc = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  ancestor: ancestorOid,
  depth: 1000  // Reasonable limit
})

// ⚠️ May be slow: Unlimited depth
const isDesc = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  ancestor: ancestorOid
  // depth: -1 (default, unlimited)
})
```

### 2. Handle Errors

```typescript
try {
  const isDesc = await isDescendent({
    fs,
    dir: '/path/to/repo',
    oid: commitOid,
    ancestor: ancestorOid,
    depth: 100
  })
  console.log('Is descendent:', isDesc)
} catch (error) {
  if (error.code === 'MaxDepthError') {
    console.log('Depth limit reached, could not determine')
  } else {
    throw error
  }
}
```

## Limitations

1. **Performance**: Can be slow for very deep histories
2. **Depth Limit**: May not find answer if depth limit is too low
3. **Unrelated Commits**: Returns `false` for unrelated commits

## See Also

- [Find Merge Base](./find-merge-base.md) - Find common ancestor
- [Fast Forward](./fast-forward.md) - Fast-forward merge
- [Merge](./merge.md) - Merge branches


