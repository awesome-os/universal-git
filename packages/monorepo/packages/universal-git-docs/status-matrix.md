---
title: Status Matrix
sidebar_label: statusMatrix
---

# statusMatrix

Efficiently get the status of multiple files at once using a compact matrix format.

## Overview

The `statusMatrix` command:
- Returns status information for multiple files in a single call
- Uses a compact matrix format for efficiency
- Supports filtering files
- Provides detailed status for HEAD, working directory, and staging area

## Basic Usage

```typescript
import { statusMatrix } from 'universal-git'

// Get status of all files
const matrix = await statusMatrix({
  fs,
  dir: '/path/to/repo'
})

console.log(matrix)
// [
//   ['file1.txt', 1, 1, 1],  // unmodified
//   ['file2.txt', 1, 2, 2],  // modified, staged
//   ['file3.txt', 0, 2, 0],  // new, untracked
// ]
```

## Examples

### Example 1: Get Status of All Files

```typescript
// Get status matrix for all files
const matrix = await statusMatrix({
  fs,
  dir: '/path/to/repo'
})

for (const [filepath, head, workdir, stage] of matrix) {
  console.log(`${filepath}: HEAD=${head}, WORKDIR=${workdir}, STAGE=${stage}`)
}
```

### Example 2: Filter Files

```typescript
// Get status of files in 'src' directory
const matrix = await statusMatrix({
  fs,
  dir: '/path/to/repo',
  filter: (filepath) => filepath.startsWith('src/')
})

console.log('Files in src:', matrix.map(row => row[0]))
```

### Example 3: Filter by Extension

```typescript
// Get status of JSON and Markdown files
const matrix = await statusMatrix({
  fs,
  dir: '/path/to/repo',
  filter: (filepath) => 
    filepath.endsWith('.json') || filepath.endsWith('.md')
})

console.log('JSON/MD files:', matrix)
```

### Example 4: Interpret Status Values

```typescript
// Interpret status matrix
const matrix = await statusMatrix({ fs, dir: '/path/to/repo' })

for (const [filepath, head, workdir, stage] of matrix) {
  let status = 'unknown'
  
  if (head === 0 && workdir === 2 && stage === 0) {
    status = 'new, untracked'
  } else if (head === 0 && workdir === 2 && stage === 2) {
    status = 'added, staged'
  } else if (head === 1 && workdir === 1 && stage === 1) {
    status = 'unmodified'
  } else if (head === 1 && workdir === 2 && stage === 1) {
    status = 'modified, unstaged'
  } else if (head === 1 && workdir === 2 && stage === 2) {
    status = 'modified, staged'
  } else if (head === 1 && workdir === 0 && stage === 1) {
    status = 'deleted, unstaged'
  } else if (head === 1 && workdir === 0 && stage === 0) {
    status = 'deleted, staged'
  }
  
  console.log(`${filepath}: ${status}`)
}
```

## API Reference

### `statusMatrix(options)`

Get status matrix for files.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filter` - Filter function for filepaths (optional)
  - Function: `(filepath: string) => boolean`
  - Return `true` to include file, `false` to exclude
- `cache` - Cache object (optional)

**Returns:**

- `Promise<StatusRow[]>` - Array of status rows

**StatusRow:**
```typescript
type StatusRow = [string, HeadStatus, WorkdirStatus, StageStatus]
```

**Status Types:**
```typescript
type HeadStatus = 0 | 1      // 0 = absent, 1 = present
type WorkdirStatus = 0 | 1 | 2  // 0 = absent, 1 = identical to HEAD, 2 = different
type StageStatus = 0 | 1 | 2 | 3  // 0 = absent, 1 = identical to HEAD, 2 = identical to WORKDIR, 3 = different
```

## Status Value Meanings

### Head Status
- `0` - File is not in HEAD (new file)
- `1` - File is in HEAD

### Workdir Status
- `0` - File is absent in working directory (deleted)
- `1` - File is identical to HEAD
- `2` - File is different from HEAD (modified)

### Stage Status
- `0` - File is absent in staging area
- `1` - File is identical to HEAD
- `2` - File is identical to working directory
- `3` - File is different from both HEAD and working directory

## Common Status Patterns

| Pattern | Description |
|---------|-------------|
| `[file, 0, 2, 0]` | New, untracked file |
| `[file, 0, 2, 2]` | Added, staged |
| `[file, 0, 2, 3]` | Added, staged, with unstaged changes |
| `[file, 1, 1, 1]` | Unmodified |
| `[file, 1, 2, 1]` | Modified, unstaged |
| `[file, 1, 2, 2]` | Modified, staged |
| `[file, 1, 2, 3]` | Modified, staged, with unstaged changes |
| `[file, 1, 0, 1]` | Deleted, unstaged |
| `[file, 1, 0, 0]` | Deleted, staged |
| `[file, 1, 2, 0]` | Deleted, staged, with unstaged-modified changes (new file of same name) |
| `[file, 1, 1, 0]` | Deleted, staged, with unstaged changes (new file of same name) |

## Best Practices

### 1. Use for Bulk Operations

```typescript
// ✅ Good: Get status of all files at once
const matrix = await statusMatrix({ fs, dir: '/path/to/repo' })
const modifiedFiles = matrix
  .filter(([_, head, workdir]) => head === 1 && workdir === 2)
  .map(([filepath]) => filepath)

// ⚠️ Slower: Check status one file at a time
for (const file of files) {
  const status = await status({ fs, dir, filepath: file })
  // ...
}
```

### 2. Filter Early

```typescript
// ✅ Good: Filter during statusMatrix call
const matrix = await statusMatrix({
  fs,
  dir: '/path/to/repo',
  filter: (filepath) => filepath.startsWith('src/')
})

// ⚠️ Less efficient: Filter after getting all files
const allMatrix = await statusMatrix({ fs, dir: '/path/to/repo' })
const filtered = allMatrix.filter(([filepath]) => filepath.startsWith('src/'))
```

## Performance Notes

- **Efficient**: Single call gets status for all files
- **Fast**: Avoids multiple individual status checks
- **Compact**: Dense format minimizes memory usage
- **Filtered**: Can filter during collection for better performance

## Limitations

1. **Format Complexity**: Matrix format requires interpretation
2. **No Details**: Doesn't provide diff details (use `diff` for that)
3. **All Files**: By default includes all tracked and untracked files

## See Also

- [Status](./status.md) - Get status of a single file
- [Diff](./diff.md) - Show differences
- [Add](./add.md) - Stage files


