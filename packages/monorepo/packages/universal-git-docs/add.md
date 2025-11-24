---
title: Add
sidebar_label: add
---

# add

Add files to the Git index (staging area), preparing them for the next commit.

## Overview

The `add` command:
- Stages files for commit
- Creates blob objects for file contents
- Updates the index with file metadata
- Respects `.gitignore` rules (unless `force: true`)

## Basic Usage

```typescript
import { add } from 'universal-git'

// Add a single file
await add({
  fs,
  dir: '/path/to/repo',
  filepath: 'README.md'
})

// Add multiple files
await add({
  fs,
  dir: '/path/to/repo',
  filepath: ['README.md', 'package.json', 'src/index.ts']
})
```

## Examples

### Example 1: Add Single File

```typescript
// Add a file to the staging area
await add({
  fs,
  dir: '/path/to/repo',
  filepath: 'README.md'
})

// File is now staged and ready to commit
```

### Example 2: Add Multiple Files

```typescript
// Add multiple files at once
await add({
  fs,
  dir: '/path/to/repo',
  filepath: [
    'src/index.ts',
    'src/utils.ts',
    'package.json'
  ]
})
```

### Example 3: Add All Files in Directory

```typescript
import { listFiles } from 'universal-git'

// List all files in directory
const files = await listFiles({
  fs,
  dir: '/path/to/repo',
  filepath: 'src'
})

// Add all files
await add({
  fs,
  dir: '/path/to/repo',
  filepath: files
})
```

### Example 4: Force Add Ignored Files

```typescript
// Add a file even if it's in .gitignore
await add({
  fs,
  dir: '/path/to/repo',
  filepath: 'temp.log',
  force: true  // Override .gitignore
})
```

### Example 5: Parallel Processing

```typescript
// Process files in parallel for better performance
await add({
  fs,
  dir: '/path/to/repo',
  filepath: ['file1.txt', 'file2.txt', 'file3.txt'],
  parallel: true  // Process in parallel (default)
})
```

## API Reference

### `add(options)`

Add files to the Git index.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - File path(s) to add (required)
  - Can be a string (single file) or array of strings (multiple files)
- `force` - Add even if file matches `.gitignore` (optional, default: `false`)
- `parallel` - Process files in parallel (optional, default: `true`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when files are added

## How Add Works

1. **Reads the file** from the working directory
2. **Checks `.gitignore`** rules (unless `force: true`)
3. **Creates a blob object** from the file content
4. **Updates the index** with file metadata (path, OID, mode, stats)
5. **Stores the blob** in the object database

## Important Notes

### .gitignore Rules

By default, `add` respects `.gitignore` rules:

```typescript
// File in .gitignore won't be added
await add({ fs, dir, filepath: 'node_modules/package' })
// File is ignored, not added

// Use force to override
await add({ fs, dir, filepath: 'node_modules/package', force: true })
// File is added despite .gitignore
```

### File Must Exist

The file must exist in the working directory:

```typescript
// ✅ Good: File exists
await fs.write('/path/to/repo/file.txt', 'content')
await add({ fs, dir: '/path/to/repo', filepath: 'file.txt' })

// ❌ Error: File doesn't exist
await add({ fs, dir: '/path/to/repo', filepath: 'nonexistent.txt' })
// Throws error
```

### Staging vs Committing

Adding files only stages them; you still need to commit:

```typescript
// Stage files
await add({ fs, dir, filepath: 'README.md' })

// Commit the staged files
await commit({ fs, dir, message: 'Add README' })
```

## Best Practices

### 1. Add Files Before Committing

```typescript
// ✅ Good: Add files, then commit
await add({ fs, dir, filepath: 'README.md' })
await commit({ fs, dir, message: 'Add README' })

// ❌ Bad: Commit without adding (nothing to commit)
await commit({ fs, dir, message: 'Add README' })
```

### 2. Use Parallel Processing for Multiple Files

```typescript
// ✅ Good: Process in parallel (default)
await add({
  fs,
  dir,
  filepath: ['file1.txt', 'file2.txt', 'file3.txt'],
  parallel: true
})

// ⚠️ Sequential: Slower but uses less memory
await add({
  fs,
  dir,
  filepath: ['file1.txt', 'file2.txt', 'file3.txt'],
  parallel: false
})
```

### 3. Check Status Before Adding

```typescript
import { status } from 'universal-git'

// Check if file needs to be added
const fileStatus = await status({ fs, dir, filepath: 'README.md' })

if (fileStatus === '*modified' || fileStatus === '*added') {
  // File has unstaged changes
  await add({ fs, dir, filepath: 'README.md' })
}
```

### 4. Use Force Sparingly

```typescript
// ✅ Good: Only force when necessary
await add({ fs, dir, filepath: 'temp.log', force: true })

// ❌ Bad: Don't force add everything
await add({ fs, dir, filepath: '*.log', force: true })
```

## Common Patterns

### Add All Modified Files

```typescript
import { statusMatrix } from 'universal-git'

// Get all modified files
const matrix = await statusMatrix({ fs, dir })

// Add all modified files
const modifiedFiles = matrix
  .filter(([filepath, head, index, workdir]) => {
    // File exists in workdir and differs from index
    return workdir !== 0 && workdir !== index
  })
  .map(([filepath]) => filepath)

if (modifiedFiles.length > 0) {
  await add({ fs, dir, filepath: modifiedFiles })
}
```

### Add New Files Only

```typescript
import { statusMatrix } from 'universal-git'

// Get all new files
const matrix = await statusMatrix({ fs, dir })

const newFiles = matrix
  .filter(([filepath, head, index, workdir]) => {
    // File doesn't exist in HEAD or index, but exists in workdir
    return head === 0 && index === 0 && workdir !== 0
  })
  .map(([filepath]) => filepath)

if (newFiles.length > 0) {
  await add({ fs, dir, filepath: newFiles })
}
```

## Limitations

1. **File Must Exist**: Cannot add files that don't exist in the working directory
2. **No Directory Addition**: Must specify individual files (not directories)
3. **Ignores by Default**: Respects `.gitignore` unless `force: true`

## Troubleshooting

### File Not Added

If a file isn't added:

1. Check if it's ignored:
   ```typescript
   const status = await status({ fs, dir, filepath: 'file.txt' })
   if (status === 'ignored') {
     // Use force: true
     await add({ fs, dir, filepath: 'file.txt', force: true })
   }
   ```

2. Verify file exists:
   ```typescript
   const exists = await fs.exists('/path/to/repo/file.txt')
   if (!exists) {
     console.log('File does not exist')
   }
   ```

### Multiple Files Not Added

If some files aren't added:

```typescript
// Add files one by one to see which ones fail
const files = ['file1.txt', 'file2.txt', 'file3.txt']

for (const file of files) {
  try {
    await add({ fs, dir, filepath: file })
    console.log(`Added: ${file}`)
  } catch (error) {
    console.error(`Failed to add ${file}:`, error)
  }
}
```

## See Also

- [Status](./status.md) - Check file status
- [Commit](./commit.md) - Create commits
- [Reset](./reset.md) - Unstage files
- [Status Matrix](./status-matrix.md) - Check multiple files

