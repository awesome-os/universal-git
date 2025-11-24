---
title: Status
sidebar_label: status
---

# status

Check the status of a file in the repository, showing whether it's modified, staged, untracked, or ignored.

## Overview

The `status` command tells you the state of a file relative to:
- **HEAD commit** - The last commit
- **Index (staging area)** - What's staged for the next commit
- **Working directory** - The actual files on disk

## Basic Usage

```typescript
import { status } from 'universal-git'

// Check status of a file
const fileStatus = await status({
  fs,
  dir: '/path/to/repo',
  filepath: 'README.md'
})

console.log(fileStatus) // e.g., 'modified', '*modified', 'unmodified'
```

## Status Values

The command returns one of these status values:

| Status | Description |
|--------|-------------|
| `'ignored'` | File is ignored by a `.gitignore` rule |
| `'unmodified'` | File unchanged from HEAD commit |
| `'modified'` | File has modifications, **staged** |
| `'*modified'` | File has modifications, **not yet staged** |
| `'deleted'` | File has been removed, **staged** |
| `'*deleted'` | File has been removed, **not yet staged** |
| `'added'` | Previously untracked file, **staged** |
| `'*added'` | File is untracked, **not yet staged** |
| `'absent'` | File not present in HEAD, index, or working dir |
| `'*unmodified'` | Working dir and HEAD match, but index differs |
| `'*absent'` | File not in working dir or HEAD, but present in index |
| `'*undeleted'` | File was deleted from index, but still in working dir |
| `'*undeletemodified'` | File was deleted from index, but present with modifications |

**Note**: Status values starting with `*` indicate unstaged changes.

## Examples

### Example 1: Check Single File

```typescript
// Check if a file has been modified
const fileStatus = await status({
  fs,
  dir: '/path/to/repo',
  filepath: 'src/index.ts'
})

if (fileStatus === 'modified' || fileStatus === '*modified') {
  console.log('File has been modified')
} else if (fileStatus === 'unmodified') {
  console.log('File is unchanged')
}
```

### Example 2: Check Multiple Files

```typescript
// Check status of multiple files
const files = ['README.md', 'package.json', 'src/index.ts']

for (const file of files) {
  const fileStatus = await status({
    fs,
    dir: '/path/to/repo',
    filepath: file
  })
  console.log(`${file}: ${fileStatus}`)
}
```

### Example 3: Detect Staged vs Unstaged Changes

```typescript
// Check if changes are staged
const fileStatus = await status({
  fs,
  dir: '/path/to/repo',
  filepath: 'src/index.ts'
})

if (fileStatus.startsWith('*')) {
  console.log('Changes are unstaged')
} else if (fileStatus === 'modified' || fileStatus === 'added' || fileStatus === 'deleted') {
  console.log('Changes are staged')
}
```

### Example 4: Check Ignored Files

```typescript
// Check if a file is ignored
const fileStatus = await status({
  fs,
  dir: '/path/to/repo',
  filepath: 'node_modules/package'
})

if (fileStatus === 'ignored') {
  console.log('File is ignored by .gitignore')
}
```

### Example 5: Use with statusMatrix

For checking multiple files efficiently, use `statusMatrix`:

```typescript
import { statusMatrix } from 'universal-git'

// Get status for all files
const matrix = await statusMatrix({
  fs,
  dir: '/path/to/repo'
})

// matrix is an array of [filepath, headStatus, indexStatus, workdirStatus]
for (const [filepath, head, index, workdir] of matrix) {
  console.log(`${filepath}:`, { head, index, workdir })
}
```

## API Reference

### `status(options)`

Check the status of a file.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `filepath` - Path to the file to check (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<FileStatus>` - The file's status

**FileStatus Type:**
```typescript
type FileStatus =
  | 'ignored'
  | 'unmodified'
  | '*modified'
  | '*deleted'
  | '*added'
  | 'absent'
  | 'modified'
  | 'deleted'
  | 'added'
  | '*unmodified'
  | '*absent'
  | '*undeleted'
  | '*undeletemodified'
```

## How Status Works

The status command compares three states:

1. **HEAD** - The last commit
2. **Index** - The staging area
3. **Working Directory** - The actual files

It determines the file's status by comparing these three states:

- If file is in `.gitignore` → `'ignored'`
- If HEAD = Index = Workdir → `'unmodified'`
- If Index differs from HEAD → staged change (`'modified'`, `'added'`, `'deleted'`)
- If Workdir differs from Index → unstaged change (`'*modified'`, `'*added'`, `'*deleted'`)

## Best Practices

### 1. Use statusMatrix for Multiple Files

```typescript
// ✅ Good: Use statusMatrix for multiple files
const matrix = await statusMatrix({ fs, dir })

// ❌ Less efficient: Check files one by one
for (const file of files) {
  await status({ fs, dir, filepath: file })
}
```

### 2. Check Status Before Operations

```typescript
// Check status before committing
const fileStatus = await status({ fs, dir, filepath: 'src/index.ts' })

if (fileStatus === '*modified') {
  // File has unstaged changes
  await add({ fs, dir, filepath: 'src/index.ts' })
}

await commit({ fs, dir, message: 'Update index.ts' })
```

### 3. Handle Ignored Files

```typescript
// Check if file is ignored before trying to add it
const fileStatus = await status({ fs, dir, filepath: 'temp.log' })

if (fileStatus === 'ignored') {
  console.log('File is ignored, use force: true to add it')
  // Or check .gitignore rules
}
```

## Common Status Patterns

### Clean Working Directory

```typescript
// All files are unmodified
const status = await status({ fs, dir, filepath: 'README.md' })
// Returns: 'unmodified'
```

### Staged Changes

```typescript
// File modified and staged
await add({ fs, dir, filepath: 'README.md' })
const status = await status({ fs, dir, filepath: 'README.md' })
// Returns: 'modified'
```

### Unstaged Changes

```typescript
// File modified but not staged
// (file changed on disk, but not added)
const status = await status({ fs, dir, filepath: 'README.md' })
// Returns: '*modified'
```

### New Untracked File

```typescript
// New file created, not yet added
const status = await status({ fs, dir, filepath: 'newfile.txt' })
// Returns: '*added'
```

## Limitations

1. **Single File**: This command checks one file at a time
2. **Performance**: For multiple files, use `statusMatrix` instead
3. **Ignored Files**: Returns `'ignored'` but doesn't show which rule matched

## Troubleshooting

### File Not Found

If the file doesn't exist:

```typescript
const status = await status({ fs, dir, filepath: 'nonexistent.txt' })
// Returns: 'absent'
```

### Status Not Updating

If status doesn't reflect recent changes:

1. Ensure you're using the correct `dir`:
   ```typescript
   await status({ fs, dir: '/correct/path/to/repo', filepath: 'file.txt' })
   ```

2. Check that the file system operations completed:
   ```typescript
   await fs.write('/path/to/repo/file.txt', 'content')
   // Wait for write to complete
   const status = await status({ fs, dir: '/path/to/repo', filepath: 'file.txt' })
   ```

## See Also

- [Status Matrix](./status-matrix.md) - Check status of multiple files
- [Add](./add.md) - Stage files
- [Commit](./commit.md) - Create commits
- [Diff](./diff.md) - Show differences

