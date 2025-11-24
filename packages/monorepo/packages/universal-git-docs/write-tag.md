---
title: Write Tag
sidebar_label: writeTag
---

# writeTag

Write an annotated tag object directly to the Git object store.

## Overview

The `writeTag` command:
- Writes annotated tag objects to Git
- Computes SHA-1 or SHA-256 hash automatically
- Returns the tag OID
- Supports both parsed and raw formats
- Supports dry-run mode

## Basic Usage

```typescript
import { writeTag } from 'universal-git'

// Write an annotated tag
const oid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {
    object: 'abc123...',
    type: 'commit',
    tag: 'v1.0.0',
    tagger: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    message: 'Release version 1.0.0'
  }
})

console.log('Tag OID:', oid)
```

## Examples

### Example 1: Write Simple Tag

```typescript
// Create annotated tag
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {
    object: commitOid,
    type: 'commit',
    tag: 'v1.0.0',
    tagger: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    message: 'Release version 1.0.0'
  }
})

console.log('Tag OID:', tagOid)
```

### Example 2: Write Tag Without Message

```typescript
// Create tag without message
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {
    object: commitOid,
    type: 'commit',
    tag: 'v1.0.0',
    tagger: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    }
    // message is optional
  }
})
```

### Example 3: Write Signed Tag

```typescript
// Create signed tag
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {
    object: commitOid,
    type: 'commit',
    tag: 'v1.0.0',
    tagger: {...},
    message: 'Release version 1.0.0',
    gpgsig: '-----BEGIN PGP SIGNATURE-----\n...\n-----END PGP SIGNATURE-----'
  }
})
```

### Example 4: Write Tag from Raw Buffer

```typescript
// Write tag from raw buffer (for signed tags)
const tagBuffer = UniversalBuffer.from('object abc123...\n...')
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tagBuffer: tagBuffer,
  format: 'content'  // Use raw buffer format
})
```

### Example 5: Dry Run

```typescript
// Compute OID without writing
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {...},
  dryRun: true
})

console.log('Would create tag with OID:', tagOid)
// Tag is not written to disk
```

## API Reference

### `writeTag(options)`

Write an annotated tag object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `tag` - Tag object (required if `format: 'parsed'`)
- `tagBuffer` - Raw tag buffer (required if `format: 'content'`)
- `format` - Format: `'parsed'` or `'content'` (optional, default: `'parsed'`)
- `dryRun` - Compute OID without writing (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID of the written tag

**TagObject (parsed format):**
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
  message?: string   // Tag message (optional)
  gpgsig?: string    // GPG signature (optional)
}
```

## Format Options

### Parsed Format (Default)

```typescript
// Use TagObject structure
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {
    object: commitOid,
    type: 'commit',
    tag: 'v1.0.0',
    tagger: {...},
    message: 'Release'
  },
  format: 'parsed'
})
```

### Content Format

```typescript
// Use raw buffer (for signed tags)
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tagBuffer: rawTagBuffer,
  format: 'content'
})
```

## Best Practices

### 1. Use for Annotated Tags

```typescript
// ✅ Good: Use writeTag for annotated tags
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {...}
})

// Then create ref pointing to tag
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0',
  value: tagOid
})

// ⚠️ For lightweight tags: Use tag command
await tag({ fs, dir, ref: 'v1.0.0' })
```

### 2. Normalize Timestamps

```typescript
// ✅ Good: Use proper timestamp format
const timestamp = Math.floor(Date.now() / 1000)
const timezoneOffset = new Date().getTimezoneOffset()

await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {
    ...,
    tagger: {
      ...,
      timestamp,
      timezoneOffset
    }
  }
})
```

## Limitations

1. **No Ref Creation**: Doesn't create the ref (use `writeRef` after)
2. **Annotated Only**: Creates annotated tags (not lightweight)
3. **Object Format**: Uses repository's object format

## See Also

- [Read Tag](./read-tag.md) - Read annotated tag objects
- [Tag](./tag.md) - Create lightweight tags
- [Write Ref](./write-ref.md) - Create tag refs

