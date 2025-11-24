---
title: Read Blob
sidebar_label: readBlob
---

# readBlob

Read a blob object directly by its OID.

## Overview

The `readBlob` command:
- Reads blob objects (file contents)
- Can resolve filepaths within commits/trees
- Returns blob as Uint8Array
- Automatically peels tags and commits to find blobs

## Basic Usage

```typescript
import { readBlob } from 'universal-git'

// Read a blob
const { oid, blob } = await readBlob({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Blob OID:', oid)
console.log('Content:', UniversalBuffer.from(blob).toString('utf8'))
```

## Examples

### Example 1: Read Blob by OID

```typescript
// Read blob directly by OID
const { oid, blob } = await readBlob({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

const content = UniversalBuffer.from(blob).toString('utf8')
console.log('Content:', content)
```

### Example 2: Read File from Commit

```typescript
// Read a file from a commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const { oid, blob } = await readBlob({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  filepath: 'README.md'
})

const content = UniversalBuffer.from(blob).toString('utf8')
console.log('README.md:', content)
```

### Example 3: Read File from Branch

```typescript
// Read file from a branch
const branchOid = await resolveRef({ fs, dir, ref: 'feature-branch' })
const { oid, blob } = await readBlob({
  fs,
  dir: '/path/to/repo',
  oid: branchOid,
  filepath: 'src/index.ts'
})

const content = UniversalBuffer.from(blob).toString('utf8')
console.log('File content:', content)
```

### Example 4: Handle Binary Files

```typescript
// Read binary file
const { oid, blob } = await readBlob({
  fs,
  dir: '/path/to/repo',
  oid: imageOid
})

// blob is Uint8Array, can be used directly
console.log('Image size:', blob.length)
```

### Example 5: Read from Tag

```typescript
// Read file from a tagged commit
const tagOid = await resolveRef({ fs, dir, ref: 'v1.0.0' })
const { oid, blob } = await readBlob({
  fs,
  dir: '/path/to/repo',
  oid: tagOid,  // Tag is automatically peeled to commit
  filepath: 'CHANGELOG.md'
})

const content = UniversalBuffer.from(blob).toString('utf8')
console.log('Changelog:', content)
```

## API Reference

### `readBlob(options)`

Read a blob object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oid` - Object OID (required)
  - Can be blob OID, commit OID, tree OID, or tag OID
  - Tags and commits are automatically peeled
- `filepath` - Resolve filepath within tree (optional)
  - If provided, resolves `oid` to a tree and returns blob at that path
- `cache` - Cache object (optional)

**Returns:**

- `Promise<ReadBlobResult>` - Blob result

**ReadBlobResult:**
```typescript
{
  oid: string      // Blob OID
  blob: Uint8Array  // Blob content
}
```

## How It Works

1. **Resolves OID** to a blob (peels tags/commits if needed)
2. **If filepath provided**, resolves it within the tree
3. **Reads blob** from object store
4. **Returns** blob as Uint8Array

## Best Practices

### 1. Use for File Contents

```typescript
// ✅ Good: Use readBlob for file contents
const { blob } = await readBlob({ fs, dir, oid: commitOid, filepath: 'file.txt' })
const content = UniversalBuffer.from(blob).toString('utf8')

// ⚠️ More complex: Use readObject and handle types
const result = await readObject({ fs, dir, oid: commitOid, filepath: 'file.txt' })
if (result.type === 'blob') {
  const content = UniversalBuffer.from(result.object).toString('utf8')
}
```

### 2. Handle Encoding

```typescript
// ✅ Good: Convert to string with encoding
const { blob } = await readBlob({ fs, dir, oid: blobOid })
const text = UniversalBuffer.from(blob).toString('utf8')

// For binary files, use blob directly
const { blob } = await readBlob({ fs, dir, oid: imageOid })
// blob is Uint8Array, use directly
```

## Limitations

1. **Memory**: Large blobs may consume significant memory
2. **Binary Files**: Returns raw bytes (no encoding conversion)

## See Also

- [Write Blob](./write-blob.md) - Write blob objects
- [Read Object](./read-object.md) - Read any object type
- [Hash Blob](./hash-blob.md) - Compute blob hash

