---
title: List Server Refs
sidebar_label: listServerRefs
---

# listServerRefs

Fetch a list of refs (branches, tags, etc.) from a remote Git server.

## Overview

The `listServerRefs` command:
- Lists refs from remote server
- Does not require a local repository
- Supports protocol v1 and v2
- Can filter by prefix
- More efficient than fetching all refs

## Basic Usage

```typescript
import { listServerRefs } from 'universal-git'

// List all refs from server
const refs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git'
})

console.log('Server refs:', refs)
```

## Examples

### Example 1: List All Refs

```typescript
// List all refs from server
const refs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git'
})

for (const ref of refs) {
  console.log(`${ref.ref}: ${ref.oid}`)
}
```

### Example 2: List Branches Only

```typescript
// List only branches
const refs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git',
  prefix: 'refs/heads/'  // Only branches
})

console.log('Branches:', refs.map(r => r.ref))
```

### Example 3: List Tags Only

```typescript
// List only tags
const refs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git',
  prefix: 'refs/tags/'  // Only tags
})

console.log('Tags:', refs.map(r => r.ref))
```

### Example 4: Get Default Branch

```typescript
// Get default branch (HEAD symref)
const refs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git',
  symrefs: true  // Include symbolic refs
})

const headRef = refs.find(r => r.ref === 'HEAD')
if (headRef && headRef.symrefTarget) {
  console.log('Default branch:', headRef.symrefTarget)
}
```

### Example 5: Use Protocol v1

```typescript
// Use protocol v1 (may be faster for small repos)
const refs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git',
  protocolVersion: 1
})
```

## API Reference

### `listServerRefs(options)`

List refs from remote server.

**Parameters:**

- `http` - HTTP client (required)
- `url` - Remote repository URL (required)
- `protocolVersion` - Protocol version: `1` or `2` (optional, default: `2`)
- `prefix` - Filter refs by prefix (optional)
  - Example: `'refs/heads/'` for branches only
- `symrefs` - Include symbolic ref targets (optional, default: `false`)
- `peelTags` - Include annotated tag peeled targets (optional, default: `false`)
- `forPush` - Query push refs (optional, default: `false`)
- `corsProxy` - CORS proxy URL (optional)
- `headers` - Additional HTTP headers (optional)
- `onAuth` - Auth callback (optional)
- `onAuthSuccess` - Auth success callback (optional)
- `onAuthFailure` - Auth failure callback (optional)

**Returns:**

- `Promise<ServerRef[]>` - Array of server refs

**ServerRef:**
```typescript
{
  ref: string        // Ref name (e.g., 'refs/heads/main')
  oid: string        // Object OID
  symrefTarget?: string  // Symbolic ref target (if symrefs: true)
  peeled?: string    // Peeled OID (if peelTags: true)
}
```

## Protocol Versions

### Protocol v1

- Single HTTP request
- All refs returned (filtered client-side)
- Good for small repos or fast connections

### Protocol v2 (Default)

- Two HTTP requests
- Server-side filtering (more efficient)
- Better for large repos

## Best Practices

### 1. Use Prefix for Efficiency

```typescript
// ✅ Good: Filter by prefix (more efficient)
const branches = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git',
  prefix: 'refs/heads/'
})

// ⚠️ Less efficient: Get all refs then filter
const allRefs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git'
})
const branches = allRefs.filter(r => r.ref.startsWith('refs/heads/'))
```

### 2. Choose Protocol Based on Repo Size

```typescript
// ✅ Good: Use v2 for large repos, v1 for small repos
const protocolVersion = largeRepo ? 2 : 1
const refs = await listServerRefs({
  http,
  url: 'https://github.com/user/repo.git',
  protocolVersion
})
```

## Limitations

1. **HTTP Only**: Only supports HTTP/HTTPS (not SSH)
2. **No Repository Required**: Doesn't require local repository
3. **Network Dependent**: Requires network connectivity

## See Also

- [Get Remote Info 2](./get-remote-info2.md) - Query server capabilities
- [Clone](./clone.md) - Clone repository
- [Fetch](./fetch.md) - Fetch from remote

