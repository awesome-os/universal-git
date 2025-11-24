---
title: Fetch
sidebar_label: fetch
---

# fetch

Download objects and refs from a remote repository.

## Overview

The `fetch` command:
- Downloads new commits from remote
- Updates remote-tracking branches
- Does not modify working directory
- Does not merge changes
- Supports shallow fetches

## Basic Usage

```typescript
import { fetch } from 'universal-git'
import { http } from 'universal-git/http/web'

// Fetch from remote
const result = await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin'
})

console.log('Fetched:', result.fetchHead)
```

## Examples

### Example 1: Basic Fetch

```typescript
// Fetch all branches from origin
const result = await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin'
})

console.log('Default branch:', result.defaultBranch)
```

### Example 2: Fetch Specific Branch

```typescript
// Fetch a specific branch
const result = await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  ref: 'feature-branch'
})
```

### Example 3: Fetch with Progress

```typescript
// Track fetch progress
const result = await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  onProgress: (progress) => {
    console.log(`Downloaded: ${progress.loaded} / ${progress.total}`)
  }
})
```

### Example 4: Shallow Fetch

```typescript
// Fetch with limited history
const result = await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  depth: 1  // Only latest commits
})
```

### Example 5: Fetch Tags

```typescript
// Fetch tags along with branches
const result = await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  tags: true
})
```

### Example 6: Prune Stale Refs

```typescript
// Remove remote-tracking branches that no longer exist
const result = await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  prune: true  // Remove deleted remote branches
})

console.log('Pruned branches:', result.pruned)
```

## API Reference

### `fetch(options)`

Fetch from a remote repository.

**Parameters:**

- `fs` - File system client (required)
- `http` - HTTP client (required for HTTP URLs)
- `tcp` - TCP client (optional, for Git daemon)
- `ssh` - SSH client (optional, for SSH URLs)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `remote` - Remote name (optional, default: `'origin'`)
- `url` - Remote URL (optional, overrides remote config)
- `ref` - Specific ref to fetch (optional)
- `remoteRef` - Remote ref name (optional)
- `depth` - Shallow fetch depth (optional)
- `since` - Fetch commits since date (optional)
- `exclude` - Refs to exclude (optional)
- `relative` - Use relative paths (optional, default: `false`)
- `tags` - Fetch tags (optional, default: `false`)
- `singleBranch` - Fetch only one branch (optional, default: `false`)
- `prune` - Prune stale refs (optional, default: `false`)
- `pruneTags` - Prune stale tags (optional, default: `false`)
- `corsProxy` - CORS proxy URL (optional)
- `headers` - Custom HTTP headers (optional)
- `onProgress` - Progress callback (optional)
- `onMessage` - Message callback (optional)
- `onAuth` - Authentication callback (optional)
- `onAuthSuccess` - Auth success callback (optional)
- `onAuthFailure` - Auth failure callback (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<FetchResult>` - Fetch operation result

**FetchResult:**
```typescript
{
  defaultBranch: string | null      // Default branch name
  fetchHead: string | null         // OID of fetched HEAD
  fetchHeadDescription: string | null  // Description of fetched HEAD
  headers?: Record<string, string> // Response headers
  pruned?: string[]                // Pruned refs (if prune: true)
  packfile?: string                // Packfile data
}
```

## How Fetch Works

1. **Connects to remote** repository
2. **Negotiates capabilities** with remote
3. **Determines what to fetch** (based on refs and depth)
4. **Downloads objects** (commits, trees, blobs)
5. **Updates remote-tracking branches** (e.g., `origin/main`)
6. **Stores FETCH_HEAD** with fetched commit info

## Fetch vs Pull

**Fetch:**
- Downloads objects and refs
- Updates remote-tracking branches
- Does not modify working directory
- Does not merge changes

**Pull:**
- Fetches from remote
- Merges changes into current branch
- Updates working directory

```typescript
// Fetch only (safe, doesn't change anything)
await fetch({ fs, http, dir, remote: 'origin' })

// Pull (fetches and merges)
await fetch({ fs, http, dir, remote: 'origin' })
await merge({ fs, dir, theirs: 'origin/main' })
```

## Best Practices

### 1. Fetch Regularly

```typescript
// Fetch before merging
await fetch({ fs, http, dir, remote: 'origin' })
await merge({ fs, dir, theirs: 'origin/main' })
```

### 2. Prune Stale Refs

```typescript
// Clean up deleted remote branches
await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  prune: true
})
```

### 3. Use Shallow Fetch for Large Repos

```typescript
// Fetch only recent commits
await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  depth: 10
})
```

## Limitations

1. **Network Required**: Requires network connection
2. **Authentication**: Private repos require authentication
3. **Large Fetches**: Fetching entire history can be slow

## Troubleshooting

### Remote Not Found

If remote doesn't exist:

```typescript
try {
  await fetch({ fs, http, dir, remote: 'origin' })
} catch (error) {
  if (error.code === 'NotFoundError') {
    // Add remote first
    await addRemote({ fs, gitdir, remote: 'origin', url: 'https://...' })
    await fetch({ fs, http, dir, remote: 'origin' })
  }
}
```

### Authentication Failed

If authentication fails:

```typescript
await fetch({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  onAuth: () => ({ username: 'user', password: 'token' })
})
```

## See Also

- [Clone](./clone.md) - Clone repository
- [Push](./push.md) - Push to remote
- [Merge](./merge.md) - Merge branches

