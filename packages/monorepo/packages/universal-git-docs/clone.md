---
title: Clone
sidebar_label: clone
---

# clone

Clone a remote repository into a local directory.

## Overview

The `clone` command:
- Creates a new repository
- Downloads all objects from remote
- Sets up remote tracking branches
- Checks out the default branch
- Supports shallow clones
- Supports single branch clones

## Basic Usage

```typescript
import { clone } from 'universal-git'
import { http } from 'universal-git/http/web'

// Clone a repository
await clone({
  fs,
  http,
  dir: '/path/to/local/repo',
  url: 'https://github.com/user/repo.git'
})
```

## Examples

### Example 1: Basic Clone

```typescript
import { http } from 'universal-git/http/web'

// Clone a repository
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git'
})

// Repository is now cloned and checked out
```

### Example 2: Clone Specific Branch

```typescript
// Clone a specific branch
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  ref: 'feature-branch',
  singleBranch: true
})
```

### Example 3: Shallow Clone

```typescript
// Clone with limited history
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  depth: 1  // Only latest commit
})
```

### Example 4: Clone Without Checkout

```typescript
// Clone but don't checkout files
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  noCheckout: true
})

// Repository cloned, but working directory empty
// Use checkout to get files later
```

### Example 5: Clone with Progress

```typescript
// Track clone progress
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  onProgress: (progress) => {
    console.log(`Downloaded: ${progress.loaded} / ${progress.total}`)
  }
})
```

### Example 6: Clone with Authentication

```typescript
// Clone private repository
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/private-repo.git',
  onAuth: () => ({
    username: 'user',
    password: 'token'
  })
})
```

## API Reference

### `clone(options)`

Clone a remote repository.

**Parameters:**

- `fs` - File system client (required)
- `http` - HTTP client (required for HTTP URLs)
- `tcp` - TCP client (optional, for Git daemon)
- `ssh` - SSH client (optional, for SSH URLs)
- `dir` - Local directory to clone into (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `url` - Remote repository URL (required)
- `ref` - Branch or tag to checkout (optional)
- `remote` - Remote name (optional, default: `'origin'`)
- `depth` - Shallow clone depth (optional)
- `since` - Clone commits since date (optional)
- `exclude` - Refs to exclude (optional)
- `relative` - Use relative paths (optional, default: `false`)
- `singleBranch` - Clone only one branch (optional, default: `false`)
- `noCheckout` - Don't checkout files (optional, default: `false`)
- `noTags` - Don't fetch tags (optional, default: `false`)
- `corsProxy` - CORS proxy URL (optional)
- `headers` - Custom HTTP headers (optional)
- `onProgress` - Progress callback (optional)
- `onMessage` - Message callback (optional)
- `onAuth` - Authentication callback (optional)
- `onAuthSuccess` - Auth success callback (optional)
- `onAuthFailure` - Auth failure callback (optional)
- `onPostCheckout` - Post-checkout callback (optional)
- `nonBlocking` - Use non-blocking operations (optional, default: `false`)
- `batchSize` - Batch size for non-blocking (optional, default: `100`)
- `protocolVersion` - Git protocol version (optional, default: `1`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when clone is complete

## How Clone Works

1. **Creates repository** using `init`
2. **Adds remote** with the provided URL
3. **Fetches objects** from remote repository
4. **Sets up remote tracking branches**
5. **Checks out default branch** (unless `noCheckout: true`)

## Clone Options

### Shallow Clone

Clone with limited history:

```typescript
// Clone only last 5 commits
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  depth: 5
})
```

### Single Branch

Clone only one branch:

```typescript
// Clone only main branch
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  singleBranch: true,
  ref: 'main'
})
```

### No Tags

Clone without tags:

```typescript
// Clone without tags
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  noTags: true
})
```

## Best Practices

### 1. Use Shallow Clone for Large Repos

```typescript
// ✅ Good: Shallow clone for large repositories
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/large-repo.git',
  depth: 1
})

// ⚠️ Careful: Full clone can be slow for large repos
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/large-repo.git'
})
```

### 2. Use Single Branch When Possible

```typescript
// ✅ Good: Clone only what you need
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/repo.git',
  singleBranch: true,
  ref: 'main'
})
```

### 3. Handle Authentication

```typescript
// Provide authentication for private repos
await clone({
  fs,
  http,
  dir: '/path/to/repo',
  url: 'https://github.com/user/private-repo.git',
  onAuth: () => ({
    username: 'user',
    password: 'personal-access-token'
  })
})
```

## Limitations

1. **Network Required**: Requires network connection to remote
2. **Authentication**: Private repos require authentication
3. **Large Repos**: Full clones of large repos can be slow

## Troubleshooting

### Authentication Failed

If authentication fails:

```typescript
try {
  await clone({
    fs,
    http,
    dir: '/path/to/repo',
    url: 'https://github.com/user/private-repo.git',
    onAuth: () => ({ username: 'user', password: 'token' })
  })
} catch (error) {
  if (error.code === 'AuthError') {
    console.log('Authentication failed')
    // Check credentials
  }
}
```

### Network Error

If network fails:

```typescript
try {
  await clone({ fs, http, dir: '/path/to/repo', url: 'https://...' })
} catch (error) {
  if (error.code === 'NetworkError') {
    console.log('Network error, check connection')
  }
}
```

## See Also

- [Fetch](./fetch.md) - Fetch from remote
- [Push](./push.md) - Push to remote
- [Init](./init.md) - Initialize repository

