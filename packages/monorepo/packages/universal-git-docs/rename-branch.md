---
title: Rename Branch
sidebar_label: renameBranch
---

# renameBranch

Rename a Git branch.

## Overview

The `renameBranch` command:
- Renames a branch to a new name
- Updates branch ref
- Can update HEAD if branch is current
- Validates branch names

## Basic Usage

```typescript
import { renameBranch } from 'universal-git'

// Rename a branch
await renameBranch({
  fs,
  dir: '/path/to/repo',
  oldref: 'master',
  ref: 'main'
})
```

## Examples

### Example 1: Rename Branch

```typescript
// Rename branch from master to main
await renameBranch({
  fs,
  dir: '/path/to/repo',
  oldref: 'master',
  ref: 'main'
})
```

### Example 2: Rename and Update HEAD

```typescript
// Rename branch and update HEAD if it's the current branch
await renameBranch({
  fs,
  dir: '/path/to/repo',
  oldref: 'master',
  ref: 'main',
  checkout: true  // Update HEAD if master is current branch
})
```

### Example 3: Rename with Full Paths

```typescript
// Rename using full ref paths
await renameBranch({
  fs,
  dir: '/path/to/repo',
  oldref: 'refs/heads/master',
  ref: 'refs/heads/main'
})
```

### Example 4: Handle Already Exists

```typescript
// Rename branch, handle if new name exists
try {
  await renameBranch({
    fs,
    dir: '/path/to/repo',
    oldref: 'master',
    ref: 'main'
  })
} catch (error) {
  if (error.code === 'AlreadyExistsError') {
    console.log('Branch main already exists')
  } else {
    throw error
  }
}
```

## API Reference

### `renameBranch(options)`

Rename a branch.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oldref` - Current branch name (required)
- `ref` - New branch name (required)
- `checkout` - Update HEAD if branch is current (optional, default: `false`)

**Returns:**

- `Promise<void>` - Resolves when branch is renamed

**Throws:**

- `AlreadyExistsError` - If new branch name already exists
- `NotFoundError` - If old branch doesn't exist
- `InvalidRefNameError` - If new branch name is invalid

## How It Works

1. **Validates branch names** (old and new)
2. **Checks if new name exists** (throws error unless using force)
3. **Renames ref** from old to new
4. **Updates HEAD** if `checkout: true` and branch is current
5. **Updates config** if branch has tracking configuration

## Best Practices

### 1. Check Current Branch

```typescript
// ✅ Good: Check current branch before renaming
const current = await currentBranch({ fs, dir: '/path/to/repo' })
if (current === 'master') {
  await renameBranch({
    fs,
    dir: '/path/to/repo',
    oldref: 'master',
    ref: 'main',
    checkout: true  // Update HEAD
  })
} else {
  await renameBranch({
    fs,
    dir: '/path/to/repo',
    oldref: 'master',
    ref: 'main'
  })
}
```

### 2. Verify After Rename

```typescript
// ✅ Good: Verify rename succeeded
await renameBranch({
  fs,
  dir: '/path/to/repo',
  oldref: 'master',
  ref: 'main'
})

const branches = await listBranches({ fs, dir: '/path/to/repo' })
assert.ok(branches.includes('main'), 'Branch renamed')
assert.ok(!branches.includes('master'), 'Old branch removed')
```

## Limitations

1. **Local Only**: Only renames local branches
2. **No Remote Update**: Doesn't update remote branches
3. **Config Updates**: May need manual config updates for tracking

## See Also

- [Branch](./branch.md) - Create branches
- [Delete Branch](./delete-branch.md) - Delete branches
- [Current Branch](./current-branch.md) - Get current branch

