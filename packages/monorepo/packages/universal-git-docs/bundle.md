---
title: Bundle
sidebar_label: bundle
---

# bundle

Create a Git bundle file containing repository objects and refs.

## Overview

The `bundle` command:
- Creates a single file containing Git objects and refs
- Useful for offline transfer or backup
- Supports bundle versions 2 and 3
- Can bundle specific refs or all refs

## Basic Usage

```typescript
import { bundle } from 'universal-git'

// Create a bundle
const result = await bundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  refs: ['refs/heads/main']
})
```

## Examples

### Example 1: Bundle Specific Branch

```typescript
// Bundle a specific branch
const result = await bundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  refs: ['refs/heads/main']
})

console.log('Bundle created:', result.filepath)
console.log('Refs bundled:', result.refs)
console.log('Objects:', result.objectCount)
```

### Example 2: Bundle All Refs

```typescript
// Bundle all refs
const result = await bundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  all: true
})
```

### Example 3: Bundle Multiple Refs

```typescript
// Bundle multiple refs
const result = await bundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  refs: [
    'refs/heads/main',
    'refs/heads/develop',
    'refs/tags/v1.0.0'
  ]
})
```

### Example 4: Bundle with Version 3

```typescript
// Create bundle with version 3
const result = await bundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  refs: ['refs/heads/main'],
  version: 3  // Use bundle version 3
})
```

## API Reference

### `bundle(options)`

Create a Git bundle file.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - Path to bundle file (required)
- `refs` - Refs to bundle (optional, required if `all: false`)
- `all` - Bundle all refs (optional, default: `false`)
- `version` - Bundle version: `2` or `3` (optional, default: `2`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<BundleResult>` - Bundle creation result

**BundleResult:**
```typescript
{
  filepath: string              // Path to bundle file
  refs: Map<string, string>      // Map of ref names to OIDs
  objectCount: number            // Number of objects in bundle
}
```

## Bundle Versions

### Version 2 (Default)

- Standard bundle format
- Compatible with most Git versions

### Version 3

- Newer format
- May have better compression

## Best Practices

### 1. Bundle Before Transfer

```typescript
// ✅ Good: Bundle before offline transfer
const result = await bundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  refs: ['refs/heads/main']
})

// Transfer bundle file to another location
// Then use unbundle to restore
```

### 2. Bundle Specific Refs

```typescript
// ✅ Good: Bundle only needed refs
const result = await bundle({
  fs,
  dir: '/path/to/repo',
  filepath: '/path/to/repo.bundle',
  refs: ['refs/heads/main', 'refs/tags/v1.0.0']
})
```

## Limitations

1. **Single File**: Creates one bundle file
2. **No Working Directory**: Only bundles Git objects, not working directory

## See Also

- [Unbundle](./unbundle.md) - Restore from bundle
- [Verify Bundle](./verify-bundle.md) - Verify bundle integrity

