---
title: Fast Forward
sidebar_label: fastForward
---

# fastForward

Perform a fast-forward merge (pull with fast-forward only).

## Overview

The `fastForward` command:
- Fetches from remote and merges using fast-forward only
- Fails if fast-forward is not possible
- No merge commit is created
- Simpler than `pull` (no author parameter needed)

## Basic Usage

```typescript
import { fastForward } from 'universal-git'

// Fast-forward merge from remote
await fastForward({
  fs,
  http,
  dir: '/path/to/repo',
  ref: 'main'
})
```

## Examples

### Example 1: Fast-Forward Current Branch

```typescript
// Fast-forward the current branch
await fastForward({
  fs,
  http,
  dir: '/path/to/repo'
})
```

### Example 2: Fast-Forward Specific Branch

```typescript
// Fast-forward a specific branch
await fastForward({
  fs,
  http,
  dir: '/path/to/repo',
  ref: 'feature-branch'
})
```

### Example 3: Fast-Forward with Remote

```typescript
// Fast-forward from specific remote
await fastForward({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'upstream',
  ref: 'main'
})
```

### Example 4: Fast-Forward with Single Branch

```typescript
// Fetch only the target branch
await fastForward({
  fs,
  http,
  dir: '/path/to/repo',
  ref: 'main',
  singleBranch: true
})
```

### Example 5: Handle Fast-Forward Failure

```typescript
// Try fast-forward, handle failure
try {
  await fastForward({
    fs,
    http,
    dir: '/path/to/repo',
    ref: 'main'
  })
  console.log('Fast-forward successful')
} catch (error) {
  if (error.message.includes('fast-forward')) {
    console.log('Fast-forward not possible, branches have diverged')
    // Use regular merge instead
    await pull({ fs, http, dir: '/path/to/repo', ref: 'main' })
  } else {
    throw error
  }
}
```

## API Reference

### `fastForward(options)`

Perform a fast-forward merge.

**Parameters:**

- `fs` - File system client (required)
- `http` - HTTP client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Branch to merge into (optional, default: current branch)
- `url` - Remote repository URL (optional)
- `remote` - Remote name (optional, default: `'origin'`)
- `remoteRef` - Remote branch name (optional)
- `singleBranch` - Fetch only one branch (optional, default: `false`)
- `corsProxy` - CORS proxy URL (optional)
- `headers` - Additional HTTP headers (optional)
- `onProgress` - Progress callback (optional)
- `onMessage` - Message callback (optional)
- `onAuth` - Auth callback (optional)
- `onAuthSuccess` - Auth success callback (optional)
- `onAuthFailure` - Auth failure callback (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when fast-forward completes

## How It Works

1. **Fetches** from the remote repository
2. **Checks** if fast-forward is possible
3. **Updates** the branch to point to the remote branch tip
4. **Updates** working directory to match
5. **Fails** if branches have diverged

## Fast-Forward vs Regular Merge

### Fast-Forward (fastForward)

```typescript
// Only works if current branch is ancestor of remote branch
await fastForward({ fs, http, dir: '/path/to/repo' })
// Result: Linear history, no merge commit
```

### Regular Merge (pull)

```typescript
// Works even if branches have diverged
await pull({ fs, http, dir: '/path/to/repo' })
// Result: May create merge commit
```

## Best Practices

### 1. Check Before Fast-Forward

```typescript
// ✅ Good: Check if fast-forward is possible
import { isDescendent } from 'universal-git'

const currentOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const remoteOid = await resolveRef({ fs, dir, ref: 'origin/main' })

const canFastForward = await isDescendent({
  fs,
  dir: '/path/to/repo',
  oid: remoteOid,
  ancestor: currentOid
})

if (canFastForward) {
  await fastForward({ fs, http, dir: '/path/to/repo' })
} else {
  await pull({ fs, http, dir: '/path/to/repo' })
}
```

### 2. Use for Clean History

```typescript
// Fast-forward maintains linear history
await fastForward({ fs, http, dir: '/path/to/repo' })
// No merge commit created
```

## Limitations

1. **Diverged Branches**: Fails if branches have diverged
2. **No Merge Commit**: Cannot create merge commits
3. **Remote Required**: Requires HTTP client and remote access

## See Also

- [Pull](./pull.md) - Pull with merge commit support
- [Fetch](./fetch.md) - Fetch without merging
- [Is Descendent](./is-descendent.md) - Check if fast-forward is possible
