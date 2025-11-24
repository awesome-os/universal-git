---
title: Worktrees
sidebar_label: Worktrees
---

# Worktrees

Git worktrees allow you to check out multiple branches of the same repository simultaneously. Each worktree has its own working directory but shares the same `.git` directory.

## Overview

Worktrees enable you to:
- Work on multiple branches at the same time
- Test different branches without switching
- Keep separate working directories for different features
- Share the same repository data (objects, refs, config)

## Basic Usage

### Add a Worktree

```typescript
import { worktree } from 'universal-git'

// Add a new worktree for a branch
const result = await worktree({
  fs,
  dir: '/path/to/main/repo',
  add: true,
  path: '/path/to/new/worktree',
  ref: 'feature-branch'
})

console.log(result)
// { path: '/path/to/new/worktree', HEAD: 'abc123...' }
```

### List Worktrees

```typescript
// List all worktrees
const worktrees = await worktree({
  fs,
  dir: '/path/to/repo',
  list: true
})

console.log(worktrees)
// [
//   { path: '/path/to/main/repo', HEAD: 'abc123...', branch: 'main' },
//   { path: '/path/to/worktree', HEAD: 'def456...', branch: 'feature-branch' }
// ]
```

### Remove a Worktree

```typescript
// Remove a worktree
await worktree({
  fs,
  dir: '/path/to/main/repo',
  remove: true,
  path: '/path/to/worktree'
})
```

## Examples

### Example 1: Working on Multiple Branches

```typescript
import { worktree, checkout, commit } from 'universal-git'

// Main repository
const mainDir = '/path/to/repo'

// Create worktree for feature branch
await worktree({
  fs,
  dir: mainDir,
  add: true,
  path: '/path/to/feature-worktree',
  ref: 'feature-branch'
})

// Now you can work in both directories:
// - /path/to/repo (main branch)
// - /path/to/feature-worktree (feature-branch)

// Make commits in feature worktree
await commit({
  fs,
  dir: '/path/to/feature-worktree',
  message: 'Feature work'
})

// Switch branches in main repo without affecting feature worktree
await checkout({
  fs,
  dir: mainDir,
  ref: 'other-branch'
})
```

### Example 2: Detached HEAD Worktree

```typescript
// Create worktree with detached HEAD
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/detached-worktree',
  ref: 'abc123...',  // Commit SHA
  detach: true
})
```

### Example 3: Force Add Worktree

```typescript
// Force add worktree (removes existing directory if needed)
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/worktree',
  ref: 'feature-branch',
  force: true  // Remove existing directory if it exists
})
```

### Example 4: Lock and Unlock Worktree

```typescript
// Lock a worktree (prevents accidental removal)
await worktree({
  fs,
  dir: '/path/to/repo',
  lock: true,
  path: '/path/to/worktree',
  reason: 'Long-running operation in progress'
})

// Later, unlock it
await worktree({
  fs,
  dir: '/path/to/repo',
  unlock: true,
  path: '/path/to/worktree'
})
```

### Example 5: Prune Worktrees

```typescript
// Remove worktrees that no longer exist on disk
const result = await worktree({
  fs,
  dir: '/path/to/repo',
  prune: true
})

console.log(result)
// { pruned: ['/path/to/missing/worktree'] }
```

## API Reference

### `worktree(options)`

