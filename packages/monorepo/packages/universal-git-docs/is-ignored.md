---
title: Is Ignored
sidebar_label: isIgnored
---

# isIgnored

Check whether a filepath should be ignored by Git.

## Overview

The `isIgnored` command:
- Checks if a filepath matches `.gitignore` patterns
- Also checks `.git/exclude` patterns
- Returns `true` if file should be ignored
- Useful for filtering files before operations

## Basic Usage

```typescript
import { isIgnored } from 'universal-git'

// Check if file is ignored
const ignored = await isIgnored({
  fs,
  dir: '/path/to/repo',
  filepath: 'node_modules/package.json'
})

console.log('Is ignored:', ignored)
// true
```

## Examples

### Example 1: Check Single File

```typescript
// Check if a file is ignored
const ignored = await isIgnored({
  fs,
  dir: '/path/to/repo',
  filepath: 'dist/bundle.js'
})

if (ignored) {
  console.log('File is ignored by .gitignore')
} else {
  console.log('File is not ignored')
}
```

### Example 2: Filter Files

```typescript
// Filter out ignored files
const files = ['src/index.ts', 'node_modules/package.json', 'dist/bundle.js']

const visibleFiles = []
for (const file of files) {
  const ignored = await isIgnored({ fs, dir: '/path/to/repo', filepath: file })
  if (!ignored) {
    visibleFiles.push(file)
  }
}

console.log('Visible files:', visibleFiles)
```

### Example 3: Check Before Add

```typescript
// Check before adding file
const filepath = 'temp-file.txt'
const ignored = await isIgnored({ fs, dir: '/path/to/repo', filepath })

if (ignored) {
  console.log('File is ignored, cannot add')
} else {
  await add({ fs, dir: '/path/to/repo', filepath })
}
```

### Example 4: Validate File Paths

```typescript
// Validate multiple file paths
async function getVisibleFiles(
  fs: FileSystemProvider,
  dir: string,
  filepaths: string[]
): Promise<string[]> {
  const visible: string[] = []
  
  for (const filepath of filepaths) {
    const ignored = await isIgnored({ fs, dir, filepath })
    if (!ignored) {
      visible.push(filepath)
    }
  }
  
  return visible
}

const files = await getVisibleFiles(fs, '/path/to/repo', [
  'src/index.ts',
  'node_modules/package.json',
  'dist/bundle.js'
])
```

## API Reference

### `isIgnored(options)`

Check if a filepath is ignored.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - File path to check (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<boolean>` - `true` if filepath is ignored, `false` otherwise

## Ignore Sources

The command checks multiple sources:

1. **`.gitignore`** - Repository-level ignore patterns
2. **`.git/exclude`** - Repository-specific exclude patterns
3. **Pattern matching** - Git ignore pattern rules

## Common Ignored Patterns

### Node.js

```typescript
// These are typically ignored
await isIgnored({ fs, dir, filepath: 'node_modules/' })  // true
await isIgnored({ fs, dir, filepath: 'package-lock.json' })  // depends on .gitignore
```

### Build Output

```typescript
// Build directories are often ignored
await isIgnored({ fs, dir, filepath: 'dist/' })  // true (if in .gitignore)
await isIgnored({ fs, dir, filepath: 'build/' })  // true (if in .gitignore)
```

## Best Practices

### 1. Filter Before Operations

```typescript
// ✅ Good: Filter ignored files before listing
const allFiles = await listFiles({ fs, dir: '/path/to/repo' })
const visibleFiles = []

for (const file of allFiles) {
  const ignored = await isIgnored({ fs, dir: '/path/to/repo', filepath: file })
  if (!ignored) {
    visibleFiles.push(file)
  }
}

// ⚠️ Less efficient: Check during operation
// Some operations may process ignored files
```

### 2. Use for Validation

```typescript
// ✅ Good: Validate before adding
async function safeAdd(fs: FileSystemProvider, dir: string, filepath: string) {
  const ignored = await isIgnored({ fs, dir, filepath })
  if (ignored) {
    throw new Error(`Cannot add ignored file: ${filepath}`)
  }
  await add({ fs, dir, filepath })
}
```

## Limitations

1. **Pattern Matching**: Uses Git's ignore pattern rules (may differ from simple string matching)
2. **Performance**: Can be slow when checking many files (consider caching results)
3. **Context Dependent**: Results depend on filepath location relative to repository root

## See Also

- [Add](./add.md) - Stage files
- [Status](./status.md) - Check file status
- [List Files](./list-files.md) - List tracked files

