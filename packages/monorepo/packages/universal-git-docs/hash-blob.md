---
title: Hash Blob
sidebar_label: hashBlob
---

# hashBlob

Calculates the SHA-1 or SHA-256 hash of a blob object without writing it to the object database.

## Overview

`hashBlob` computes the object ID (OID) of a blob:
- **Without writing** to the object database
- **Supports SHA-1 and SHA-256** object formats
- **Returns the OID** and wrapped object

## Basic Usage

```typescript
import { hashBlob } from 'universal-git'

// Hash a blob (SHA-1, default)
const result = await hashBlob({
  object: 'Hello, world!'
})

console.log(result.oid) // SHA-1 hash (40 characters)
console.log(result.object) // Wrapped blob object
```

## Examples

### Example 1: Hash String

```typescript
// Hash a string (defaults to SHA-1)
const result = await hashBlob({
  object: 'Hello, world!'
})

console.log('OID:', result.oid)
console.log('Object:', result.object)
```

### Example 2: Hash with SHA-256

```typescript
// Hash with SHA-256
const result = await hashBlob({
  object: 'Hello, world!',
  objectFormat: 'sha256'
})

console.log('OID:', result.oid) // SHA-256 hash (64 characters)
```

### Example 3: Hash Buffer

```typescript
import { UniversalBuffer } from 'universal-git'

// Hash a buffer
const buffer = UniversalBuffer.from('Hello, world!')
const result = await hashBlob({
  object: buffer
})

console.log('OID:', result.oid)
```

### Example 4: Compare Hashes

```typescript
// Hash the same content twice
const result1 = await hashBlob({ object: 'Hello, world!' })
const result2 = await hashBlob({ object: 'Hello, world!' })

console.log('Same content, same hash:', result1.oid === result2.oid) // true
```

## API Reference

### `hashBlob(options)`

Calculates the hash of a blob object.

**Parameters:**

- `object` - Blob content (string or Uint8Array/UniversalBuffer) (required)
- `objectFormat` - Object format: `'sha1'` or `'sha256'` (optional, default: `'sha1'`)

**Returns:**

- `Promise<HashBlobResult>` - Object with `oid` and `object`

**HashBlobResult:**
```typescript
{
  oid: string              // Object ID (SHA-1 or SHA-256 hash)
  object: UniversalBuffer   // Wrapped blob object
}
```

## How It Works

1. **Wraps the blob** with Git object header: `blob <size>\0<content>`
2. **Hashes the wrapped object** using SHA-1 or SHA-256
3. **Returns the OID** and wrapped object

## OID Length

- **SHA-1**: 40 hexadecimal characters
- **SHA-256**: 64 hexadecimal characters

```typescript
// SHA-1
const sha1 = await hashBlob({ object: 'test', objectFormat: 'sha1' })
console.log(sha1.oid.length) // 40

// SHA-256
const sha256 = await hashBlob({ object: 'test', objectFormat: 'sha256' })
console.log(sha256.oid.length) // 64
```

## Use Cases

### 1. Verify File Integrity

```typescript
// Hash a file to verify integrity
const content = await fs.read('/path/to/file.txt')
const hash = await hashBlob({ object: content })

// Compare with stored hash
if (hash.oid === storedHash) {
  console.log('File integrity verified')
}
```

### 2. Check if Content Changed

```typescript
// Check if content has changed
const currentHash = await hashBlob({ object: currentContent })
const previousHash = await hashBlob({ object: previousContent })

if (currentHash.oid !== previousHash.oid) {
  console.log('Content has changed')
}
```

### 3. Generate OID Before Writing

```typescript
// Get OID before writing to object database
const { oid } = await hashBlob({ object: content })
console.log('Will write object with OID:', oid)

// Then write it
await writeBlob({ fs, gitdir, blob: content })
```

## Best Practices

### 1. Use Consistent Format

```typescript
// ✅ Good: Use consistent format
const format = await detectObjectFormat(fs, gitdir)
const result = await hashBlob({
  object: content,
  objectFormat: format
})
```

### 2. Hash Before Writing

```typescript
// ✅ Good: Hash first to check if object exists
const { oid } = await hashBlob({ object: content })

// Check if object already exists
const exists = await readObject({ fs, cache, gitdir, oid }).catch(() => null)
if (!exists) {
  await writeBlob({ fs, gitdir, blob: content })
}
```

## See Also

- [Write Blob](./write-blob.md) - Write blob objects
- [Read Blob](./read-blob.md) - Read blob objects
- [SHA-256](./sha256.md) - SHA-256 object format

