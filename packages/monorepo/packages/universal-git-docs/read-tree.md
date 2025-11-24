---
title: Read Tree
sidebar_label: readTree
---

# readTree

Read a tree object directly by its OID.

## Overview

The `readTree` command:
- Reads tree objects (directory listings)
- Can resolve filepaths within commits/trees
- Returns tree entries with file information
- Automatically peels tags and commits to find trees

## Basic Usage

```typescript
import { readTree } from 'universal-git'

// Read a tree
const { oid, tree } = await readTree({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Tree OID:', oid)
console.log('Entries:', tree)
```

## Examples

### Example 1: Read Tree by OID

```typescript
// Read tree directly by OID
const { oid, tree } = await readTree({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

for (const entry of tree) {
  console.log(`${entry.mode} ${entry.type} ${entry.oid} ${entry.path}`)
}
```

### Example 2: Read Tree from Commit

```typescript
// Read root tree from commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const { oid, tree } = await readTree({
  fs,
  dir: '/path/to/repo',
  oid: commitOid
})

console.log('Root tree entries:', tree)
```

### Example 3: Read Subdirectory Tree

```typescript
// Read a subdirectory tree
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const { oid, tree } = await readTree({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  filepath: 'src'  // Get src/ directory tree
})

console.log('src/ entries:', tree)
```

### Example 4: List Files in Tree

```typescript
// List all files in a tree
const { tree } = await readTree({
  fs,
  dir: '/path/to/repo',
  oid: treeOid
})

const files = tree
  .filter(entry => entry.type === 'blob')
  .map(entry => entry.path)

console.log('Files:', files)
```

### Example 5: Find Entry in Tree

```typescript
// Find a specific entry in tree
const { tree } = await readTree({
  fs,
  dir: '/path/to/repo',
  oid: treeOid
})

const entry = tree.find(e => e.path === 'README.md')
if (entry) {
  console.log('README.md OID:', entry.oid)
  console.log('Mode:', entry.mode)
}
```

## API Reference

### `readTree(options)`

Read a tree object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oid` - Object OID (required)
  - Can be tree OID, commit OID, or tag OID
  - Tags and commits are automatically peeled
- `filepath` - Resolve filepath within tree (optional)
  - If provided, resolves `oid` to a tree and returns tree at that path
- `objectFormat` - Object format: `'sha1'` or `'sha256'` (optional, auto-detected)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<ReadTreeResult>` - Tree result

**ReadTreeResult:**
```typescript
{
  oid: string      // Tree OID
  tree: TreeObject  // Array of tree entries
}
```

**TreeObject:**
```typescript
type TreeObject = TreeEntry[]

type TreeEntry = {
  mode: string     // File mode (e.g., '100644', '040000')
  type: 'blob' | 'tree'  // Entry type
  oid: string      // Object OID
  path: string     // Entry path
}
```

## Tree Entry Modes

Common file modes:
- `'100644'` - Regular file
- `'100755'` - Executable file
- `'040000'` - Directory (tree)
- `'120000'` - Symlink
- `'160000'` - Submodule

## Best Practices

### 1. Use for Directory Listings

```typescript
// ✅ Good: Use readTree for directory contents
const { tree } = await readTree({ fs, dir, oid: treeOid })
const files = tree.filter(e => e.type === 'blob')

// ⚠️ More complex: Use readObject and handle types
const result = await readObject({ fs, dir, oid: treeOid })
if (result.type === 'tree') {
  const files = result.object.filter((e: TreeEntry) => e.type === 'blob')
}
```

### 2. Navigate Tree Structure

```typescript
// Navigate tree structure
const rootTree = await readTree({ fs, dir, oid: commitOid })
const srcEntry = rootTree.tree.find(e => e.path === 'src')

if (srcEntry && srcEntry.type === 'tree') {
  const srcTree = await readTree({ fs, dir, oid: srcEntry.oid })
  console.log('src/ contents:', srcTree.tree)
}
```

## Limitations

1. **Flat Structure**: Tree entries are flat (no nested structure)
2. **Path Resolution**: Must manually navigate nested paths

## See Also

- [Write Tree](./write-tree.md) - Write tree objects
- [Read Object](./read-object.md) - Read any object type
- [List Files](./list-files.md) - List all files in tree

