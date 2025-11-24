---
title: Find Root
sidebar_label: findRoot
---

# findRoot

Find the root Git directory by walking upward from a filepath.

## Overview

The `findRoot` command:
- Searches for `.git` directory starting from a filepath
- Walks upward through parent directories
- Returns the repository root directory
- Throws error if no Git repository is found

## Basic Usage

```typescript
import { findRoot } from 'universal-git'

// Find repository root
const root = await findRoot({
  fs,
  filepath: '/path/to/repo/src/utils'
})

console.log('Repository root:', root)
// '/path/to/repo'
```

## Examples

### Example 1: Find Root from Current Directory

```typescript
// Find root from current working directory
const root = await findRoot({
  fs,
  filepath: process.cwd()
})

console.log('Repository root:', root)
```

### Example 2: Find Root from File Path

```typescript
// Find root from a file path
const filePath = '/path/to/repo/src/index.ts'
const root = await findRoot({
  fs,
  filepath: filePath
})

console.log('Repository root:', root)
```

### Example 3: Handle No Repository Found

```typescript
// Handle case where no repository is found
try {
  const root = await findRoot({
    fs,
    filepath: '/some/path'
  })
  console.log('Repository root:', root)
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('No Git repository found')
  } else {
    throw error
  }
}
```

### Example 4: Verify Repository Exists

```typescript
// Check if current directory is in a Git repository
function isInGitRepo(fs: FileSystemProvider, filepath: string): Promise<boolean> {
  return findRoot({ fs, filepath })
    .then(() => true)
    .catch(() => false)
}

const inRepo = await isInGitRepo(fs, process.cwd())
console.log('In Git repository:', inRepo)
```

## API Reference

### `findRoot(options)`

Find the root Git directory.

**Parameters:**

- `fs` - File system client (required)
- `filepath` - Starting directory path (required)

**Returns:**

- `Promise<string>` - Path to repository root directory

**Throws:**

- `NotFoundError` - If no Git repository is found

## How It Works

1. **Starts** at the provided `filepath`
2. **Checks** if `.git` directory exists
3. **If found**, returns the directory path
4. **If not found**, walks up to parent directory
5. **Repeats** until `.git` is found or filesystem root is reached
6. **Throws** `NotFoundError` if no repository is found

## Use Cases

### Determine Repository Root

```typescript
// Find repository root from any subdirectory
const root = await findRoot({
  fs,
  filepath: '/path/to/repo/src/utils/helpers'
})

// Use root for Git operations
await status({ fs, dir: root })
```

### Validate Repository

```typescript
// Check if path is in a Git repository
async function validateRepository(fs: FileSystemProvider, path: string): Promise<boolean> {
  try {
    await findRoot({ fs, filepath: path })
    return true
  } catch {
    return false
  }
}
```

## Best Practices

### 1. Use for Relative Paths

```typescript
// ✅ Good: Find root first, then use relative paths
const root = await findRoot({ fs, filepath: process.cwd() })
const status = await status({ fs, dir: root, filepath: 'src/index.ts' })

// ⚠️ May fail: Assume current directory is root
const status = await status({ fs, dir: process.cwd(), filepath: 'src/index.ts' })
```

### 2. Handle Errors Gracefully

```typescript
// ✅ Good: Handle NotFoundError
try {
  const root = await findRoot({ fs, filepath: '/some/path' })
  // Use root
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Not in a Git repository')
  } else {
    throw error
  }
}
```

## Limitations

1. **Filesystem Only**: Only searches filesystem (doesn't check for bare repos)
2. **No Gitdir Parameter**: Always looks for `.git` directory
3. **Performance**: May be slow for deeply nested directories

## See Also

- [Init](./init.md) - Initialize a repository
- [Status](./status.md) - Check repository status

