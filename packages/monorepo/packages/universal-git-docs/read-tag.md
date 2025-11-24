---
title: Read Tag
sidebar_label: readTag
---

# readTag

Read an annotated tag object directly by its OID.

## Overview

The `readTag` command:
- Reads annotated tag objects
- Returns parsed tag information
- Includes tag payload (for verification)
- Only works with annotated tags (not lightweight tags)

## Basic Usage

```typescript
import { readTag } from 'universal-git'

// Read an annotated tag
const { oid, tag } = await readTag({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Tag OID:', oid)
console.log('Tag name:', tag.tag)
```

## Examples

### Example 1: Read Tag by OID

```typescript
// Read tag directly by OID
const { oid, tag } = await readTag({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Tag name:', tag.tag)
console.log('Tagged object:', tag.object)
console.log('Object type:', tag.type)
console.log('Tagger:', tag.tagger.name)
console.log('Message:', tag.message)
```

### Example 2: Read Tag from Ref

```typescript
// Read tag from a ref
const tagOid = await resolveRef({ fs, dir, ref: 'refs/tags/v1.0.0' })
const { oid, tag } = await readTag({
  fs,
  dir: '/path/to/repo',
  oid: tagOid
})

console.log('Tag:', tag)
```

### Example 3: Access Tag Fields

```typescript
// Access tag information
const { oid, tag } = await readTag({
  fs,
  dir: '/path/to/repo',
  oid: tagOid
})

console.log('OID:', oid)
console.log('Tag name:', tag.tag)
console.log('Tagged object OID:', tag.object)
console.log('Object type:', tag.type)  // 'commit', 'tree', 'blob', or 'tag'
console.log('Tagger:', tag.tagger.name, tag.tagger.email)
console.log('Timestamp:', new Date(tag.tagger.timestamp * 1000))
console.log('Message:', tag.message)
```

### Example 4: Verify Tag

```typescript
// Read tag with payload for verification
const { oid, tag, payload } = await readTag({
  fs,
  dir: '/path/to/repo',
  oid: tagOid
})

// payload is the tag without signature (for verification)
console.log('Tag payload:', payload)
```

### Example 5: Get Tagged Commit

```typescript
// Get the commit that a tag points to
const { tag } = await readTag({
  fs,
  dir: '/path/to/repo',
  oid: tagOid
})

if (tag.type === 'commit') {
  const { commit } = await readCommit({
    fs,
    dir: '/path/to/repo',
    oid: tag.object
  })
  console.log('Tagged commit:', commit)
}
```

## API Reference

### `readTag(options)`

Read an annotated tag object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oid` - Tag OID (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<ReadTagResult>` - Tag result

**ReadTagResult:**
```typescript
{
  oid: string        // Tag OID
  tag: TagObject     // Parsed tag object
  payload: Uint8Array  // Tag payload (without signature, for verification)
}
```

**TagObject:**
```typescript
{
  object: string     // Object OID that tag points to
  type: 'commit' | 'tree' | 'blob' | 'tag'  // Type of tagged object
  tag: string        // Tag name
  tagger: {
    name: string
    email: string
    timestamp: number    // Unix timestamp
    timezoneOffset: number
  }
  message: string    // Tag message
  gpgsig?: string    // GPG signature (if signed)
}
```

## Annotated vs Lightweight Tags

### Annotated Tags

```typescript
// Annotated tags are Git objects
const { tag } = await readTag({ fs, dir, oid: tagOid })
// Has tagger, message, etc.
```

### Lightweight Tags

```typescript
// Lightweight tags are just refs (not objects)
const tagOid = await resolveRef({ fs, dir, ref: 'refs/tags/v1.0.0' })
// No tag object, just points to commit
// readTag will fail for lightweight tags
```

## Best Practices

### 1. Check if Tag is Annotated

```typescript
// ✅ Good: Check if tag is annotated before reading
try {
  const { tag } = await readTag({ fs, dir, oid: tagOid })
  console.log('Annotated tag:', tag.tag)
} catch (error) {
  if (error.code === 'ObjectTypeError') {
    console.log('Lightweight tag (not an object)')
  } else {
    throw error
  }
}
```

### 2. Use for Tag Information

```typescript
// ✅ Good: Use readTag for annotated tag details
const { tag } = await readTag({ fs, dir, oid: tagOid })
console.log('Tag message:', tag.message)

// ⚠️ For lightweight tags: Use resolveRef
const commitOid = await resolveRef({ fs, dir, ref: 'refs/tags/v1.0.0' })
```

## Limitations

1. **Annotated Only**: Only works with annotated tags (not lightweight tags)
2. **Single Tag**: Returns one tag at a time

## See Also

- [Write Tag](./write-tag.md) - Write annotated tag objects
- [Tag](./tag.md) - Create lightweight tags
- [Read Object](./read-object.md) - Read any object type

