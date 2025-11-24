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

## Remote Configuration

Remotes are stored in `.git/config`:

```ini
[remote "origin"]
    url = https://github.com/user/repo.git
    fetch = +refs/heads/*:refs/remotes/origin/*
```

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

- [Clone](./clone.md) - Clone repository (adds origin automatically)
- [Fetch](./fetch.md) - Fetch from remote
- [Push](./push.md) - Push to remote


