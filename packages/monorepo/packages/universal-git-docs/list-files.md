---
title: List Files
sidebar_label: listFiles
---

# listFiles

List all files in the Git index or a specific commit.

## Overview

The `listFiles` command:
- Lists files in the staging area (index) by default
- Can list files from a specific commit
- Returns array of file paths
- Efficient for index, slower for commits

## Basic Usage

```typescript
import { listFiles } from 'universal-git'

// List files in index
const files = await listFiles({
  fs,
  dir: '/path/to/repo'
})

console.log('Files:', files)
```

## Examples

### Example 1: List Staged Files

```typescript
// List all files in the staging area
const files = await listFiles({
  fs,
  dir: '/path/to/repo'
})

console.log('Staged files:', files)
// ['src/index.ts', 'src/utils.ts', 'README.md']
```

### Example 2: List Files from Commit

```typescript
// List files from a specific commit
const files = await listFiles({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD'
})

console.log('Files in HEAD:', files)
```

### Example 3: List Files from Branch

```typescript
// List files from a branch
const files = await listFiles({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})

console.log('Files in feature-branch:', files)
```

### Example 4: Compare Index vs Commit

```typescript
// Compare staged files vs committed files
const stagedFiles = await listFiles({ fs, dir: '/path/to/repo' })
const committedFiles = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD' })

const newFiles = stagedFiles.filter(f => !committedFiles.includes(f))
const removedFiles = committedFiles.filter(f => !stagedFiles.includes(f))

console.log('New files:', newFiles)
console.log('Removed files:', removedFiles)
```

### Example 5: Filter Files

```typescript
// List files and filter by extension
const allFiles = await listFiles({ fs, dir: '/path/to/repo' })
const tsFiles = allFiles.filter(f => f.endsWith('.ts'))

console.log('TypeScript files:', tsFiles)
```

## API Reference

### `listFiles(options)`

List files in index or commit.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Reference or OID to list files from (optional)
  - If not provided, lists files from index (staging area)
  - If provided, lists files from that commit
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string[]>` - Array of file paths

## Performance Notes

### Index (Fast)

```typescript
// ✅ Fast: Reading from index
const files = await listFiles({ fs, dir: '/path/to/repo' })
// Reads directly from .git/index
```

### Commit (Slower)

```typescript
// ⚠️ Slower: Reading from commit requires walking tree
const files = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD' })
// Must recursively walk commit's tree
```

### Use Walk for Large Repos

```typescript
// ✅ Better for large repos: Use walk with filter
import { walk } from 'universal-git'

const files: string[] = []
for await (const entry of walk({
  fs,
  dir: '/path/to/repo',
  trees: [TREE({ ref: 'HEAD' })]
})) {
  if (entry.type === 'blob') {
    files.push(entry.path)
  }
}
```

## Use Cases

### Get Staged Files

```typescript
// Get list of staged files
const stagedFiles = await listFiles({ fs, dir: '/path/to/repo' })
console.log(`${stagedFiles.length} files staged`)
```

### Check File Exists in Commit

```typescript
// Check if file exists in a commit
const files = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD' })
const hasFile = files.includes('src/index.ts')

if (hasFile) {
  console.log('File exists in HEAD')
}
```

### Get All Tracked Files

```typescript
// Get all files tracked by Git
const trackedFiles = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD' })
console.log(`Repository tracks ${trackedFiles.length} files`)
```

## Best Practices

### 1. Use for Index Operations

```typescript
// ✅ Good: Use for index (staging area)
const stagedFiles = await listFiles({ fs, dir: '/path/to/repo' })
// Fast and efficient

// ⚠️ Slower: Use walk for commits in large repos
const files = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD' })
// May be slow for large repositories
```

### 2. Cache Results

```typescript
// ✅ Good: Cache results for repeated use
const cache = {}
const files1 = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD', cache })
const files2 = await listFiles({ fs, dir: '/path/to/repo', ref: 'HEAD', cache })
// Second call uses cache
```

## Limitations

1. **Commit Performance**: Can be slow for large commits (use `walk` instead)
2. **No Filtering**: Returns all files (filter manually if needed)
3. **No Directories**: Only returns file paths, not directories

## See Also

- [Walk](./walk.md) - Walk repository tree (better for large repos)
- [Status Matrix](./status-matrix.md) - Get status of multiple files
- [Add](./add.md) - Stage files

