---
title: Pull
sidebar_label: pull
---

# pull

Fetch and merge commits from a remote repository.

## Overview

The `pull` command:
- Fetches commits from remote
- Merges them into current branch
- Supports fast-forward and merge commits
- Can prune remote-tracking branches

## Basic Usage

```typescript
import { pull } from 'universal-git'

// Pull from remote
await pull({
  fs,
  http,
  dir: '/path/to/repo'
})
```

## Examples

### Example 1: Pull Current Branch

```typescript
// Pull current branch from origin
await pull({
  fs,
  http,
  dir: '/path/to/repo'
})
```

### Example 2: Pull Specific Branch

```typescript
// Pull specific branch
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  ref: 'main'
})
```

### Example 3: Pull with Fast-Forward Only

```typescript
// Pull with fast-forward only (no merge commits)
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  fastForwardOnly: true
})
```

### Example 4: Pull from Specific Remote

```typescript
// Pull from specific remote
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'upstream',
  ref: 'main'
})
```

### Example 5: Pull with Pruning

```typescript
// Pull and prune deleted remote branches
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  prune: true,
  pruneTags: true
})
```

### Example 6: Pull Single Branch

```typescript
// Fetch only the target branch
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  ref: 'main',
  singleBranch: true
})
```

## API Reference

### `pull(options)`

Fetch and merge from remote.

**Parameters:**

- `fs` - File system client (required)
- `http` - HTTP client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Branch to merge into (optional, default: current branch)
- `url` - Remote repository URL (optional)
- `remote` - Remote name (optional, default: `'origin'`)
- `remoteRef` - Remote branch name (optional)
- `fastForward` - Allow fast-forward merges (optional, default: `true`)
- `fastForwardOnly` - Only fast-forward, fail if not possible (optional, default: `false`)
- `prune` - Prune remote-tracking branches (optional, default: `false`)
- `pruneTags` - Prune tags (optional, default: `false`)
- `singleBranch` - Fetch only one branch (optional, default: `false`)
- `corsProxy` - CORS proxy URL (optional)
- `headers` - Additional HTTP headers (optional)
- `author` - Author for merge commit (optional)
- `committer` - Committer for merge commit (optional)
- `signingKey` - Signing key for merge commit (optional)
- `onProgress` - Progress callback (optional)
- `onMessage` - Message callback (optional)
- `onAuth` - Auth callback (optional)
- `onAuthSuccess` - Auth success callback (optional)
- `onAuthFailure` - Auth failure callback (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when pull completes

## Pull Modes

### Fast-Forward (Default)

```typescript
// Fast-forward if possible, merge commit if needed
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  fastForward: true  // Default
})
```

### Fast-Forward Only

```typescript
// Only fast-forward, fail if not possible
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  fastForwardOnly: true
})
```

### Merge Commit

```typescript
// Always create merge commit (never fast-forward)
await pull({
  fs,
  http,
  dir: '/path/to/repo',
  fastForward: false
})
```

## Best Practices

### 1. Check Status Before Pull

```typescript
// ✅ Good: Check for uncommitted changes
const status = await statusMatrix({ fs, dir: '/path/to/repo' })
const hasChanges = status.some(([_, head, workdir, stage]) => 
  workdir !== head || stage !== head
)

if (hasChanges) {
  console.log('Uncommitted changes detected')
  // Stash or commit before pulling
}

await pull({ fs, http, dir: '/path/to/repo' })
```

### 2. Handle Merge Conflicts

```typescript
// ✅ Good: Handle merge conflicts
try {
  await pull({ fs, http, dir: '/path/to/repo' })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    console.log('Merge conflicts detected')
    // Resolve conflicts manually
  } else {
    throw error
  }
}
```

## Limitations

1. **Requires HTTP Client**: Needs HTTP client for remote access
2. **Merge Conflicts**: May require manual conflict resolution
3. **Network Dependent**: Requires network connectivity

## See Also

- [Fetch](./fetch.md) - Fetch without merging
- [Fast Forward](./fast-forward.md) - Fast-forward only pull
- [Merge](./merge.md) - Merge branches

