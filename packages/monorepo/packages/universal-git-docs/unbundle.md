---
title: Unbundle
sidebar_label: unbundle
---

# unbundle

Restore a Git repository from a bundle file.

## Overview

The `unbundle` command:
- Extracts objects from bundle file
- Imports refs into repository
- Handles conflicts with existing refs
- Returns imported and rejected refs

## Basic Usage

```typescript
import { unbundle } from 'universal-git'

// Unbundle a repository
const result = await unbundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle'
})

console.log('Imported refs:', result.imported.size)
```

## Examples

### Example 1: Unbundle All Refs

```typescript
// Unbundle all refs from bundle
const result = await unbundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle'
})

console.log(`Imported ${result.imported.size} refs`)
if (result.rejected.size > 0) {
  console.log(`Rejected ${result.rejected.size} refs`)
}
```

### Example 2: Unbundle Specific Refs

```typescript
// Unbundle only specific refs
const result = await unbundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  refs: ['refs/heads/main', 'refs/tags/v1.0.0']
})
```

### Example 3: Handle Rejected Refs

```typescript
// Check for rejected refs
const result = await unbundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle'
})

if (result.rejected.size > 0) {
  for (const [ref, reason] of result.rejected) {
    console.log(`Rejected ${ref}: ${reason}`)
  }
}
```

### Example 4: Verify Before Unbundle

```typescript
// Verify bundle before unbundling
const verification = await verifyBundle({
  fs,
  filepath: '/path/to/repo.bundle'
})

if (verification.valid) {
  const result = await unbundle({
    fs,
    dir: '/path/to/repo',
    filepath: '/path/to/repo.bundle'
  })
  console.log('Unbundle complete')
} else {
  console.error('Cannot unbundle invalid bundle')
}
```

## API Reference

### `unbundle(options)`

Restore repository from bundle.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - Path to bundle file (required)
- `refs` - Refs to import (optional, imports all if not specified)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<UnbundleResult>` - Unbundle result

**UnbundleResult:**
```typescript
{
  imported: Map<string, string>   // Map of imported ref names to OIDs
  rejected: Map<string, string>    // Map of rejected ref names to reasons
}
```

## How It Works

1. **Reads bundle file** and parses header
2. **Extracts packfile** from bundle
3. **Writes packfile** to `objects/pack/`
4. **Creates packfile index** using `indexPack`
5. **Imports refs** (rejects if ref exists with different OID)

## Best Practices

### 1. Verify Before Unbundle

```typescript
// ✅ Good: Verify bundle before unbundling
const verification = await verifyBundle({
  fs,
  filepath: '/path/to/repo.bundle'
})

if (!verification.valid) {
  throw new Error(`Invalid bundle: ${verification.error}`)
}

await unbundle({ fs, dir: '/path/to/repo', filepath: '/path/to/repo.bundle' })
```

### 2. Check Rejected Refs

```typescript
// ✅ Good: Check for rejected refs
const result = await unbundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle'
})

if (result.rejected.size > 0) {
  console.warn('Some refs were rejected:')
  for (const [ref, reason] of result.rejected) {
    console.warn(`  ${ref}: ${reason}`)
  }
}
```

## Limitations

1. **Ref Conflicts**: Rejects refs that already exist with different OIDs
2. **No Fast-Forward**: Doesn't check if bundle OID is descendant of existing

## See Also

- [Bundle](./bundle.md) - Create bundles
- [Verify Bundle](./verify-bundle.md) - Verify bundle integrity

