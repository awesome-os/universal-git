---
title: Branch
sidebar_label: branch
---

# branch

Create, list, and manage Git branches.

## Overview

The `branch` command:
- Creates new branches
- Can checkout the new branch automatically
- Supports force creation (overwrite existing)
- Can create branch from any commit

## Basic Usage

```typescript
import { branch } from 'universal-git'

// Create a new branch
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})
```

## Examples

### Example 1: Create Branch

```typescript
// Create a new branch from current HEAD
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})
```

### Example 2: Create and Checkout

```typescript
// Create branch and switch to it
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  checkout: true  // Switch to new branch
})
```

### Example 3: Create from Specific Commit

```typescript
// Create branch from a specific commit
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'hotfix-branch',
  object: 'abc123...'  // Start from this commit
})
```

### Example 4: Force Create

```typescript
// Overwrite existing branch
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  force: true  // Overwrite if exists
})
```

### Example 5: Create from Tag

```typescript
// Create branch from a tag
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'release-branch',
  object: 'v1.0.0'  // Start from tag
})
```

## API Reference

### `branch(options)`

Create a new branch.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Branch name to create (required)
- `object` - Starting point (commit OID or ref) (optional, default: `'HEAD'`)
- `checkout` - Checkout the new branch (optional, default: `false`)
- `force` - Overwrite existing branch (optional, default: `false`)

**Returns:**

- `Promise<void>` - Resolves when branch is created

## How Branch Works

1. **Resolves the starting point** (default: HEAD)
2. **Validates branch name** (must be valid ref name)
3. **Checks if branch exists** (throws error unless `force: true`)
4. **Creates branch ref** pointing to the commit
5. **Optionally checks out** the branch (if `checkout: true`)

## Branch Naming

Branch names must be valid Git ref names:

```typescript
// ✅ Valid branch names
await branch({ fs, dir, ref: 'feature-branch' })
await branch({ fs, dir, ref: 'feature/user-auth' })
await branch({ fs, dir, ref: 'hotfix-1.2.3' })

// ❌ Invalid branch names
await branch({ fs, dir, ref: 'feature branch' })  // Spaces not allowed
await branch({ fs, dir, ref: 'feature..branch' })  // Double dots not allowed
```

## Best Practices

### 1. Use Descriptive Names

```typescript
// ✅ Good: Descriptive branch names
await branch({ fs, dir, ref: 'feature-user-authentication' })
await branch({ fs, dir, ref: 'bugfix-login-error' })

// ❌ Bad: Vague names
await branch({ fs, dir, ref: 'branch1' })
await branch({ fs, dir, ref: 'test' })
```

### 2. Create and Checkout Together

```typescript
// ✅ Good: Create and checkout in one step
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  checkout: true
})

// ⚠️ Also works: Create then checkout separately
await branch({ fs, dir, ref: 'feature-branch' })
await checkout({ fs, dir, ref: 'feature-branch' })
```

### 3. Check Before Force

```typescript
// ✅ Good: Check if branch exists before force
import { listBranches } from 'universal-git'

const branches = await listBranches({ fs, dir })
if (branches.includes('feature-branch')) {
  // Branch exists, use force if needed
  await branch({ fs, dir, ref: 'feature-branch', force: true })
} else {
  // Branch doesn't exist, create normally
  await branch({ fs, dir, ref: 'feature-branch' })
}
```

## Common Patterns

### Create Feature Branch

```typescript
// Create feature branch from main
await checkout({ fs, dir, ref: 'main' })
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-new-feature',
  checkout: true
})
```

### Create Release Branch

```typescript
// Create release branch from tag
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'release-1.0.0',
  object: 'v1.0.0',
  checkout: true
})
```

### Create Hotfix Branch

```typescript
// Create hotfix from main
await checkout({ fs, dir, ref: 'main' })
await branch({
  fs,
  dir: '/path/to/repo',
  ref: 'hotfix-critical-bug',
  checkout: true
})
```

## Limitations

1. **Branch Name Validation**: Must be valid Git ref name
2. **Existing Branches**: Cannot create if exists (unless `force: true`)
3. **Starting Point**: Must be valid commit OID or ref

## Troubleshooting

### Branch Already Exists

If branch already exists:

```typescript
try {
  await branch({ fs, dir, ref: 'feature-branch' })
} catch (error) {
  if (error.code === 'AlreadyExistsError') {
    // Use force to overwrite
    await branch({ fs, dir, ref: 'feature-branch', force: true })
    // Or checkout existing branch
    await checkout({ fs, dir, ref: 'feature-branch' })
  }
}
```

### Invalid Branch Name

If branch name is invalid:

```typescript
try {
  await branch({ fs, dir, ref: 'invalid branch name' })
} catch (error) {
  if (error.code === 'InvalidRefNameError') {
    console.log('Branch name is invalid')
    // Use valid name: no spaces, no special characters
    await branch({ fs, dir, ref: 'valid-branch-name' })
  }
}
```

## See Also

- [Checkout](./checkout.md) - Switch branches
- [List Branches](./list-branches.md) - List all branches
- [Delete Branch](./delete-branch.md) - Delete branches


