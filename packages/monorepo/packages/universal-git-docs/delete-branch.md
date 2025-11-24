---
title: Delete Branch
sidebar_label: deleteBranch
---

# deleteBranch

Delete a local Git branch.

## Overview

The `deleteBranch` command:
- Deletes local branches
- Removes branch ref from filesystem
- Does not delete the referenced commits
- Currently only deletes loose branches (packed branches not supported)

## Basic Usage

```typescript
import { deleteBranch } from 'universal-git'

// Delete a branch
await deleteBranch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})
```

## Examples

### Example 1: Delete Branch

```typescript
// Delete a branch
await deleteBranch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})
```

### Example 2: Delete Branch with Full Path

```typescript
// Delete branch using full ref path
await deleteBranch({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/feature-branch'
})
```

### Example 3: Handle Not Found

```typescript
// Delete branch, handle if doesn't exist
try {
  await deleteBranch({
    fs,
    dir: '/path/to/repo',
    ref: 'feature-branch'
  })
  console.log('Branch deleted')
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Branch does not exist')
  } else {
    throw error
  }
}
```

### Example 4: Clean Up Merged Branches

```typescript
// Delete branches that have been merged
const branches = await listBranches({ fs, dir: '/path/to/repo' })
const mainOid = await resolveRef({ fs, dir, ref: 'main' })

for (const branch of branches) {
  if (branch === 'main') continue
  
  const branchOid = await resolveRef({ fs, dir, ref: branch })
  const isMerged = await isDescendent({
    fs,
    dir: '/path/to/repo',
    oid: branchOid,
    ancestor: mainOid
  })
  
  if (isMerged) {
    await deleteBranch({ fs, dir: '/path/to/repo', ref: branch })
    console.log(`Deleted merged branch: ${branch}`)
  }
}
```

## API Reference

### `deleteBranch(options)`

Delete a local branch.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Branch name to delete (required)
  - Can be short name (e.g., `'feature-branch'`) or full path (e.g., `'refs/heads/feature-branch'`)

**Returns:**

- `Promise<void>` - Resolves when branch is deleted

**Throws:**

- `NotFoundError` - If branch doesn't exist

## How It Works

1. **Resolves branch name** to full ref path
2. **Deletes ref file** from filesystem
3. **Removes from config** if branch has tracking configuration
4. **Does not delete** referenced commits

## Best Practices

### 1. Check if Branch Exists

```typescript
// ✅ Good: Check before deleting
const branches = await listBranches({ fs, dir: '/path/to/repo' })
if (branches.includes('feature-branch')) {
  await deleteBranch({ fs, dir: '/path/to/repo', ref: 'feature-branch' })
} else {
  console.log('Branch does not exist')
}
```

### 2. Don't Delete Current Branch

```typescript
// ✅ Good: Check current branch before deleting
const current = await currentBranch({ fs, dir: '/path/to/repo' })
if (current === 'feature-branch') {
  console.log('Cannot delete current branch')
  // Switch to another branch first
  await checkout({ fs, dir: '/path/to/repo', ref: 'main' })
}
await deleteBranch({ fs, dir: '/path/to/repo', ref: 'feature-branch' })
```

## Limitations

1. **Loose Branches Only**: Currently only deletes loose branches (packed branches not supported)
2. **No Safety Checks**: Doesn't prevent deleting current branch
3. **Local Only**: Only deletes local branches (not remote-tracking branches)

## See Also

- [Delete Ref](./delete-ref.md) - Delete any ref
- [Branch](./branch.md) - Create branches
- [List Branches](./list-branches.md) - List branches

