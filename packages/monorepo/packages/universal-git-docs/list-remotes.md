---
title: List Remotes
sidebar_label: listRemotes
---

# listRemotes

List all configured remote repositories.

## Overview

The `listRemotes` command:
- Lists all remotes from `.git/config`
- Returns remote names and URLs
- Simple array of remote objects

## Basic Usage

```typescript
import { listRemotes } from 'universal-git'

// List all remotes
const remotes = await listRemotes({
  fs,
  dir: '/path/to/repo'
})

console.log('Remotes:', remotes)
```

## Examples

### Example 1: List All Remotes

```typescript
// List all remotes
const remotes = await listRemotes({
  fs,
  dir: '/path/to/repo'
})

for (const { remote, url } of remotes) {
  console.log(`${remote}: ${url}`)
}
```

### Example 2: Find Specific Remote

```typescript
// Find a specific remote
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
const origin = remotes.find(r => r.remote === 'origin')

if (origin) {
  console.log('Origin URL:', origin.url)
} else {
  console.log('Origin remote not found')
}
```

### Example 3: Check if Remote Exists

```typescript
// Check if remote exists
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
const hasUpstream = remotes.some(r => r.remote === 'upstream')

if (hasUpstream) {
  console.log('Upstream remote exists')
} else {
  console.log('Upstream remote not found')
}
```

## API Reference

### `listRemotes(options)`

List all remotes.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<Array<{ remote: string; url: string }>>` - Array of remote objects

**Remote Object:**
```typescript
{
  remote: string  // Remote name (e.g., 'origin')
  url: string     // Remote URL
}
```

## Best Practices

### 1. Check Before Operations

```typescript
// ✅ Good: Check remotes before operations
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
if (remotes.length === 0) {
  console.log('No remotes configured')
} else {
  console.log(`Found ${remotes.length} remotes`)
}
```

### 2. Use for Remote Management

```typescript
// ✅ Good: Use listRemotes for remote management
const remotes = await listRemotes({ fs, dir: '/path/to/repo' })

// Add missing remote
if (!remotes.some(r => r.remote === 'upstream')) {
  await addRemote({
    fs,
    dir: '/path/to/repo',
    remote: 'upstream',
    url: 'https://github.com/original/repo.git'
  })
}
```

## Limitations

1. **Config Only**: Only reads from config, doesn't verify remotes are accessible
2. **No Details**: Returns only name and URL (no fetch/push refspecs)

## See Also

- [Add Remote](./add-remote.md) - Add remotes
- [Delete Remote](./delete-remote.md) - Delete remotes
- [Remote](./remote.md) - Remote management overview

