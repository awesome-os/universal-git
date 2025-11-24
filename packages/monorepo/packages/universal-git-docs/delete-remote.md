---
title: Delete Remote
sidebar_label: deleteRemote
---

# deleteRemote

Delete a remote repository configuration.

## Overview

The `deleteRemote` command:
- Removes remote configuration from `.git/config`
- Deletes all remote settings (URL, fetch, push refspecs)
- Does not delete remote-tracking branches
- Does not affect the remote repository

## Basic Usage

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

### Example 1: Delete Remote

```typescript
// Delete a remote
await deleteRemote({
  fs,
  dir: '/path/to/repo',
  remote: 'upstream'
})
```

### Example 2: List Then Delete

```typescript
// List remotes, then delete one
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
console.log('Remotes:', remotes)

if (remotes.some(r => r.remote === 'upstream')) {
  await deleteRemote({ fs, dir: '/path/to/repo', remote: 'upstream' })
  console.log('Remote deleted')
}
```

### Example 3: Clean Up Remotes

```typescript
// Delete all remotes except origin
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })

for (const { remote } of remotes) {
  if (remote !== 'origin') {
    await deleteRemote({ fs, dir: '/path/to/repo', remote })
    console.log(`Deleted remote: ${remote}`)
  }
}
```

## API Reference

### `deleteRemote(options)`

Delete a remote configuration.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `remote` - Remote name to delete (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when remote is deleted

## What Gets Deleted

- **Remote section** in `.git/config` is removed
- **All remote settings** (URL, fetch, push refspecs)
- **Remote-tracking branches** are NOT deleted (they remain as `refs/remotes/<remote>/*`)

## Best Practices

### 1. Check Before Deleting

```typescript
// ✅ Good: Check if remote exists
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
if (remotes.some(r => r.remote === 'upstream')) {
  await deleteRemote({ fs, dir: '/path/to/repo', remote: 'upstream' })
} else {
  console.log('Remote does not exist')
}
```

### 2. Clean Up Remote-Tracking Branches

```typescript
// ✅ Good: Delete remote-tracking branches after deleting remote
await deleteRemote({ fs, dir: '/path/to/repo', remote: 'upstream' })

// Optionally delete remote-tracking branches
const remoteBranches = await listBranches({
  fs,
  dir: '/path/to/repo',
  remote: 'upstream'
})

for (const branch of remoteBranches) {
  await deleteRef({
    fs,
    dir: '/path/to/repo',
    ref: `refs/remotes/upstream/${branch}`
  })
}
```

## Limitations

1. **Config Only**: Only removes config, not remote-tracking branches
2. **No Remote Deletion**: Does not delete anything on the remote server

## See Also

- [Add Remote](./remote.md) - Add remote
- [List Remotes](./remote.md) - List remotes
- [Delete Ref](./delete-ref.md) - Delete remote-tracking branches

