---
title: Add Remote
sidebar_label: addRemote
---

# addRemote

Add or update a remote repository configuration.

## Overview

The `addRemote` command:
- Adds remote repository configuration
- Updates `.git/config` with remote settings
- Can overwrite existing remotes
- Sets up default fetch refspec

## Basic Usage

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

## Examples

### Example 1: Add Remote

```typescript
// Add a remote
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',
  url: 'https://github.com/user/repo.git'
})
```

### Example 2: Add Upstream Remote

```typescript
// Add upstream remote
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'upstream',
  url: 'https://github.com/original/repo.git'
})
```

### Example 3: Force Overwrite

```typescript
// Overwrite existing remote
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',
  url: 'https://github.com/new/repo.git',
  force: true  // Overwrite existing
})
```

### Example 4: Add Multiple Remotes

```typescript
// Add multiple remotes
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',
  url: 'https://github.com/user/repo.git'
})

await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'upstream',
  url: 'https://github.com/original/repo.git'
})
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

**Throws:**

- `AlreadyExistsError` - If remote exists and `force: false`

## Remote Configuration

Adds to `.git/config`:

```ini
[remote "origin"]
  url = https://github.com/user/repo.git
  fetch = +refs/heads/*:refs/remotes/origin/*
```

## Best Practices

### 1. Check Before Adding

```typescript
// ✅ Good: Check if remote exists
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
if (remotes.some(r => r.remote === 'upstream')) {
  await addRemote({
    fs,
    dir: '/path/to/repo',
    remote: 'upstream',
    url: newUrl,
    force: true
  })
} else {
  await addRemote({
    fs,
    dir: '/path/to/repo',
    remote: 'upstream',
    url: newUrl
  })
}
```

### 2. Use Standard Names

```typescript
// ✅ Good: Use standard remote names
await addRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'origin',  // Standard name for main remote
  url: 'https://github.com/user/repo.git'
})
```

## Limitations

1. **Config Only**: Only updates config, doesn't fetch
2. **No Validation**: Doesn't validate remote URL accessibility

## See Also

- [List Remotes](./list-remotes.md) - List remotes
- [Delete Remote](./delete-remote.md) - Delete remotes
- [Remote](./remote.md) - Remote management overview

