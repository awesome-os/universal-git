---
title: Write Tree
sidebar_label: writeTree
---

# writeTree

Write a tree object directly to the Git object store.

## Overview

The `writeTree` command:
- Writes tree objects (directory listings) to Git
- Computes SHA-1 or SHA-256 hash automatically
- Returns the tree OID
- Supports dry-run mode

## Basic Usage

```typescript
import { writeTree } from 'universal-git'

// Write a tree
const oid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [
    { mode: '100644', type: 'blob', oid: 'abc123...', path: 'file.txt' }
  ]
})

console.log('Tree OID:', oid)
```

## Examples

### Example 1: Write Simple Tree

```typescript
// Write a tree with one file
const blobOid = await writeBlob({
  fs,
  dir: '/path/to/repo',
  blob: UniversalBuffer.from('Hello, world!')
})

const treeOid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [
    { mode: '100644', type: 'blob', oid: blobOid, path: 'hello.txt' }
  ]
})

console.log('Tree OID:', treeOid)
```

### Example 2: Write Tree with Multiple Files

```typescript
// Write tree with multiple files
const file1Oid = await writeBlob({ fs, dir, blob: UniversalBuffer.from('File 1') })
const file2Oid = await writeBlob({ fs, dir, blob: UniversalBuffer.from('File 2') })

const treeOid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [
    { mode: '100644', type: 'blob', oid: file1Oid, path: 'file1.txt' },
    { mode: '100644', type: 'blob', oid: file2Oid, path: 'file2.txt' }
  ]
})
```

### Example 3: Write Nested Tree Structure

```typescript
// Create nested tree structure
const nestedBlobOid = await writeBlob({ fs, dir, blob: UniversalBuffer.from('Nested') })
const nestedTreeOid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [
    { mode: '100644', type: 'blob', oid: nestedBlobOid, path: 'nested.txt' }
  ]
})

const rootBlobOid = await writeBlob({ fs, dir, blob: UniversalBuffer.from('Root') })
const rootTreeOid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [
    { mode: '100644', type: 'blob', oid: rootBlobOid, path: 'root.txt' },
    { mode: '040000', type: 'tree', oid: nestedTreeOid, path: 'subdir' }
  ]
})
```

### Example 4: Write Executable File

```typescript
// Write tree with executable file
const scriptOid = await writeBlob({ fs, dir, blob: UniversalBuffer.from('#!/bin/bash\necho hello') })
const treeOid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [
    { mode: '100755', type: 'blob', oid: scriptOid, path: 'script.sh' }  // Executable
  ]
})
```

### Example 5: Dry Run

```typescript
// Compute OID without writing
const treeOid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [...],
  dryRun: true
})

console.log('Would create tree with OID:', treeOid)
// Tree is not written to disk
```

## API Reference

### `writeTree(options)`

Write a tree object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `tree` - Tree object (required)
  - Array of `TreeEntry` objects
- `objectFormat` - Object format: `'sha1'` or `'sha256'` (optional, auto-detected)
- `dryRun` - Compute OID without writing (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID of the written tree

**TreeEntry:**
```typescript
{
  mode: string        // File mode (e.g., '100644', '040000')
  type: 'blob' | 'tree'  // Entry type
  oid: string         // Object OID
  path: string        // Entry path (filename or directory name)
}
```

## File Modes

Common file modes:
- `'100644'` - Regular file (non-executable)
- `'100755'` - Executable file
- `'040000'` - Directory (tree)
- `'120000'` - Symlink
- `'160000'` - Submodule

## Best Practices

### 1. Sort Entries

```typescript
// ✅ Good: Sort entries by path (Git requirement)
const entries = [
  { mode: '100644', type: 'blob', oid: blobOid, path: 'b.txt' },
  { mode: '100644', type: 'blob', oid: blobOid, path: 'a.txt' }
].sort((a, b) => a.path.localeCompare(b.path))

const treeOid = await writeTree({ fs, dir, tree: entries })
```

### 2. Build Trees from Bottom Up

```typescript
// ✅ Good: Build nested trees from bottom up
// 1. Create blobs
const blobOid = await writeBlob({ fs, dir, blob: ... })

// 2. Create nested tree
const nestedTreeOid = await writeTree({
  fs,
  dir,
  tree: [{ mode: '100644', type: 'blob', oid: blobOid, path: 'file.txt' }]
})

// 3. Create root tree with nested tree
const rootTreeOid = await writeTree({
  fs,
  dir,
  tree: [{ mode: '040000', type: 'tree', oid: nestedTreeOid, path: 'subdir' }]
})
```

## Limitations

1. **Entry Order**: Entries should be sorted by path
2. **Object Format**: Uses repository's object format
3. **Validation**: Doesn't validate tree structure

## See Also

- [Read Tree](./read-tree.md) - Read tree objects
- [Write Blob](./write-blob.md) - Write blob objects
- [Write Commit](./write-commit.md) - Write commit objects

