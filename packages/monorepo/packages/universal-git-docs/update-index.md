---
title: Update Index
sidebar_label: updateIndex
---

# updateIndex

Register file contents in the working tree or object database to the Git index.

## Overview

The `updateIndex` command:
- Adds files to the index manually
- Can specify OID directly (from object database)
- Supports add, remove, and force modes
- Low-level index manipulation

## Basic Usage

```typescript
import { updateIndex } from 'universal-git'

// Update index with file from working tree
const oid = await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt'
})
```

## Examples

### Example 1: Add File from Working Tree

```typescript
// Add file from working tree to index
const oid = await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt',
  add: true
})

console.log('File OID:', oid)
```

### Example 2: Add File with Specific OID

```typescript
// Add file to index with specific OID
const blobOid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob: UniversalBuffer.from('content')
})

await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt',
  oid: blobOid,
  add: true
})
```

### Example 3: Set File Mode

```typescript
// Add executable file
await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'script.sh',
  mode: 0o100755,  // Executable
  add: true
})
```

### Example 4: Remove File from Index

```typescript
// Remove file from index (if not in working tree)
await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'deleted-file.txt',
  remove: true
})
```

### Example 5: Force Remove

```typescript
// Force remove file from index (even if exists in working tree)
await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt',
  force: true  // Remove even if file exists
})
```

## API Reference

### `updateIndex(options)`

Update the Git index.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - File path to update (required)
- `oid` - Object OID to use (optional)
  - If not provided, reads from working tree
- `mode` - File mode (optional, default: `0o100644`)
- `add` - Add file if doesn't exist (optional, default: `false`)
- `remove` - Remove file if not in working tree (optional, default: `false`)
- `force` - Force remove even if file exists (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string | void>` - OID of the object added, or `void` if removed

## File Modes

Common file modes:
- `0o100644` - Regular file (default)
- `0o100755` - Executable file
- `0o120000` - Symlink
- `0o160000` - Submodule

## Best Practices

### 1. Use Add Command for Normal Operations

```typescript
// ✅ Good: Use add command for normal staging
await add({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// ⚠️ Use updateIndex for: Custom OIDs, specific modes, low-level control
await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt',
  oid: customOid,
  mode: 0o100755,
  add: true
})
```

### 2. Specify Mode for Executables

```typescript
// ✅ Good: Set executable mode
await updateIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'script.sh',
  mode: 0o100755,  // Executable
  add: true
})
```

## Limitations

1. **Low-Level**: More complex than `add` command
2. **Single File**: Updates one file at a time
3. **Manual OID**: Requires manual OID management if not using working tree

## See Also

- [Add](./add.md) - Stage files (higher-level)
- [Remove](./remove.md) - Remove files from index
- [Reset Index](./reset-index.md) - Reset index to commit

