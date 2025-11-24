---
title: Write Blob
sidebar_label: writeBlob
---

# writeBlob

Write a blob object directly to the Git object store.

## Overview

The `writeBlob` command:
- Writes blob objects (file contents) to Git
- Computes SHA-1 or SHA-256 hash automatically
- Returns the object OID
- Supports dry-run mode

## Basic Usage

```typescript
import { writeBlob } from 'universal-git'

// Write a blob
const oid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob: UniversalBuffer.from('Hello, world!')
})

console.log('Blob OID:', oid)
```

## Examples

### Example 1: Write Text Blob

```typescript
// Write a text file as blob
const content = 'Hello, world!\n'
const blob = UniversalBuffer.from(content, 'utf8')
const oid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob
})

console.log('Blob OID:', oid)
```

### Example 2: Write Binary Blob

```typescript
// Write binary data as blob
const imageData = new Uint8Array([...]) // Image bytes
const oid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob: imageData
})

console.log('Image blob OID:', oid)
```

### Example 3: Write Empty Blob

```typescript
// Write empty blob
const oid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob: new Uint8Array([])
})

console.log('Empty blob OID:', oid)
// Should be 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391' for SHA-1
```

### Example 4: Dry Run

```typescript
// Compute OID without writing
const blob = UniversalBuffer.from('content')
const oid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob,
  dryRun: true
})

console.log('Would create blob with OID:', oid)
// Object is not written to disk
```

### Example 5: Create Blob from File

```typescript
// Read file and write as blob
const fileContent = await fs.read('/path/to/file.txt', 'utf8')
const blob = UniversalBuffer.from(fileContent, 'utf8')
const oid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob
})

console.log('File blob OID:', oid)
```

## API Reference

### `writeBlob(options)`

Write a blob object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `blob` - Blob content as Uint8Array (required)
- `dryRun` - Compute OID without writing (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID of the written blob

## How It Works

1. **Takes blob content** as Uint8Array
2. **Creates Git object** with blob header
3. **Computes hash** (SHA-1 or SHA-256 based on repository)
4. **Writes to object store** (unless `dryRun: true`)
5. **Returns OID**

## Blob Format

Git blob objects are stored as:
```
blob <size>\0<content>
```

The OID is computed from this format.

## Best Practices

### 1. Use UniversalBuffer

```typescript
// ✅ Good: Use UniversalBuffer for text
const blob = UniversalBuffer.from('Hello, world!', 'utf8')
const oid = await writeBlob({ fs, dir, blob })

// ⚠️ Also works: Use Uint8Array directly
const blob = new TextEncoder().encode('Hello, world!')
const oid = await writeBlob({ fs, dir, blob })
```

### 2. Reuse Blobs

```typescript
// ✅ Good: Check if blob exists before writing
const content = 'Hello, world!'
const blob = UniversalBuffer.from(content, 'utf8')

// Compute OID first (dry run)
const oid = await writeBlob({ fs, dir, blob, dryRun: true })

// Check if object exists
try {
  await readObject({ fs, dir, oid })
  console.log('Blob already exists')
} catch {
  // Write blob
  await writeBlob({ fs, dir, blob })
}
```

## Limitations

1. **Object Format**: Uses repository's object format (SHA-1 or SHA-256)
2. **No Validation**: Doesn't validate blob content
3. **Storage**: Large blobs may be slow to write

## See Also

- [Read Blob](./read-blob.md) - Read blob objects
- [Hash Blob](./hash-blob.md) - Compute blob hash
- [Write Tree](./write-tree.md) - Write tree objects

