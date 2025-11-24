---
title: List Refs
sidebar_label: listRefs
---

# listRefs

List all references under a specific path in the Git refs directory.

## Overview

The `listRefs` command:
- Lists refs under a specific path
- Returns full ref paths
- Supports filtering by prefix
- Works with branches, tags, and remote refs

## Basic Usage

```typescript
import { listRefs } from 'universal-git'

// List all branches
const branches = await listRefs({
  fs,
  gitdir: '/path/to/.git',
  filepath: 'refs/heads'
})

console.log(branches)
// ['refs/heads/main', 'refs/heads/feature-branch', ...]
```

## Examples

### Example 1: List Branches

```typescript
// List all local branches
const branches = await listRefs({
  fs,
  gitdir: '/path/to/.git',
  filepath: 'refs/heads'
})

console.log('Branches:', branches)
// ['refs/heads/main', 'refs/heads/feature-branch']
```

### Example 2: List Tags

```typescript
// List all tags
const tags = await listRefs({
  fs,
  gitdir: '/path/to/.git',
  filepath: 'refs/tags'
})

console.log('Tags:', tags)
// ['refs/tags/v1.0.0', 'refs/tags/v1.1.0']
```

### Example 3: List Remote Branches

```typescript
// List remote-tracking branches
const remoteBranches = await listRefs({
  fs,
  gitdir: '/path/to/.git',
  filepath: 'refs/remotes/origin'
})

console.log('Remote branches:', remoteBranches)
// ['refs/remotes/origin/main', 'refs/remotes/origin/feature']
```

### Example 4: List All Refs

```typescript
// List all refs
const allRefs = await listRefs({
  fs,
  gitdir: '/path/to/.git',
  filepath: 'refs'
})

console.log('All refs:', allRefs)
// Includes branches, tags, remotes, etc.
```

## API Reference

### `listRefs(options)`

List references under a specific path.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (optional)
- `gitdir` - Git directory (required)
- `filepath` - Path to list refs under (required)
  - Examples: `'refs/heads'`, `'refs/tags'`, `'refs/remotes/origin'`
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string[]>` - Array of full ref paths

## Common Paths

| Path | Description |
|------|-------------|
| `'refs/heads'` | Local branches |
| `'refs/tags'` | Tags |
| `'refs/remotes/origin'` | Remote-tracking branches for origin |
| `'refs/remotes'` | All remote-tracking branches |
| `'refs'` | All refs |

## Best Practices

### 1. Use Specific Commands When Available

```typescript
// ✅ Good: Use specific command
import { listBranches } from 'universal-git'
const branches = await listBranches({ fs, dir })

// ⚠️ Also works: Use listRefs
const branches = await listRefs({ fs, gitdir, filepath: 'refs/heads' })
// Returns full paths: ['refs/heads/main', ...]
```

### 2. Filter Results

```typescript
// List branches and filter
const allBranches = await listRefs({ fs, gitdir, filepath: 'refs/heads' })
const featureBranches = allBranches.filter(b => b.includes('feature'))
```

## See Also

- [List Branches](./list-branches.md) - List branches (simpler API)
- [List Tags](./list-tags.md) - List tags (simpler API)
- [Resolve Ref](./resolve-ref.md) - Resolve refs to OIDs


