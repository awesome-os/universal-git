---
title: Verify Bundle
sidebar_label: verifyBundle
---

# verifyBundle

Verify the integrity of a Git bundle file.

## Overview

The `verifyBundle` command:
- Validates bundle file format
- Checks bundle header
- Verifies packfile structure
- Returns bundle information

## Basic Usage

```typescript
import { verifyBundle } from 'universal-git'

// Verify a bundle
const result = await verifyBundle({
  fs,
  filepath: '/path/to/repo.bundle'
})

if (result.valid) {
  console.log('Bundle is valid')
} else {
  console.error('Bundle is invalid:', result.error)
}
```

## Examples

### Example 1: Verify Bundle

```typescript
// Verify bundle file
const result = await verifyBundle({
  fs,
  filepath: '/path/to/repo.bundle'
})

if (result.valid) {
  console.log(`Bundle is valid (version ${result.version})`)
  console.log(`Contains ${result.refs.length} refs`)
} else {
  console.error('Bundle is invalid:', result.error)
}
```

### Example 2: Check Bundle Refs

```typescript
// Verify and inspect refs
const result = await verifyBundle({
  fs,
  filepath: '/path/to/repo.bundle'
})

if (result.valid) {
  for (const { ref, oid } of result.refs) {
    console.log(`${ref}: ${oid}`)
  }
}
```

### Example 3: Validate Before Unbundle

```typescript
// Verify before unbundling
const result = await verifyBundle({
  fs,
  filepath: '/path/to/repo.bundle'
})

if (result.valid) {
  await unbundle({
    fs,
    dir: '/path/to/repo',
    filepath: '/path/to/repo.bundle'
  })
} else {
  console.error('Cannot unbundle invalid bundle')
}
```

## API Reference

### `verifyBundle(options)`

Verify a Git bundle file.

**Parameters:**

- `fs` - File system client (required)
- `filepath` - Path to bundle file (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<VerifyBundleResult>` - Verification result

**VerifyBundleResult:**
```typescript
{
  valid: boolean                    // Whether bundle is valid
  version: 2 | 3                    // Bundle version
  refs: Array<{ ref: string; oid: string }>  // Refs in bundle
  error?: string                    // Error message if invalid
}
```

## Best Practices

### 1. Verify Before Unbundle

```typescript
// ✅ Good: Verify before unbundling
const result = await verifyBundle({
  fs,
  filepath: '/path/to/repo.bundle'
})

if (result.valid) {
  await unbundle({ fs, dir: '/path/to/repo', filepath: '/path/to/repo.bundle' })
} else {
  throw new Error(`Invalid bundle: ${result.error}`)
}
```

## Limitations

1. **Basic Validation**: Performs basic format checks, not full object validation
2. **No Object Verification**: Doesn't verify all objects in packfile

## See Also

- [Bundle](./bundle.md) - Create bundles
- [Unbundle](./unbundle.md) - Restore from bundle

