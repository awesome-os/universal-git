---
title: Walk
sidebar_label: walk
---

# walk

A powerful recursive tree-walking utility for traversing Git trees, working directory, and staging area.

## Overview

The `walk` command:
- Traverses multiple trees simultaneously
- Supports Git commits, working directory, and staging area
- Provides map, reduce, and iterate functions for customization
- Efficiently handles large repositories
- Traverses entries in alphabetical order

## Basic Usage

```typescript
import { walk, TREE, WORKDIR, STAGE } from 'universal-git'

// Walk a commit tree
const result = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' })]
})
```

## Examples

### Example 1: List All Files in Commit

```typescript
// List all files in a commit
const files = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' })],
  map: async (filepath, entries) => {
    const entry = entries[0]
    if (entry && entry.type === 'blob') {
      return filepath
    }
    return undefined
  }
})

console.log('Files:', files)
```

### Example 2: Compare Working Directory with Commit

```typescript
// Compare working directory with HEAD
const differences = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' }), WORKDIR()],
  map: async (filepath, entries) => {
    const [headEntry, workdirEntry] = entries
    if (headEntry?.oid !== workdirEntry?.oid) {
      return { filepath, head: headEntry?.oid, workdir: workdirEntry?.oid }
    }
    return undefined
  }
})

console.log('Differences:', differences)
```

### Example 3: Get File Sizes

```typescript
// Calculate total file sizes
const totalSize = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' })],
  map: async (filepath, entries) => {
    const entry = entries[0]
    if (entry && entry.type === 'blob') {
      // Read blob to get size
      const { blob } = await readBlob({ fs, dir, oid: entry.oid })
      return blob.length
    }
    return 0
  },
  reduce: async (parent, children) => {
    const childrenSum = children.reduce((sum, size) => sum + (size as number), 0)
    return (parent as number) + childrenSum
  }
})

console.log('Total size:', totalSize)
```

### Example 4: Filter by Extension

```typescript
// Get only TypeScript files
const tsFiles = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' })],
  map: async (filepath, entries) => {
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
      return filepath
    }
    return undefined
  }
})

console.log('TypeScript files:', tsFiles)
```

### Example 5: Compare Multiple Commits

```typescript
// Compare two commits
const differences = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [
    TREE({ ref: 'main' }),
    TREE({ ref: 'feature-branch' })
  ],
  map: async (filepath, entries) => {
    const [mainEntry, featureEntry] = entries
    if (mainEntry?.oid !== featureEntry?.oid) {
      return {
        filepath,
        main: mainEntry?.oid,
        feature: featureEntry?.oid
      }
    }
    return undefined
  }
})
```

## API Reference

### `walk(options)`

Walk multiple trees recursively.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `trees` - Array of walkers (required)
  - Use `TREE({ ref })` for commits
  - Use `WORKDIR()` for working directory
  - Use `STAGE()` for staging area
- `map` - Transform function (optional)
  - `(filepath: string, entries: WalkerEntry[]) => Promise<any>`
  - Called for each file/directory
- `reduce` - Combine function (optional)
  - `(parent: any, children: any[]) => Promise<any>`
  - Combines parent with children results
- `iterate` - Iteration function (optional)
  - Controls how children are processed
- `cache` - Cache object (optional)

**Returns:**

- `Promise<any>` - Result of the walk (depends on map/reduce functions)

## Walker Types

### TREE

Walk a Git commit tree:

```typescript
import { TREE } from 'universal-git'

const trees = [
  TREE({ ref: 'HEAD' }),
  TREE({ ref: 'main' }),
  TREE({ ref: 'abc123...' })
]
```

### WORKDIR

Walk the working directory:

```typescript
import { WORKDIR } from 'universal-git'

const trees = [WORKDIR()]
```

### STAGE

Walk the staging area (index):

```typescript
import { STAGE } from 'universal-git'

const trees = [STAGE()]
```

## Transform Functions

### Map Function

Transforms each entry:

```typescript
map: async (filepath, entries) => {
  // entries[0] is from first tree, entries[1] from second, etc.
  const entry = entries[0]
  if (entry && entry.type === 'blob') {
    return filepath  // Return filepath for blobs
  }
  return undefined  // Skip directories
}
```

### Reduce Function

Combines parent with children:

```typescript
reduce: async (parent, children) => {
  // Default: flatmap that filters undefineds
  const flatten = children.flat()
  if (parent !== undefined) flatten.unshift(parent)
  return flatten
}
```

## Best Practices

### 1. Use for Large Repositories

```typescript
// ✅ Good: Use walk for large repos (more efficient than listFiles)
const files = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' })],
  map: async (filepath, entries) => {
    const entry = entries[0]
    return entry?.type === 'blob' ? filepath : undefined
  }
})

// ⚠️ Slower: listFiles may be slow for large repos
const files = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD' })
```

### 2. Filter Early in Map

```typescript
// ✅ Good: Filter in map function
const tsFiles = await walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' })],
  map: async (filepath, entries) => {
    if (!filepath.endsWith('.ts')) return undefined  // Early filter
    return filepath
  }
})
```

## Limitations

1. **Complexity**: Map/reduce functions can be complex
2. **Performance**: May be slower than simple operations for small repos
3. **Memory**: Large results may consume significant memory

## See Also

- [List Files](./list-files.md) - Simple file listing
- [Status Matrix](./status-matrix.md) - Status comparison
- [Diff](./diff.md) - Show differences

