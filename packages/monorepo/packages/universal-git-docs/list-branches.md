---
title: List Branches
sidebar_label: listBranches
---

# listBranches

List all branches in the repository.

## Overview

The `listBranches` command:
- Lists local branches by default
- Can list remote-tracking branches
- Returns branch names (not full ref paths)
- Excludes HEAD branch when listing local branches

## Basic Usage

```typescript
import { listBranches } from 'universal-git'

// List local branches
const branches = await listBranches({
  fs,
  dir: '/path/to/repo'
})

console.log(branches)
// ['main', 'feature-branch', 'develop']
```

## Examples

### Example 1: List Local Branches

```typescript
// List all local branches
const branches = await listBranches({
  fs,
  dir: '/path/to/repo'
})

console.log('Local branches:', branches)
// ['main', 'feature-branch', 'develop']
```

### Example 2: List Remote Branches

```typescript
// List remote-tracking branches
const remoteBranches = await listBranches({
  fs,
  dir: '/path/to/repo',
  remote: 'origin'
})

console.log('Remote branches:', remoteBranches)
// ['main', 'feature-branch', 'develop']
```

### Example 3: Check if Branch Exists

```typescript
// Check if a branch exists
const branches = await listBranches({ fs, dir: '/path/to/repo' })

if (branches.includes('feature-branch')) {
  console.log('Branch exists')
} else {
  console.log('Branch does not exist')
}
```

### Example 4: Get Current Branch

```typescript
import { currentBranch } from 'universal-git'

// Get current branch
const current = await currentBranch({ fs, dir: '/path/to/repo' })
const allBranches = await listBranches({ fs, dir: '/path/to/repo' })

console.log('Current branch:', current)
console.log('All branches:', allBranches)
```

## API Reference

### `listBranches(options)`

List branches in the repository.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `remote` - Remote name to list branches from (optional)
  - If provided, lists remote-tracking branches
  - If not provided, lists local branches

**Returns:**

- `Promise<string[]>` - Array of branch names

## How It Works

1. **Determines ref path**:
   - Local: `refs/heads`
   - Remote: `refs/remotes/${remote}`
2. **Lists refs** under that path
3. **Returns branch names** (without `refs/heads/` prefix)

## Important Notes

### Empty Repository

If repository has no commits, `listBranches` returns an empty array:

```typescript
// New repository with no commits
await init({ fs, dir: '/path/to/repo' })
const branches = await listBranches({ fs, dir: '/path/to/repo' })
console.log(branches) // []

// After first commit
await commit({ fs, dir: '/path/to/repo', message: 'Initial commit' })
const branches = await listBranches({ fs, dir: '/path/to/repo' })
console.log(branches) // ['main'] (or default branch)
```

### Remote Branches

Remote branches are only available after fetching:

```typescript
// Fetch first to update remote-tracking branches
await fetch({ fs, http, dir: '/path/to/repo', remote: 'origin' })

// Then list remote branches
const remoteBranches = await listBranches({
  fs,
  dir: '/path/to/repo',
  remote: 'origin'
})
```

## Best Practices

### 1. Fetch Before Listing Remote Branches

```typescript
// ✅ Good: Fetch first
await fetch({ fs, http, dir: '/path/to/repo', remote: 'origin' })
const remoteBranches = await listBranches({
  fs,
  dir: '/path/to/repo',
  remote: 'origin'
})

// ⚠️ May be outdated: List without fetching
const remoteBranches = await listBranches({
  fs,
  dir: '/path/to/repo',
  remote: 'origin'
})
```

### 2. Use for Branch Management

```typescript
// List branches before operations
const branches = await listBranches({ fs, dir: '/path/to/repo' })

if (branches.includes('feature-branch')) {
  // Branch exists, checkout it
  await checkout({ fs, dir: '/path/to/repo', ref: 'feature-branch' })
} else {
  // Branch doesn't exist, create it
  await branch({ fs, dir: '/path/to/repo', ref: 'feature-branch' })
}
```

## Limitations

1. **No Commits**: Returns empty array if repository has no commits
2. **Remote Branches**: Requires fetch to be up-to-date
3. **HEAD Branch**: Excluded from local branch list

## Troubleshooting

### Empty Branch List

If no branches are returned:

```typescript
// Check if repository has commits
const commits = await log({ fs, dir: '/path/to/repo', depth: 1 })
if (commits.length === 0) {
  console.log('Repository has no commits, no branches exist')
  // Create first commit
  await commit({ fs, dir: '/path/to/repo', message: 'Initial commit' })
}
```

### Remote Branches Not Found

If remote branches are empty:

```typescript
// Fetch from remote first
await fetch({ fs, http, dir: '/path/to/repo', remote: 'origin' })

// Then list
const remoteBranches = await listBranches({
  fs,
  dir: '/path/to/repo',
  remote: 'origin'
})
```

## See Also

- [Branch](./branch.md) - Create branches
- [Checkout](./checkout.md) - Switch branches
- [List Tags](./list-tags.md) - List tags


