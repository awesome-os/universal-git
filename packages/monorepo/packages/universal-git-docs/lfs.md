---
title: Git LFS
sidebar_label: lfs
---

# lfs

Git Large File Storage (LFS) operations for tracking and managing large files.

## Overview

The `lfs` command provides:
- File pattern tracking with LFS
- Smudge filter (download LFS files)
- Clean filter (upload LFS files)
- Pointer file management
- Integration with `.gitattributes`

## Basic Usage

```typescript
import { lfs } from 'universal-git'

// Track files with LFS
await lfs.track({
  fs,
  dir: '/path/to/repo',
  patterns: ['*.psd', '*.zip']
})
```

## Examples

### Example 1: Track File Patterns

```typescript
// Track specific file patterns with LFS
await lfs.track({
  fs,
  dir: '/path/to/repo',
  patterns: ['*.psd', '*.zip', '*.mov']
})
```

### Example 2: Check if File Should Use LFS

```typescript
// Check if file should be tracked with LFS
const shouldTrack = await lfs.shouldTrack({
  fs,
  dir: '/path/to/repo',
  filepath: 'large-file.zip'
})

if (shouldTrack) {
  console.log('File should be tracked with LFS')
}
```

### Example 3: Apply Smudge Filter

```typescript
// Apply smudge filter (download LFS file)
const content = await lfs.smudge({
  fs,
  dir: '/path/to/repo',
  filepath: 'large-file.zip',
  pointer: pointerContent  // LFS pointer file content
})

// content is the actual file content (downloaded from LFS)
```

### Example 4: Apply Clean Filter

```typescript
// Apply clean filter (create LFS pointer)
const pointer = await lfs.clean({
  fs,
  dir: '/path/to/repo',
  filepath: 'large-file.zip',
  content: fileContent  // Actual file content
})

// pointer is the LFS pointer file content
```

### Example 5: Check if Content is Pointer

```typescript
// Check if content is an LFS pointer
const isPointer = await lfs.isPointer({
  content: fileContent
})

if (isPointer) {
  console.log('Content is an LFS pointer')
}
```

## API Reference

### `lfs.track(options)`

Track file patterns with Git LFS.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `patterns` - File patterns to track (required)
  - Examples: `['*.psd', '*.zip']`
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when patterns are tracked

### `lfs.shouldTrack(options)`

Check if file should be tracked with LFS.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional)
- `filepath` - File path to check (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<boolean>` - `true` if file should be tracked

### `lfs.smudge(options)`

Apply smudge filter (download LFS file).

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional)
- `filepath` - File path (required)
- `pointer` - LFS pointer content (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<Uint8Array>` - Actual file content

### `lfs.clean(options)`

Apply clean filter (create LFS pointer).

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional)
- `filepath` - File path (required)
- `content` - File content (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<Uint8Array>` - LFS pointer file content

## LFS Pointer Format

LFS pointer files have this format:
```
version https://git-lfs.github.com/spec/v1
oid sha256:abc123...
size 12345678
```

## Best Practices

### 1. Track Before Adding Large Files

```typescript
// ✅ Good: Track patterns before adding files
await lfs.track({
  fs,
  dir: '/path/to/repo',
  patterns: ['*.psd', '*.zip']
})

// Then add files (they'll use LFS automatically)
await add({ fs, dir: '/path/to/repo', filepath: 'image.psd' })
```

### 2. Use for Large Files

```typescript
// ✅ Good: Use LFS for large files
const fileSize = (await fs.stat('large-file.zip')).size
if (fileSize > 100 * 1024 * 1024) {  // > 100MB
  await lfs.track({ fs, dir, patterns: ['large-file.zip'] })
}
```

## Limitations

1. **LFS Server Required**: Requires LFS server for file storage
2. **Pointer Files**: Stores pointers in Git, actual files in LFS
3. **Filter Integration**: Requires filter setup for automatic operation

## See Also

- [Add](./add.md) - Stage files (LFS files handled automatically)
- [Git Attributes](./gitattributes.md) - `.gitattributes` configuration

