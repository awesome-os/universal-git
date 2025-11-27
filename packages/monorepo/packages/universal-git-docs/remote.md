---
title: Remote
sidebar_label: Remote
---

# Remote Management

Manage remote repositories (add, list, delete, update).

## Overview

Remote management commands allow you to:
- Add remote repositories
- List configured remotes
- Delete remotes
- Update remote URLs

**Repository Integration**: The `Repository` class provides unified remote backend management. Each remote configured in `.git/config` is represented as a `GitRemoteBackend` instance. See [Repository Remote Operations](./repository.md#remote-operations) for details.

**URL-Indexed Architecture**: The `RemoteBackendRegistry` uses URL-indexed caching, enabling easy bidirectional translation between config entries and backend instances. See [URL-Indexed Architecture](#url-indexed-architecture) for details.

## Commands

### Add Remote

```typescript
import { addRemote } from 'universal-git'

// Add a remote
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',
  url: 'https://github.com/user/repo.git'
})
```

### List Remotes

```typescript
import { listRemotes } from 'universal-git'

// List all remotes
const remotes = await listRemotes({
  fs,
  dir: '/path/to/repo'
})

console.log(remotes)
// [
//   { remote: 'origin', url: 'https://github.com/user/repo.git' },
//   { remote: 'upstream', url: 'https://github.com/upstream/repo.git' }
// ]
```

### Delete Remote

```typescript
import { deleteRemote } from 'universal-git'

// Delete a remote
await deleteRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'upstream'
})
```

## Examples

### Example 1: Add Origin Remote

```typescript
// Add origin remote (typically done during clone)
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',
  url: 'https://github.com/user/repo.git'
})
```

### Example 2: Add Upstream Remote

```typescript
// Add upstream remote for forks
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'upstream',
  url: 'https://github.com/original/repo.git'
})
```

### Example 3: List All Remotes

```typescript
// List all configured remotes
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })

for (const { remote, url } of remotes) {
  console.log(`${remote}: ${url}`)
}
```

### Example 4: Update Remote URL

```typescript
// Update remote URL (use force to overwrite)
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',
  url: 'https://github.com/user/new-repo.git',
  force: true  // Overwrite existing
})
```

### Example 5: Check if Remote Exists

```typescript
// Check if remote exists
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
const hasOrigin = remotes.some(r => r.remote === 'origin')

if (!hasOrigin) {
  await addRemote({
    fs,
    dir: '/path/to/repo',
    remote: 'origin',
    url: 'https://github.com/user/repo.git'
  })
}
```

### Example 6: Using Repository for Remote Management

```typescript
import { Repository } from 'universal-git'
import { http } from 'universal-git/http/web'

// Open repository
const repo = await Repository.open({ fs, dir: '/path/to/repo' })

// Get remote backend (automatically reads from config)
const originBackend = await repo.getRemote('origin', { http })

// Use remote backend for operations
const remoteRefs = await originBackend.discover({
  service: 'git-upload-pack',
  url: 'https://github.com/user/repo.git',
  http
})

// List all remotes with their backends
const remotes = await repo.listRemotes()
for (const { name, backend } of remotes) {
  console.log(`${name}: ${backend.baseUrl}`)
}

// Invalidate cache if remotes change
await addRemote({ repo, remote: 'upstream', url: '...' })
repo.invalidateRemoteCache()
```

## API Reference

### `addRemote(options)`

Add or update a remote.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `remote` - Remote name (required)
- `url` - Remote URL (required)
- `force` - Overwrite existing remote (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when remote is added

### `listRemotes(options)`

List all configured remotes.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<Array<{ remote: string; url: string }>>` - Array of remote info

### `deleteRemote(options)`

Delete a remote.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `remote` - Remote name to delete (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when remote is deleted

## URL-Indexed Architecture

The `RemoteBackendRegistry` uses a URL-indexed map architecture that enables easy bidirectional translation between config entries and backend instances.

### How It Works

**URL-Indexed Caching**:
- Backends are cached globally by normalized URL (lowercase, trimmed)
- Multiple remotes with the same URL share the same backend instance
- Cache persists for the lifetime of the application

**Bidirectional Translation**:

1. **Config → Backend**: Read URL from config, look up backend by URL
   ```typescript
   // Read URL from config
   const config = await repo.getConfig()
   const url = await config.get('remote.origin.url') // 'https://github.com/user/repo.git'
   
   // Look up backend by URL
   const backend = await repo.getRemote('origin') // Uses RemoteBackendRegistry.getBackend(url)
   ```

2. **Backend → Config**: Get URL from backend, find config entry
   ```typescript
   // Get URL from backend
   const backend = await repo.getRemote('origin')
   const backendUrl = backend.getUrl() // 'https://github.com/user/repo.git'
   
   // Find config entry with this URL
   const config = await repo.getConfig()
   const remoteNames = await config.getSubsections('remote')
   for (const name of remoteNames) {
     const configUrl = await config.get(`remote.${name}.url`)
     if (configUrl === backendUrl) {
       console.log(`Remote '${name}' uses this backend`)
     }
   }
   ```

### URL Normalization

URLs are normalized (trimmed, lowercase) for consistent lookup:

```typescript
// These all map to the same backend:
'https://github.com/user/repo.git'
'HTTPS://GITHUB.COM/USER/REPO.GIT'
'  https://github.com/user/repo.git  '
```

### Benefits

1. **Easy Translation**: Simple mapping between config and backends
2. **Shared Instances**: Multiple remotes with same URL share backend
3. **Consistent Lookup**: Normalized URLs ensure reliable matching
4. **Cache Efficiency**: Global cache reduces backend creation overhead

### Example: Finding Remotes by URL

```typescript
import { Repository } from 'universal-git'
import { RemoteBackendRegistry } from 'universal-git/git/remote'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })

// Get a backend
const originBackend = await repo.getRemote('origin')
const backendUrl = originBackend.getUrl()

// Find all remotes that use this URL
const config = await repo.getConfig()
const remoteNames = await config.getSubsections('remote')
const remotesWithSameUrl = []

for (const name of remoteNames) {
  const configUrl = await config.get(`remote.${name}.url`)
  if (configUrl === backendUrl) {
    remotesWithSameUrl.push(name)
  }
}

console.log(`Remotes using ${backendUrl}:`, remotesWithSameUrl)
// Output: ['origin', 'backup'] (if both point to same URL)
```

### Example: Checking Backend Cache

```typescript
import { RemoteBackendRegistry } from 'universal-git/git/remote'

// Check if backend exists for URL
const url = 'https://github.com/user/repo.git'
const backend = RemoteBackendRegistry.getBackendByUrl(url)

if (backend) {
  console.log('Backend already cached for this URL')
} else {
  console.log('No backend cached, will create new one')
}
```

## Remote Configuration

Remotes are stored in `.git/config`:

```ini
[remote "origin"]
    url = https://github.com/user/repo.git
    fetch = +refs/heads/*:refs/remotes/origin/*
```

The `RemoteBackendRegistry` automatically creates backend instances from these URLs, using URL-indexed caching for efficient lookup and translation.

## Best Practices

### 1. Use Standard Remote Names

```typescript
// ✅ Good: Use standard names
await addRemote({ fs, dir, remote: 'origin', url: '...' })
await addRemote({ fs, dir, remote: 'upstream', url: '...' })

// ⚠️ Also works: Custom names
await addRemote({ fs, dir, remote: 'my-remote', url: '...' })
```

### 2. Verify Before Adding

```typescript
// Check if remote exists before adding
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
if (!remotes.some(r => r.remote === 'origin')) {
  await addRemote({ fs, dir, remote: 'origin', url: '...' })
}
```

### 3. Update URLs When Needed

```typescript
// Update remote URL if repository moved
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',
  url: 'https://github.com/user/new-repo.git',
  force: true
})
```

## Limitations

1. **URL Validation**: URLs are not validated for correctness
2. **Remote Existence**: Must exist to delete or update

## Troubleshooting

### Remote Already Exists

If remote already exists:

```typescript
try {
  await addRemote({ fs, dir, remote: 'origin', url: '...' })
} catch (error) {
  if (error.code === 'AlreadyExistsError') {
    // Use force to overwrite
    await addRemote({ fs, dir, remote: 'origin', url: '...', force: true })
  }
}
```

### Remote Not Found

If remote doesn't exist:

```typescript
// Check if remote exists
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
const remote = remotes.find(r => r.remote === 'origin')

if (!remote) {
  console.log('Remote not found')
  await addRemote({ fs, dir, remote: 'origin', url: '...' })
}
```

## See Also

- [Repository](./repository.md) - Repository class with remote backend management
- [Clone](./clone.md) - Clone repository (adds origin automatically)
- [Fetch](./fetch.md) - Fetch from remote
- [Push](./push.md) - Push to remote


