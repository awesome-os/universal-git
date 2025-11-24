---
title: Remove
sidebar_label: remove
---

# remove

Remove a file from the Git index (staging area).

## Overview

The `remove` command:
- Removes files from the staging area (index)
- Does NOT delete files from working directory
- Unstages files that were previously added
- Updates the index immediately

## Basic Usage

```typescript
import { remove } from 'universal-git'

// Remove file from index
await remove({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt'
})
```

## Examples

### Example 1: Unstage File

```typescript
// Remove file from staging area
await remove({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt'
})

// File still exists in working directory, but is no longer staged
```

### Example 2: Unstage Multiple Files

```typescript
// Remove multiple files from index
const files = ['file1.txt', 'file2.txt', 'file3.txt']

for (const file of files) {
  await remove({ fs, dir: '/path/to/repo', filepath: file })
}
```

### Example 3: Unstage All Files

```typescript
// Remove all files from index
const stagedFiles = await listFiles({ fs, dir: '/path/to/repo' })

for (const file of stagedFiles) {
  await remove({ fs, dir: '/path/to/repo', filepath: file })
}
```

### Example 4: Check Status After Remove

```typescript
// Remove file and check status
await remove({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

const status = await status({ fs, dir: '/path/to/repo', filepath: 'file.txt' })
console.log('Status:', status)
// 'modified' or 'untracked' (no longer 'added' or '*added')
```

## API Reference

### `remove(options)`

Remove a file from the Git index.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - File path to remove from index (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when file is removed from index

## How It Works

1. **Reads current index**
2. **Removes entry** for the specified filepath
3. **Writes updated index** back to disk
4. **File remains** in working directory

## Important Notes

### File Not Deleted

```typescript
// remove() does NOT delete the file
await remove({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// File still exists in working directory
const exists = await fs.exists('/path/to/repo/file.txt')
console.log('File exists:', exists)  // true
```

### Unstages, Not Deletes

```typescript
// Before: file.txt is staged (status: 'added')
await add({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// After remove: file.txt is unstaged (status: 'modified' or 'untracked')
await remove({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// File still exists in working directory
```

## Best Practices

### 1. Use for Unstaging

```typescript
// ✅ Good: Use remove to unstage files
await remove({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// ⚠️ Different operation: Use fs.unlink to delete file
await fs.unlink('/path/to/repo/file.txt')
```

### 2. Verify Before Removing

```typescript
// ✅ Good: Check if file is staged before removing
const stagedFiles = await listFiles({ fs, dir: '/path/to/repo' })
if (stagedFiles.includes('file.txt')) {
  await remove({ fs, dir: '/path/to/repo', filepath: 'file.txt' })
} else {
  console.log('File is not staged')
}
```

## Use Cases

### Unstage Accidentally Added Files

```typescript
// Unstage file that was accidentally added
await remove({ fs, dir: '/path/to/repo', filepath: 'temp-file.txt' })
```

### Partial Staging

```typescript
// Stage some files, then unstage one
await add({ fs, dir: '/path/to/repo', filepath: 'file1.txt' })
await add({ fs, dir: '/path/to/repo', filepath: 'file2.txt' })
await add({ fs, dir: '/path/to/repo', filepath: 'file3.txt' })

// Unstage file2.txt
await remove({ fs, dir: '/path/to/repo', filepath: 'file2.txt' })

// Now only file1.txt and file3.txt are staged
```

## Limitations

1. **Index Only**: Only affects staging area, not working directory
2. **No Recursion**: Does not remove directories recursively
3. **Single File**: Removes one file at a time

## See Also

- [Add](./add.md) - Stage files
- [Status](./status.md) - Check file status
- [Reset Index](./reset-index.md) - Reset entire index

