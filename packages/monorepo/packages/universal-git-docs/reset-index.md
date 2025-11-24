---
title: Reset Index
sidebar_label: resetIndex
---

# resetIndex

Reset a file in the Git index to match a specific commit.

## Overview

The `resetIndex` command:
- Resets a file in the index to match a commit
- Does NOT modify the working directory file
- Updates the index entry to match the commit version
- Useful for unstaging changes

## Basic Usage

```typescript
import { resetIndex } from 'universal-git'

// Reset file in index to HEAD
await resetIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt'
})
```

## Examples

### Example 1: Reset File to HEAD

```typescript
// Reset file in index to match HEAD
await resetIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt'
})

// File is no longer staged, but working directory file is unchanged
```

### Example 2: Reset File to Specific Commit

```typescript
// Reset file in index to match a specific commit
await resetIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt',
  ref: 'abc123...'  // Reset to this commit
})
```

### Example 3: Reset Multiple Files

```typescript
// Reset multiple files
const files = ['file1.txt', 'file2.txt', 'file3.txt']

for (const file of files) {
  await resetIndex({ fs, dir: '/path/to/repo', filepath: file })
}
```

### Example 4: Unstage All Changes

```typescript
// Reset all staged files to HEAD
const stagedFiles = await listFiles({ fs, dir: '/path/to/repo' })

for (const file of stagedFiles) {
  await resetIndex({ fs, dir: '/path/to/repo', filepath: file })
}
```

## API Reference

### `resetIndex(options)`

Reset a file in the Git index.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - File path to reset (required)
- `ref` - Commit to reset to (optional, default: `'HEAD'`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when file is reset in index

## How It Works

1. **Resolves commit** (default: HEAD)
2. **Gets file OID** from commit's tree
3. **Updates index entry** to match commit version
4. **Working directory** file remains unchanged

## Important Notes

### File Not Modified

```typescript
// resetIndex does NOT modify the working directory file
await resetIndex({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// File still exists in working directory with its current content
const content = await fs.read('/path/to/repo/file.txt', 'utf8')
// Content is unchanged
```

### Unstages Changes

```typescript
// Before: file.txt is staged with modifications
await add({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// After resetIndex: file.txt is unstaged (matches HEAD)
await resetIndex({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// Status will show file as modified (not staged)
```

## Best Practices

### 1. Use for Unstaging

```typescript
// ✅ Good: Use resetIndex to unstage changes
await resetIndex({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// ⚠️ Different: Use remove to remove from index entirely
await remove({ fs, dir: '/path/to/repo', filepath: 'file.txt' })
```

### 2. Reset to Specific Version

```typescript
// ✅ Good: Reset to specific commit version
await resetIndex({
  fs,
  dir: '/path/to/repo',
  filepath: 'file.txt',
  ref: 'abc123...'  // Reset to this commit's version
})
```

## Limitations

1. **Index Only**: Only affects staging area, not working directory
2. **Single File**: Resets one file at a time
3. **Commit Required**: Requires valid commit ref

## See Also

- [Remove](./remove.md) - Remove file from index
- [Add](./add.md) - Stage files
- [Status](./status.md) - Check file status

