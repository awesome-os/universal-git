---
title: Expand OID
sidebar_label: expandOid
---

# expandOid

Expands a short object ID (OID) to its full form by finding the unique object that matches the prefix.

## Overview

`expandOid` allows you to:
- Use short commit hashes (e.g., `abc123` instead of full 40/64 characters)
- Find unique objects by prefix
- Resolve ambiguous short OIDs (if unique)

## Basic Usage

```typescript
import { expandOid } from 'universal-git'

// Expand short OID to full OID
const fullOid = await expandOid({
  fs,
  gitdir: '/path/to/.git',
  oid: 'abc123'  // Short OID
})

console.log(fullOid) // Full OID: 'abc123def4567890123456789012345678901234'
```

## Examples

### Example 1: Expand Short Commit Hash

```typescript
// Use short hash in commands
const shortOid = 'abc123'

// Expand to full OID
const fullOid = await expandOid({
  fs,
  gitdir: '/path/to/.git',
  oid: shortOid
})

// Use full OID
const commit = await readCommit({
  fs,
  gitdir: '/path/to/.git',
  oid: fullOid
})
```

### Example 2: Handle Ambiguous OIDs

```typescript
try {
  const fullOid = await expandOid({
    fs,
    gitdir: '/path/to/.git',
    oid: 'abc'  // Very short, might be ambiguous
  })
  console.log('Unique OID:', fullOid)
} catch (error) {
  if (error.code === 'AmbiguousError') {
    console.log('OID is ambiguous, multiple matches found')
    console.log('Matches:', error.data.matches)
  }
}
```

### Example 3: Use in Commands

```typescript
// Expand OID before using in commands
const shortOid = 'abc123'
const fullOid = await expandOid({ fs, gitdir, oid: shortOid })

// Use in checkout
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: fullOid
})
```

## API Reference

### `expandOid(options)`

Expands a short OID to its full form.

**Parameters:**

- `fs` - File system client (required)
- `gitdir` - Git directory (required)
- `oid` - Short OID to expand (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - Full OID

**Throws:**

- `AmbiguousError` - If multiple objects match the prefix
- `NotFoundError` - If no object matches the prefix

## How It Works

1. **Searches all objects** in the repository (loose and packed)
2. **Finds objects** that start with the given prefix
3. **Returns the full OID** if exactly one match is found
4. **Throws AmbiguousError** if multiple matches are found
5. **Throws NotFoundError** if no matches are found

## Minimum Length

- **SHA-1**: Minimum 4 characters (Git's default)
- **SHA-256**: Minimum 4 characters

**Note**: Very short prefixes may match multiple objects and cause ambiguity.

## Best Practices

### 1. Use Reasonable Length

```typescript
// ✅ Good: Use at least 7-8 characters
const fullOid = await expandOid({ fs, gitdir, oid: 'abc1234' })

// ⚠️ Careful: Very short prefixes may be ambiguous
const fullOid = await expandOid({ fs, gitdir, oid: 'abc' })
```

### 2. Handle Ambiguity

```typescript
try {
  const fullOid = await expandOid({ fs, gitdir, oid: shortOid })
  // Use fullOid
} catch (error) {
  if (error.code === 'AmbiguousError') {
    // Use a longer prefix
    const longerOid = shortOid + 'def'
    const fullOid = await expandOid({ fs, gitdir, oid: longerOid })
  }
}
```

### 3. Check if Already Full

```typescript
// Check if OID is already full length
const isFull = oid.length === 40 || oid.length === 64

if (isFull) {
  // Already full, use directly
  const commit = await readCommit({ fs, gitdir, oid })
} else {
  // Expand first
  const fullOid = await expandOid({ fs, gitdir, oid })
  const commit = await readCommit({ fs, gitdir, oid: fullOid })
}
```

## Limitations

1. **Performance**: Searching all objects can be slow for large repositories
2. **Ambiguity**: Short prefixes may match multiple objects
3. **Not Found**: Very short prefixes may not match any objects

## Troubleshooting

### Ambiguous OID

If you get an ambiguous OID error:

```typescript
try {
  await expandOid({ fs, gitdir, oid: 'abc' })
} catch (error) {
  if (error.code === 'AmbiguousError') {
    // Use a longer prefix
    const matches = error.data.matches
    console.log('Matches:', matches)
    
    // Use more characters
    const longerOid = 'abc1234'
    const fullOid = await expandOid({ fs, gitdir, oid: longerOid })
  }
}
```

### OID Not Found

If no object matches:

```typescript
try {
  await expandOid({ fs, gitdir, oid: 'xyz' })
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('No object found with that prefix')
    // Use a different OID or fetch objects
  }
}
```

## See Also

- [Expand Ref](./expand-ref.md) - Expand reference names
- [Read Object](./read-object.md) - Read objects
- [Hash Blob](./hash-blob.md) - Hash objects

