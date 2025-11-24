---
title: Delete Ref
sidebar_label: deleteRef
---

# deleteRef

Delete a Git reference (branch, tag, or other ref).

## Overview

The `deleteRef` command:
- Deletes any Git reference
- Works with branches, tags, and other refs
- Removes ref files from filesystem
- Does not delete the referenced objects

## Basic Usage

```typescript
import { deleteRef } from 'universal-git'

// Delete a ref
await deleteRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0'
})
```

## Examples

### Example 1: Delete Tag

```typescript
// Delete a tag
await deleteRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0'
})
```

### Example 2: Delete Branch

```typescript
// Delete a branch
await deleteRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/feature-branch'
})
```

### Example 3: Delete Remote-Tracking Branch

```typescript
// Delete remote-tracking branch
await deleteRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/remotes/origin/old-branch'
})
```

### Example 4: Handle Not Found

```typescript
// Delete ref, handle if doesn't exist
try {
  await deleteRef({
    fs,
    dir: '/path/to/repo',
    ref: 'refs/tags/v1.0.0'
  })
  console.log('Tag deleted')
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Tag does not exist')
  } else {
    throw error
  }
}
```

## API Reference

### `deleteRef(options)`

Delete a Git reference.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Reference to delete (required)
  - Can be full ref path or short name
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when ref is deleted

## What Gets Deleted

- **Ref file** is removed from filesystem
- **Referenced objects** are NOT deleted (commits, trees, blobs remain)
- **Reflog entries** may remain (depending on configuration)

## Common Use Cases

### Delete Local Branch

```typescript
// Delete a local branch
await deleteRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/feature-branch'
})
```

### Delete Tag

```typescript
// Delete a tag
await deleteRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0'
})
```

### Clean Up Remote-Tracking Branches

```typescript
// Delete stale remote-tracking branch
await deleteRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/remotes/origin/deleted-branch'
})
```

## Best Practices

### 1. Use Specific Commands When Available

```typescript
// ✅ Good: Use specific command
await deleteBranch({ fs, dir, ref: 'feature-branch' })
await deleteTag({ fs, dir, ref: 'v1.0.0' })

// ⚠️ Also works: Use deleteRef
await deleteRef({ fs, dir, ref: 'refs/heads/feature-branch' })
await deleteRef({ fs, dir, ref: 'refs/tags/v1.0.0' })
```

### 2. Verify Before Deleting

```typescript
// ✅ Good: Check if ref exists before deleting
try {
  const oid = await resolveRef({ fs, dir, ref: 'refs/heads/branch' })
  console.log('Branch points to:', oid)
  await deleteRef({ fs, dir, ref: 'refs/heads/branch' })
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Branch does not exist')
  } else {
    throw error
  }
}
```

## Limitations

1. **No Safety Checks**: Doesn't check if branch is current branch
2. **No Remote Deletion**: Only deletes local refs
3. **Objects Preserved**: Referenced objects are not deleted

## See Also

- [Delete Branch](./delete-branch.md) - Delete branches
- [Delete Tag](./delete-tag.md) - Delete tags
- [Write Ref](./write-ref.md) - Create refs

