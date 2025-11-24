---
title: Diff
sidebar_label: diff
---

# diff

Show changes between commits, the index, and the working directory.

## Overview

The `diff` command shows:
- Changes between two commits
- Changes between a commit and the working directory
- Changes between the index and working directory (staged vs unstaged)
- Changes for specific files

## Basic Usage

```typescript
import { diff } from 'universal-git'

// Show changes between two commits
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD~1',
  refB: 'HEAD'
})

console.log(result.entries)
// [
//   { filepath: 'README.md', status: 'modified', oldOid: '...', newOid: '...' },
//   ...
// ]
```

## Examples

### Example 1: Compare Two Commits

```typescript
// Show changes between two commits
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'abc123...',
  refB: 'def456...'
})

for (const entry of result.entries) {
  console.log(`${entry.filepath}: ${entry.status}`)
}
```

### Example 2: Compare Commit to Working Directory

```typescript
// Show changes between HEAD and working directory
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD',
  refB: undefined  // Working directory
})

// Shows unstaged changes
```

### Example 3: Show Staged Changes

```typescript
// Show changes between HEAD and index (staged changes)
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD',
  refB: undefined,
  staged: true
})

// Shows what's staged for commit
```

### Example 4: Diff Specific File

```typescript
// Show changes for a specific file
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD~1',
  refB: 'HEAD',
  filepath: 'src/index.ts'
})

console.log(result.entries)
// [{ filepath: 'src/index.ts', status: 'modified', ... }]
```

### Example 5: Compare Branches

```typescript
// Compare two branches
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'main',
  refB: 'feature-branch'
})

// Shows all differences between branches
```

## API Reference

### `diff(options)`

Show changes between commits, index, and working directory.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `refA` - First reference to compare (optional, defaults to `'HEAD'`)
- `refB` - Second reference to compare (optional, defaults to working directory)
- `filepath` - Limit diff to specific file(s) (optional)
- `staged` - Show staged changes (index vs HEAD) (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<DiffResult>` - Diff operation result

**DiffResult:**
```typescript
{
  entries: DiffEntry[]  // Array of file changes
  refA?: string         // First reference used
  refB?: string         // Second reference used
}
```

**DiffEntry:**
```typescript
{
  filepath: string                    // File path
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  oldOid?: string                     // Old blob OID
  newOid?: string                     // New blob OID
  oldMode?: string                    // Old file mode
  newMode?: string                    // New file mode
}
```

## How Diff Works

1. **Resolves references** to tree OIDs
2. **Compares trees** to find differences
3. **Identifies file changes**:
   - `'added'` - File exists in B but not A
   - `'deleted'` - File exists in A but not B
   - `'modified'` - File exists in both but content differs
   - `'renamed'` - File was renamed (if detected)
4. **Returns diff entries** with file paths and status

## Diff Scenarios

### Compare Two Commits

```typescript
// Show what changed between two commits
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD~1',
  refB: 'HEAD'
})
```

### Compare Commit to Working Directory

```typescript
// Show unstaged changes
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD',
  refB: undefined  // Working directory
})
```

### Compare Index to Working Directory

```typescript
// Show what's staged vs what's in working directory
// (This is the inverse of staged changes)
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: undefined,  // Index
  refB: undefined  // Working directory
})
```

### Show Staged Changes

```typescript
// Show what's staged for commit
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD',
  refB: undefined,
  staged: true  // Compare HEAD to index
})
```

## Best Practices

### 1. Check Changes Before Committing

```typescript
// See what will be committed
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD',
  staged: true
})

console.log('Staged changes:', result.entries.length)
```

### 2. Review Changes Before Merging

```typescript
// See what will be merged
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'main',
  refB: 'feature-branch'
})

console.log('Files that will change:', result.entries.map(e => e.filepath))
```

### 3. Filter by File

```typescript
// Check changes for specific file
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD~1',
  refB: 'HEAD',
  filepath: 'src/index.ts'
})
```

## Limitations

1. **Content Diff**: This command shows which files changed, not the actual content differences
2. **Rename Detection**: Rename detection is basic
3. **Binary Files**: Binary file changes are detected but content is not shown

## Troubleshooting

### No Differences Found

If no differences are found:

```typescript
const result = await diff({ fs, dir, refA: 'HEAD', refB: 'HEAD' })
console.log('Entries:', result.entries.length) // 0 if no differences
```

### File Not Found

If a file doesn't exist in one of the references:

```typescript
const result = await diff({
  fs,
  dir: '/path/to/repo',
  refA: 'HEAD~1',
  refB: 'HEAD',
  filepath: 'nonexistent.txt'
})

// Entry will have status: 'added' or 'deleted'
```

## See Also

- [Status](./status.md) - Check file status
- [Log](./log.md) - View commit history
- [Add](./add.md) - Stage files


