---
title: Checkout
sidebar_label: checkout
---

# checkout

Checkout a branch, commit, or specific files, updating the working directory.

## Overview

The `checkout` command:
- Switches to a branch
- Checks out a specific commit
- Restores files from a commit
- Updates the working directory
- Can checkout specific files only

## Basic Usage

```typescript
import { checkout } from 'universal-git'

// Switch to a branch
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})

// Restore specific files
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  filepaths: ['README.md', 'src/index.ts']
})
```

## Examples

### Example 1: Switch Branch

```typescript
// Switch to a different branch
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})

// Working directory now matches feature-branch
```

### Example 2: Checkout Specific Commit

```typescript
// Checkout a specific commit (detached HEAD)
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123...'
})
```

### Example 3: Restore Files

```typescript
// Restore files from HEAD
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  filepaths: ['README.md', 'package.json'],
  force: true  // Overwrite local changes
})
```

### Example 4: Restore Files from Branch

```typescript
// Restore files from a different branch
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  filepaths: ['src/index.ts'],
  noUpdateHead: true,  // Don't switch branch, just restore files
  force: true
})
```

### Example 5: Create and Checkout Branch

```typescript
// Create a new branch and checkout
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'new-branch',
  // Branch will be created if it doesn't exist
})
```

### Example 6: No Checkout (Update HEAD Only)

```typescript
// Update HEAD without updating working directory
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  noCheckout: true
})

// HEAD points to feature-branch, but files unchanged
```

## API Reference

### `checkout(options)`

Checkout a branch, commit, or files.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Reference to checkout (optional, default: `'HEAD'`)
- `filepaths` - Specific files to checkout (optional)
- `remote` - Remote to use for branch creation (optional, default: `'origin'`)
- `noCheckout` - Don't update working directory (optional, default: `false`)
- `noUpdateHead` - Don't update HEAD (optional, default: `false` when ref provided)
- `dryRun` - Simulate checkout (optional, default: `false`)
- `force` - Overwrite local changes (optional, default: `false`)
- `track` - Set up branch tracking (optional, default: `true`)
- `nonBlocking` - Use non-blocking operations (optional, default: `false`)
- `batchSize` - Batch size for non-blocking (optional, default: `100`)
- `onProgress` - Progress callback (optional)
- `onPostCheckout` - Post-checkout hook callback (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when checkout is complete

## How Checkout Works

1. **Resolves the ref** to a commit OID
2. **Reads the commit's tree** to get file list
3. **Updates files** in working directory:
   - Creates new files
   - Updates modified files
   - Deletes removed files
4. **Updates the index** to match the tree
5. **Updates HEAD** (unless `noUpdateHead: true`)
6. **Runs post-checkout hook** (if provided)

## Checkout Modes

### Branch Checkout

```typescript
// Switch to a branch
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})
// HEAD points to branch, working directory updated
```

### File Checkout

```typescript
// Restore specific files
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  filepaths: ['README.md']
})
// Only specified files are updated
```

### Detached HEAD

```typescript
// Checkout a commit (detached HEAD)
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123...'
})
// HEAD points directly to commit, not a branch
```

## Important Notes

### Local Changes

By default, checkout will fail if there are local changes:

```typescript
// ❌ Will fail if README.md has local changes
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})

// ✅ Use force to overwrite
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  force: true
})
```

### Branch Creation

If the branch doesn't exist, checkout will:
- Look for a remote-tracking branch
- Create a new local branch tracking it
- Checkout the new branch

```typescript
// Creates branch if it doesn't exist
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'new-branch',
  remote: 'origin'  // Look for origin/new-branch
})
```

## Best Practices

### 1. Commit or Stash Before Switching

```typescript
// ✅ Good: Save changes before switching
await commit({ fs, dir, message: 'Save work' })
await checkout({ fs, dir, ref: 'feature-branch' })

// Or stash
await stash({ fs, dir, message: 'WIP' })
await checkout({ fs, dir, ref: 'feature-branch' })
```

### 2. Use Force Sparingly

```typescript
// ✅ Good: Only force when necessary
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  force: true  // Only if you're sure
})

// ❌ Bad: Don't force everything
// You might lose uncommitted work
```

### 3. Restore Files Selectively

```typescript
// ✅ Good: Restore only what you need
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  filepaths: ['README.md'],
  force: true
})

// ⚠️ Careful: Restoring all files changes entire working directory
await checkout({ fs, dir, ref: 'HEAD', force: true })
```

## Common Patterns

### Discard Local Changes

```typescript
// Discard changes to a file
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  filepaths: ['README.md'],
  force: true
})
```

### Switch and Create Branch

```typescript
// Create and checkout new branch
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'new-feature',
  // Branch created automatically
})
```

### Restore from Different Branch

```typescript
// Get a file from another branch
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  filepaths: ['src/utils.ts'],
  noUpdateHead: true,  // Stay on current branch
  force: true
})
```

## Limitations

1. **Local Changes**: Requires `force: true` to overwrite local changes
2. **Conflicts**: May fail if files conflict with local changes
3. **Bare Repositories**: Requires a working directory

## Troubleshooting

### Checkout Conflicts

If checkout fails due to conflicts:

```typescript
try {
  await checkout({ fs, dir, ref: 'feature-branch' })
} catch (error) {
  if (error.code === 'CheckoutConflictError') {
    // Commit or stash changes first
    await commit({ fs, dir, message: 'Save work' })
    await checkout({ fs, dir, ref: 'feature-branch' })
  }
}
```

### Branch Not Found

If branch doesn't exist:

```typescript
// Checkout will try to create it from remote
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: 'new-branch',
  remote: 'origin'
})

// If remote branch doesn't exist, will fail
```

## See Also

- [Branch](./branch.md) - Branch management
- [Reset](./reset.md) - Reset repository state
- [Status](./status.md) - Check repository status

