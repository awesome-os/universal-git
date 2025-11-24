---
title: Read Object
sidebar_label: readObject
---

# readObject

Read a Git object directly by its OID, supporting multiple formats.

## Overview

The `readObject` command:
- Reads any Git object type (blob, tree, commit, tag)
- Supports multiple output formats (deflated, wrapped, content, parsed)
- Can resolve filepaths within trees
- Returns object with type information

## Basic Usage

```typescript
import { readObject } from 'universal-git'

// Read an object
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Type:', result.type)
console.log('Object:', result.object)
```

## Examples

### Example 1: Read Object with Parsed Format

```typescript
// Read object in parsed format (default)
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

switch (result.type) {
  case 'commit':
    console.log('Commit:', result.object)
    break
  case 'tree':
    console.log('Tree:', result.object)
    break
  case 'blob':
    console.log('Blob:', result.object)
    break
  case 'tag':
    console.log('Tag:', result.object)
    break
}
```

### Example 2: Read Object as Raw Content

```typescript
// Read object as raw content (no parsing)
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  format: 'content'
})

// result.object is Uint8Array
console.log('Raw content:', result.object)
```

### Example 3: Read File from Commit

```typescript
// Read a file from a commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  filepath: 'README.md'
})

if (result.type === 'blob') {
  const content = UniversalBuffer.from(result.object).toString('utf8')
  console.log('README.md:', content)
}
```

### Example 4: Read Blob with Encoding

```typescript
// Read blob as string
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: blobOid,
  format: 'parsed',
  encoding: 'utf8'
})

// result.object is string when encoding is provided
console.log('Content:', result.object)
```

### Example 5: Read Deflated Object

```typescript
// Read object in deflated format (for efficient storage)
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  format: 'deflated'
})

// result.object is deflated Uint8Array
console.log('Deflated size:', result.object.length)
```

## API Reference

### `readObject(options)`

Read a Git object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oid` - Object OID to read (required)
- `format` - Output format (optional, default: `'parsed'`)
  - `'deflated'` - Raw deflate-compressed buffer
  - `'wrapped'` - Inflated object with Git header
  - `'content'` - Object content without header
  - `'parsed'` - Parsed object (CommitObject, TreeObject, etc.)
- `filepath` - Resolve filepath within tree (optional)
- `encoding` - Encoding for blob content (optional, e.g., `'utf8'`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<ReadObjectResult>` - Object with type and format information

**ReadObjectResult Types:**

```typescript
// Parsed formats
type ParsedBlobObject = { oid: string; type: 'blob'; format: 'parsed'; object: string }
type ParsedCommitObject = { oid: string; type: 'commit'; format: 'parsed'; object: CommitObject }
type ParsedTreeObject = { oid: string; type: 'tree'; format: 'parsed'; object: TreeObject }
type ParsedTagObject = { oid: string; type: 'tag'; format: 'parsed'; object: TagObject }

// Raw formats
type RawObject = { oid: string; type: 'blob' | 'commit' | 'tree' | 'tag'; format: 'content'; object: Uint8Array }
type WrappedObject = { oid: string; type: 'wrapped'; format: 'wrapped'; object: Uint8Array }
type DeflatedObject = { oid: string; type: 'deflated'; format: 'deflated'; object: Uint8Array }
```

## Format Options

### Deflated Format

Returns the raw deflate-compressed buffer:

```typescript
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  format: 'deflated'
})
// Useful for efficiently shuffling objects without inflating
```

### Wrapped Format

Returns the inflated object with Git header:

```typescript
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  format: 'wrapped'
})
// This is the raw data used when calculating SHA-1
```

### Content Format

Returns object content without header:

```typescript
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  format: 'content'
})
// Raw object content as Uint8Array
```

### Parsed Format (Default)

Returns parsed object:

```typescript
const result = await readObject({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  format: 'parsed'
})
// Returns CommitObject, TreeObject, TagObject, or string (for blobs)
```

## Best Practices

### 1. Use Specific Commands When Possible

```typescript
// ✅ Good: Use specific command when you know the type
const commit = await readCommit({ fs, dir, oid: commitOid })
const blob = await readBlob({ fs, dir, oid: blobOid })

// ⚠️ Also works: Use readObject for unknown types
const result = await readObject({ fs, dir, oid: unknownOid })
```

### 2. Handle Different Types

```typescript
// ✅ Good: Handle all object types
const result = await readObject({ fs, dir, oid: someOid })

switch (result.type) {
  case 'commit':
    // Handle commit
    break
  case 'tree':
    // Handle tree
    break
  case 'blob':
    // Handle blob
    break
  case 'tag':
    // Handle tag
    break
}
```

## Limitations

1. **Packfile Objects**: Objects from packfiles may be returned in `'content'` format even if `'deflated'` or `'wrapped'` is requested
2. **Performance**: Parsing can be slower than raw formats
3. **Memory**: Large blobs may consume significant memory

## See Also

- [Read Blob](./read-blob.md) - Read blob objects
- [Read Tree](./read-tree.md) - Read tree objects
- [Read Commit](./read-commit.md) - Read commit objects
- [Read Tag](./read-tag.md) - Read tag objects

