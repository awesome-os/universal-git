---
title: Push
sidebar_label: push
---

# push

Upload local commits and refs to a remote repository.

## Overview

The `push` command:
- Uploads local commits to remote
- Updates remote refs
- Requires authentication for write access
- Supports force push
- Can push specific refs

## Basic Usage

```typescript
import { push } from 'universal-git'
import { http } from 'universal-git/http/web'

// Push current branch to remote
const result = await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin'
})

console.log('Push result:', result.ok)
```

## Examples

### Example 1: Push Current Branch

```typescript
// Push current branch to origin
const result = await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin'
})

if (result.ok) {
  console.log('Push successful')
}
```

### Example 2: Push Specific Branch

```typescript
// Push a specific branch
const result = await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  ref: 'feature-branch'
})
```

### Example 3: Force Push

```typescript
// Force push (overwrites remote history)
const result = await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  ref: 'feature-branch',
  force: true  // ⚠️ Use with caution
})
```

### Example 4: Push with Progress

```typescript
// Track push progress
const result = await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  onProgress: (progress) => {
    console.log(`Uploaded: ${progress.loaded} / ${progress.total}`)
  }
})
```

### Example 5: Push with Authentication

```typescript
// Push to private repository
const result = await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  onAuth: () => ({
    username: 'user',
    password: 'personal-access-token'
  })
})
```

### Example 6: Push Tags

```typescript
// Push a tag
const result = await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  ref: 'refs/tags/v1.0.0'
})
```

## API Reference

### `push(options)`

Push to a remote repository.

**Parameters:**

- `fs` - File system client (required)
- `http` - HTTP client (required for HTTP URLs)
- `tcp` - TCP client (optional, for Git daemon)
- `ssh` - SSH client (optional, for SSH URLs)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `remote` - Remote name (optional, default: `'origin'`)
- `url` - Remote URL (optional, overrides remote config)
- `ref` - Local ref to push (optional, defaults to current branch)
- `remoteRef` - Remote ref name (optional)
- `force` - Force push (optional, default: `false`)
- `corsProxy` - CORS proxy URL (optional)
- `headers` - Custom HTTP headers (optional)
- `onProgress` - Progress callback (optional)
- `onMessage` - Message callback (optional)
- `onAuth` - Authentication callback (optional)
- `onAuthSuccess` - Auth success callback (optional)
- `onAuthFailure` - Auth failure callback (optional)
- `onPrePush` - Pre-push hook callback (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<PushResult>` - Push operation result

**PushResult:**
```typescript
{
  ok: boolean                        // Whether push succeeded
  refs: Record<string, RefUpdateStatus>  // Status of each ref update
  headers?: Record<string, string>   // Response headers
}
```

**RefUpdateStatus:**
```typescript
{
  ok: boolean        // Whether update succeeded
  error?: string     // Error message if failed
  reason?: string    // Reason for rejection
}
```

## How Push Works

1. **Determines what to push** (commits and refs)
2. **Packs objects** into packfile format
3. **Connects to remote** repository
4. **Negotiates capabilities** with remote
5. **Uploads packfile** with commits and objects
6. **Updates remote refs** (if push succeeds)
7. **Updates local remote-tracking refs**

## Force Push

Force push overwrites remote history:

```typescript
// ⚠️ WARNING: Force push rewrites remote history
await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  ref: 'feature-branch',
  force: true
})
```

**Use force push when:**
- You've rewritten local history (rebase, amend)
- You need to overwrite remote changes
- You're sure no one else is using the branch

**Don't force push:**
- To shared branches (main, develop)
- If others might have pushed changes
- Without coordinating with your team

## Best Practices

### 1. Fetch Before Push

```typescript
// ✅ Good: Fetch first to check for conflicts
await fetch({ fs, http, dir, remote: 'origin' })
await push({ fs, http, dir, remote: 'origin' })

// ❌ Bad: Push without checking remote state
await push({ fs, http, dir, remote: 'origin' })
// May fail if remote has new commits
```

### 2. Avoid Force Push to Shared Branches

```typescript
// ✅ Good: Normal push to shared branch
await push({ fs, http, dir, remote: 'origin', ref: 'main' })

// ❌ Bad: Force push to shared branch
await push({ fs, http, dir, remote: 'origin', ref: 'main', force: true })
// Can disrupt other developers
```

### 3. Handle Push Rejection

```typescript
try {
  await push({ fs, http, dir, remote: 'origin' })
} catch (error) {
  if (error.code === 'PushRejectedError') {
    // Remote has new commits, fetch and merge first
    await fetch({ fs, http, dir, remote: 'origin' })
    await merge({ fs, dir, theirs: 'origin/main' })
    await push({ fs, http, dir, remote: 'origin' })
  }
}
```

## Limitations

1. **Authentication Required**: Write access requires authentication
2. **Network Required**: Requires network connection
3. **Push Rejection**: Remote may reject push if history diverged

## Troubleshooting

### Push Rejected

If push is rejected:

```typescript
try {
  await push({ fs, http, dir, remote: 'origin' })
} catch (error) {
  if (error.code === 'PushRejectedError') {
    console.log('Push rejected:', error.message)
    // Fetch and merge remote changes
    await fetch({ fs, http, dir, remote: 'origin' })
    await merge({ fs, dir, theirs: 'origin/main' })
    // Try push again
    await push({ fs, http, dir, remote: 'origin' })
  }
}
```

### Authentication Failed

If authentication fails:

```typescript
await push({
  fs,
  http,
  dir: '/path/to/repo',
  remote: 'origin',
  onAuth: () => ({
    username: 'user',
    password: 'personal-access-token'
  })
})
```

## See Also

- [Fetch](./fetch.md) - Fetch from remote
- [Clone](./clone.md) - Clone repository
- [Merge](./merge.md) - Merge branches


