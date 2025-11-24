---
title: Current Branch
sidebar_label: currentBranch
---

# currentBranch

Get the name of the branch currently checked out.

## Overview

The `currentBranch` command:
- Returns the current branch name
- Supports full or abbreviated branch names
- Returns `undefined` if HEAD is detached
- Can test if branch exists

## Basic Usage

```typescript
import { currentBranch } from 'universal-git'

// Get current branch name
const branch = await currentBranch({
  fs,
  dir: '/path/to/repo'
})

console.log('Current branch:', branch)
// 'main' or 'feature-branch'
```

## Examples

### Example 1: Get Branch Name

```typescript
// Get current branch name
const branch = await currentBranch({
  fs,
  dir: '/path/to/repo'
})

console.log('Current branch:', branch)
```

### Example 2: Get Full Branch Name

```typescript
// Get full branch ref path
const fullBranch = await currentBranch({
  fs,
  dir: '/path/to/repo',
  fullname: true
})

console.log('Full branch:', fullBranch)
// 'refs/heads/main'
```

### Example 3: Handle Detached HEAD

```typescript
// Check if HEAD is detached
const branch = await currentBranch({
  fs,
  dir: '/path/to/repo'
})

if (branch === undefined) {
  console.log('HEAD is detached (not on a branch)')
} else {
  console.log('On branch:', branch)
}
```

### Example 4: Test Mode

```typescript
// Use test mode to return undefined if branch doesn't exist
const branch = await currentBranch({
  fs,
  dir: '/path/to/repo',
  test: true
})

if (branch === undefined) {
  console.log('Branch does not exist (e.g., after init)')
} else {
  console.log('Current branch:', branch)
}
```

### Example 5: Check Before Operations

```typescript
// Check current branch before operations
const branch = await currentBranch({ fs, dir: '/path/to/repo' })

if (!branch) {
  throw new Error('Not on a branch, cannot perform operation')
}

if (branch === 'main') {
  console.log('On main branch, be careful!')
}
```

## API Reference

### `currentBranch(options)`

Get the current branch name.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `fullname` - Return full ref path (optional, default: `false`)
  - `false`: Returns branch name only (e.g., `'main'`)
  - `true`: Returns full ref path (e.g., `'refs/heads/main'`)
- `test` - Return undefined if branch doesn't exist (optional, default: `false`)
  - `false`: Throws error if branch doesn't exist
  - `true`: Returns `undefined` if branch doesn't exist

**Returns:**

- `Promise<string | undefined>` - Branch name or `undefined` if detached/doesn't exist

## Return Values

### Branch Name (fullname: false)

```typescript
const branch = await currentBranch({ fs, dir: '/path/to/repo' })
// 'main' or 'feature-branch'
```

### Full Ref Path (fullname: true)

```typescript
const branch = await currentBranch({
  fs,
  dir: '/path/to/repo',
  fullname: true
})
// 'refs/heads/main' or 'refs/heads/feature-branch'
```

### Detached HEAD

```typescript
const branch = await currentBranch({ fs, dir: '/path/to/repo' })
// undefined (HEAD is detached)
```

## Use Cases

### Branch-Aware Operations

```typescript
// Perform operations based on current branch
const branch = await currentBranch({ fs, dir: '/path/to/repo' })

if (branch === 'main') {
  console.log('On main branch')
  // Perform main branch operations
} else if (branch?.startsWith('feature/')) {
  console.log('On feature branch:', branch)
  // Perform feature branch operations
}
```

### Validate Branch Exists

```typescript
// Check if branch exists before operations
const branch = await currentBranch({
  fs,
  dir: '/path/to/repo',
  test: true
})

if (!branch) {
  // Branch doesn't exist (e.g., after init, no commits yet)
  await commit({ fs, dir: '/path/to/repo', message: 'Initial commit' })
}
```

## Best Practices

### 1. Handle Undefined

```typescript
// ✅ Good: Handle undefined (detached HEAD)
const branch = await currentBranch({ fs, dir: '/path/to/repo' })
if (branch) {
  console.log('On branch:', branch)
} else {
  console.log('HEAD is detached')
}

// ⚠️ May fail: Assume branch exists
const branch = await currentBranch({ fs, dir: '/path/to/repo' })
console.log(branch.toUpperCase())  // Error if undefined
```

### 2. Use Test Mode for Safety

```typescript
// ✅ Good: Use test mode to avoid errors
const branch = await currentBranch({
  fs,
  dir: '/path/to/repo',
  test: true
})

if (branch) {
  // Branch exists, use it
} else {
  // Branch doesn't exist, handle gracefully
}
```

## Limitations

1. **Detached HEAD**: Returns `undefined` when HEAD is detached
2. **No Commits**: Returns `undefined` if repository has no commits (with `test: true`)

## See Also

- [Branch](./branch.md) - Create branches
- [Checkout](./checkout.md) - Switch branches
- [List Branches](./list-branches.md) - List all branches