Manages Git worktrees.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Main repository directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `add` - Add a new worktree (boolean)
- `list` - List all worktrees (boolean)
- `remove` - Remove a worktree (boolean)
- `prune` - Prune missing worktrees (boolean)
- `lock` - Lock a worktree (boolean)
- `unlock` - Unlock a worktree (boolean)
- `status` - Get worktree status (boolean)
- `path` - Worktree path (required for add/remove/lock/unlock/status)
- `ref` - Branch or commit to check out (required for add)
- `name` - Branch name for new branch (optional, for add)
- `force` - Force operation (boolean, optional)
- `detach` - Create detached HEAD (boolean, optional)
- `reason` - Lock reason (optional, for lock)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<WorktreeInfo[] | WorktreeInfo | { removed: string } | { pruned: string[] } | { locked: string } | { unlocked: string } | unknown>` - Operation result

**Operations:**

1. **`add`** - Add a new worktree
   - Creates a new working directory
   - Checks out the specified branch or commit
   - Links to the main repository's `.git` directory

2. **`list`** - List all worktrees
   - Returns array of worktree information
   - Includes path, HEAD, and branch name

3. **`remove`** - Remove a worktree
   - Removes the worktree directory
   - Cleans up worktree metadata
   - Use `force: true` to remove locked worktrees

4. **`prune`** - Prune missing worktrees
   - Removes worktree entries that no longer exist on disk
   - Cleans up orphaned worktree metadata

5. **`lock`** - Lock a worktree
   - Prevents accidental removal
   - Stores a reason (optional)

6. **`unlock`** - Unlock a worktree
   - Removes the lock
   - Allows removal

7. **`status`** - Get worktree status
   - Returns worktree information
   - Includes lock status if locked

## How Worktrees Work

### Directory Structure

When you create a worktree:

```
/path/to/main-repo/
├── .git/                    # Main repository
│   ├── worktrees/          # Worktree metadata
│   │   └── worktree-name/
│   │       ├── gitdir      # Points to worktree's .git
│   │       ├── HEAD        # Worktree HEAD
│   │       └── locked      # Lock file (if locked)
│   └── ...
└── ...                      # Main working directory

/path/to/worktree/
├── .git                     # Symlink or file pointing to main .git
└── ...                      # Worktree working directory
```

### Shared Repository Data

All worktrees share:
- Object database (`.git/objects/`)
- References (`.git/refs/`)
- Configuration (`.git/config`)
- Hooks (`.git/hooks/`)

Each worktree has its own:
- Working directory files
- Index (`.git/worktrees/<name>/index`)
- HEAD pointer

## Best Practices

### 1. Use Descriptive Paths

```typescript
// ✅ Good: Descriptive path
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/repo-feature-auth',
  ref: 'feature-auth'
})

// ❌ Bad: Generic path
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/temp',
  ref: 'feature-auth'
})
```

### 2. Clean Up Unused Worktrees

```typescript
// Periodically prune missing worktrees
await worktree({
  fs,
  dir: '/path/to/repo',
  prune: true
})
```

### 3. Lock Important Worktrees

```typescript
// Lock worktrees that are in use
await worktree({
  fs,
  dir: '/path/to/repo',
  lock: true,
  path: '/path/to/worktree',
  reason: 'CI/CD testing in progress'
})
```

### 4. Use Force Sparingly

```typescript
// Only use force when necessary
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/worktree',
  ref: 'feature-branch',
  force: true  // Only if you're sure
})
```

## Limitations

1. **Same Branch**: You cannot check out the same branch in multiple worktrees
2. **Bare Repositories**: Worktrees require a non-bare repository
3. **Submodules**: Worktrees with submodules may have limitations
4. **File System**: Some file systems may not support all worktree features

## Troubleshooting

### Worktree Already Exists

If you get an error that the worktree already exists:

```typescript
// Remove existing worktree first
await worktree({
  fs,
  dir: '/path/to/repo',
  remove: true,
  path: '/path/to/worktree'
})

// Then add it again
await worktree({
  fs,
  dir: '/path/to/repo',
  add: true,
  path: '/path/to/worktree',
  ref: 'feature-branch'
})
```

### Cannot Remove Locked Worktree

If a worktree is locked:

```typescript
// Unlock it first
await worktree({
  fs,
  dir: '/path/to/repo',
  unlock: true,
  path: '/path/to/worktree'
})

// Then remove it
await worktree({
  fs,
  dir: '/path/to/repo',
  remove: true,
  path: '/path/to/worktree'
})

// Or force remove
await worktree({
  fs,
  dir: '/path/to/repo',
  remove: true,
  path: '/path/to/worktree',
  force: true
})
```

### Worktree Path Not Found

If the worktree path doesn't exist:

```typescript
// Check if worktree exists
const worktrees = await worktree({
  fs,
  dir: '/path/to/repo',
  list: true
})

console.log(worktrees) // Check if path is in the list
```

## See Also

- [Checkout](./checkout.md) - Checkout operations
- [Branch](./branch.md) - Branch management
- [Repository](./repository.md) - Repository class

