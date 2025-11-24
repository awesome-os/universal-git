---
title: Show
sidebar_label: show
---

# show

Display the contents of Git objects (commits, trees, blobs, tags) in a human-readable format.

## Overview

The `show` command:
- Shows commit details (message, author, date)
- Shows tree contents (file listings)
- Shows blob contents (file contents)
- Shows tag information
- Can show specific files from commits

## Basic Usage

```typescript
import { show } from 'universal-git'

// Show HEAD commit
const result = await show({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD'
})

console.log(result)
// {
//   oid: 'abc123...',
//   type: 'commit',
//   object: { message: '...', author: {...}, ... }
// }
```

## Examples

### Example 1: Show Commit

```typescript
// Show a commit
const result = await show({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD'
})

if (result.type === 'commit') {
  const commit = result.object as CommitObject
  console.log('Message:', commit.message)
  console.log('Author:', commit.author.name)
  console.log('Date:', new Date(commit.author.timestamp * 1000))
}
```

### Example 2: Show Specific File

```typescript
// Show a file from a commit
const result = await show({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  filepath: 'README.md'
})

if (result.type === 'blob') {
  const blob = result.object as string
  console.log('File contents:', blob)
}
```

### Example 3: Show Tag

```typescript
// Show a tag
const result = await show({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})

if (result.type === 'tag') {
  const tag = result.object as TagObject
  console.log('Tag message:', tag.message)
  console.log('Tagged object:', tag.object)
}
```

### Example 4: Show Tree

```typescript
// Show a tree (directory listing)
const result = await show({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD'
})

// If ref points to a tree
if (result.type === 'tree') {
  const tree = result.object as TreeEntry[]
  for (const entry of tree) {
    console.log(`${entry.mode} ${entry.type} ${entry.oid} ${entry.path}`)
  }
}
```

### Example 5: Show File from Specific Commit

```typescript
// Show file from a specific commit
const result = await show({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123...',
  filepath: 'src/index.ts'
})

if (result.type === 'blob') {
  console.log('File contents:', result.object)
}
```

## API Reference

### `show(options)`

Show Git object contents.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Reference or OID to show (optional, default: `'HEAD'`)
- `filepath` - Specific file to show (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<ShowResult>` - Object information

**ShowResult:**
```typescript
{
  oid: string                    // Object OID
  type: 'commit' | 'tree' | 'blob' | 'tag'
  object: CommitObject | TreeEntry[] | string | TagObject
  filepath?: string              // File path (if filepath was provided)
}
```

## Object Types

### Commit

Shows commit information:

```typescript
const result = await show({ fs, dir, ref: 'HEAD' })
// result.type === 'commit'
// result.object contains: message, author, committer, tree, parent, etc.
```

### Tree

Shows directory listing:

```typescript
const result = await show({ fs, dir, ref: 'HEAD~1' })
// If ref points to a tree
// result.type === 'tree'
// result.object is array of TreeEntry objects
```

### Blob

Shows file contents:

```typescript
const result = await show({ fs, dir, ref: 'HEAD', filepath: 'README.md' })
// result.type === 'blob'
// result.object is the file content (string)
```

### Tag

Shows tag information:

```typescript
const result = await show({ fs, dir, ref: 'v1.0.0' })
// result.type === 'tag'
// result.object contains: object, type, tag, tagger, message, etc.
```

## Best Practices

### 1. Check Object Type

```typescript
const result = await show({ fs, dir, ref: 'HEAD' })

switch (result.type) {
  case 'commit':
    // Handle commit
    break
  case 'tree':
    // Handle tree
    break
  case 'blob':
    // Handle blob
    break
  case 'tag':
    // Handle tag
    break
}
```

### 2. Show Files from Commits

```typescript
// Show file from specific commit
const result = await show({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123...',
  filepath: 'src/index.ts'
})

console.log('File at commit:', result.object)
```

## Limitations

1. **Blob Content**: Large files may consume memory
2. **Tree Size**: Large trees may be slow to parse
3. **Binary Files**: Binary file contents are shown as raw bytes

## Troubleshooting

### Object Not Found

If object doesn't exist:

```typescript
try {
  await show({ fs, dir, ref: 'nonexistent' })
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Object not found')
  }
}
```

### File Not in Commit

If file doesn't exist in commit:

```typescript
try {
  await show({ fs, dir, ref: 'HEAD', filepath: 'nonexistent.txt' })
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('File not found in commit')
  }
}
```

## See Also

- [Read Commit](./read-commit.md) - Read commit objects
- [Read Tree](./read-tree.md) - Read tree objects
- [Read Blob](./read-blob.md) - Read blob objects
- [Log](./log.md) - View commit history


