---
title: Delete Tag
sidebar_label: deleteTag
---

# deleteTag

Delete a local Git tag.

## Overview

The `deleteTag` command:
- Deletes local tags (both lightweight and annotated)
- Removes tag ref from filesystem
- Does not delete the referenced objects
- Works with both lightweight and annotated tags

## Basic Usage

```typescript
import { deleteTag } from 'universal-git'

// Delete a tag
await deleteTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})
```

## Examples

### Example 1: Delete Tag

```typescript
// Delete a tag
await deleteTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})
```

### Example 2: Delete Tag with Full Path

```typescript
// Delete tag using full ref path
await deleteTag({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0'
})
```

### Example 3: Handle Not Found

```typescript
// Delete tag, handle if doesn't exist
try {
  await deleteTag({
    fs,
    dir: '/path/to/repo',
    ref: 'v1.0.0'
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

### Example 4: Delete Multiple Tags

```typescript
// Delete multiple tags
const tags = await listTags({ fs, dir: '/path/to/repo' })
const tagsToDelete = tags.filter(tag => tag.startsWith('v0.'))

for (const tag of tagsToDelete) {
  await deleteTag({ fs, dir: '/path/to/repo', ref: tag })
  console.log(`Deleted tag: ${tag}`)
}
```

## API Reference

### `deleteTag(options)`

Delete a local tag.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Tag name to delete (required)
  - Can be short name (e.g., `'v1.0.0'`) or full path (e.g., `'refs/tags/v1.0.0'`)

**Returns:**

- `Promise<void>` - Resolves when tag is deleted

**Throws:**

- `NotFoundError` - If tag doesn't exist

## Tag Types

### Lightweight Tags

```typescript
// Delete lightweight tag (just a ref)
await deleteTag({ fs, dir: '/path/to/repo', ref: 'v1.0.0' })
// Deletes refs/tags/v1.0.0
```

### Annotated Tags

```typescript
// Delete annotated tag (ref + tag object)
await deleteTag({ fs, dir: '/path/to/repo', ref: 'v1.0.0' })
// Deletes refs/tags/v1.0.0
// Note: Tag object may remain in object store
```

## Best Practices

### 1. Check if Tag Exists

```typescript
// ✅ Good: Check before deleting
const tags = await listTags({ fs, dir: '/path/to/repo' })
if (tags.includes('v1.0.0')) {
  await deleteTag({ fs, dir: '/path/to/repo', ref: 'v1.0.0' })
} else {
  console.log('Tag does not exist')
}
```

### 2. Verify Before Deleting

```typescript
// ✅ Good: Verify tag before deleting
const tagOid = await resolveRef({ fs, dir, ref: 'refs/tags/v1.0.0' })
console.log('Tag points to:', tagOid)
await deleteTag({ fs, dir: '/path/to/repo', ref: 'v1.0.0' })
```

## Limitations

1. **Local Only**: Only deletes local tags (not remote tags)
2. **Tag Objects**: Annotated tag objects may remain in object store
3. **No Remote Deletion**: Does not delete tags on remote

## See Also

- [Delete Ref](./delete-ref.md) - Delete any ref
- [Tag](./tag.md) - Create tags
- [List Tags](./list-tags.md) - List tags

