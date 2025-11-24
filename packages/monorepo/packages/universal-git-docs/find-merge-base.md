---
title: Find Merge Base
sidebar_label: findMergeBase
---

# findMergeBase

Find the merge base (common ancestor) for a set of commits.

## Overview

The `findMergeBase` command:
- Finds the most recent common ancestor of multiple commits
- Uses Git's merge-base algorithm
- Returns a single OID (the merge base)
- Essential for merge and rebase operations

## Basic Usage

```typescript
import { findMergeBase } from 'universal-git'

// Find merge base of two commits
const base = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: ['abc123...', 'def456...']
})

console.log('Merge base:', base)
```

## Examples

### Example 1: Find Merge Base of Two Commits

```typescript
// Get OIDs of two branches
const branch1Oid = await resolveRef({ fs, dir, ref: 'feature-branch' })
const branch2Oid = await resolveRef({ fs, dir, ref: 'main' })

// Find their merge base
const base = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: [branch1Oid, branch2Oid]
})

console.log('Common ancestor:', base)
```

### Example 2: Find Merge Base of Multiple Commits

```typescript
// Find merge base of multiple commits
const commit1 = await resolveRef({ fs, dir, ref: 'commit1' })
const commit2 = await resolveRef({ fs, dir, ref: 'commit2' })
const commit3 = await resolveRef({ fs, dir, ref: 'commit3' })

const base = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: [commit1, commit2, commit3]
})

console.log('Common ancestor:', base)
```

### Example 3: Check if Fast-Forward is Possible

```typescript
// Check if merge would be fast-forward
const currentOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const targetOid = await resolveRef({ fs, dir, ref: 'feature-branch' })

const base = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: [currentOid, targetOid]
})

// If base equals current, fast-forward is possible
if (base === currentOid) {
  console.log('Fast-forward merge possible')
} else {
  console.log('Merge commit required')
}
```

### Example 4: Find Divergence Point

```typescript
// Find where two branches diverged
const branch1Oid = await resolveRef({ fs, dir, ref: 'branch1' })
const branch2Oid = await resolveRef({ fs, dir, ref: 'branch2' })

const divergencePoint = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: [branch1Oid, branch2Oid]
})

console.log('Branches diverged at:', divergencePoint)
```

## API Reference

### `findMergeBase(options)`

Find the merge base of commits.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oids` - Array of commit OIDs (required, minimum 2)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID of the merge base commit

## How It Works

1. **Traverses commit history** from all provided OIDs
2. **Finds common ancestors** in the commit graph
3. **Returns the most recent** common ancestor (merge base)
4. **Uses Git's algorithm** for accurate results

## Use Cases

### Merge Operations

```typescript
// Find merge base before merging
const base = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: [currentOid, mergeTargetOid]
})

// Use base to determine merge strategy
if (base === currentOid) {
  // Fast-forward merge
  await fastForward({ fs, dir, ref: mergeTargetOid })
} else {
  // Regular merge
  await merge({ fs, dir, ours: currentOid, theirs: mergeTargetOid })
}
```

### Rebase Operations

```typescript
// Find base for rebase
const base = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: [currentOid, upstreamOid]
})

// Rebase onto upstream
await rebase({
  fs,
  dir: '/path/to/repo',
  base,
  upstream: upstreamOid
})
```

## Best Practices

### 1. Validate OIDs First

```typescript
// ✅ Good: Validate OIDs exist
try {
  const oid1 = await resolveRef({ fs, dir, ref: 'branch1' })
  const oid2 = await resolveRef({ fs, dir, ref: 'branch2' })
  
  const base = await findMergeBase({
    fs,
    dir: '/path/to/repo',
    oids: [oid1, oid2]
  })
} catch (error) {
  console.error('Invalid ref or OID:', error)
}
```

### 2. Handle No Common Ancestor

```typescript
// Find merge base
const base = await findMergeBase({
  fs,
  dir: '/path/to/repo',
  oids: [oid1, oid2]
})

if (!base) {
  console.log('No common ancestor found (unrelated histories)')
  // Handle unrelated histories case
}
```

## Limitations

1. **Minimum Two OIDs**: Requires at least 2 commit OIDs
2. **Unrelated Histories**: May return undefined if no common ancestor
3. **Performance**: Can be slow for very large histories

## See Also

- [Merge](./merge.md) - Merge branches
- [Rebase](./rebase.md) - Rebase branches
- [Fast Forward](./fast-forward.md) - Fast-forward merge
- [Is Descendent](./is-descendent.md) - Check commit ancestry


