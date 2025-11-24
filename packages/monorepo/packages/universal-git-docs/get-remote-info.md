---
title: Get Remote Info
sidebar_label: getRemoteInfo
---

# getRemoteInfo

Query a remote Git server's capabilities and protocol version.

## Overview

The `getRemoteInfo` command:
- Queries remote server capabilities
- Determines protocol version (v1 or v2)
- Returns server refs (protocol v1 only)
- Does not require a local repository
- Useful for checking server features before operations

## Basic Usage

```typescript
import { getRemoteInfo } from 'universal-git'

// Get remote server info
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git'
})

console.log('Protocol version:', info.protocolVersion)
console.log('Capabilities:', info.capabilities)
```

## Examples

### Example 1: Get Server Capabilities

```typescript
// Query server capabilities
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git'
})

console.log('Protocol:', info.protocolVersion)
console.log('Capabilities:', Object.keys(info.capabilities))
```

### Example 2: Check Protocol Version

```typescript
// Check if server supports protocol v2
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git',
  protocolVersion: 2
})

if (info.protocolVersion === 2) {
  console.log('Server supports protocol v2')
} else {
  console.log('Server only supports protocol v1')
}
```

### Example 3: Get Push Capabilities

```typescript
// Query push capabilities
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git',
  forPush: true  // Query push capabilities instead of fetch
})

console.log('Push capabilities:', info.capabilities)
```

### Example 4: Get Refs (Protocol v1)

```typescript
// Get server refs (protocol v1 only)
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git',
  protocolVersion: 1
})

if (info.refs) {
  console.log('Server refs:', info.refs)
}
```

### Example 5: Check Specific Capability

```typescript
// Check if server supports specific capability
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git'
})

if (info.capabilities['multi_ack']) {
  console.log('Server supports multi_ack')
}

if (info.capabilities['shallow']) {
  console.log('Server supports shallow clones')
}
```

## API Reference

### `getRemoteInfo(options)`

Query remote server capabilities.

**Parameters:**

- `http` - HTTP client (required)
- `url` - Remote repository URL (required)
- `protocolVersion` - Protocol version to use: `1` or `2` (optional, default: `2`)
- `forPush` - Query push capabilities instead of fetch (optional, default: `false`)
- `corsProxy` - CORS proxy URL (optional)
- `headers` - Additional HTTP headers (optional)
- `onAuth` - Auth callback (optional)
- `onAuthSuccess` - Auth success callback (optional)
- `onAuthFailure` - Auth failure callback (optional)

**Returns:**

- `Promise<GetRemoteInfoResult>` - Server information

**GetRemoteInfoResult:**
```typescript
{
  protocolVersion: 1 | 2        // Protocol version
  capabilities: Record<string, string | true>  // Server capabilities
  refs?: ServerRef[]            // Server refs (protocol v1 only)
}
```

## Protocol Versions

### Protocol v1

- Returns capabilities and refs
- More verbose
- Legacy support

### Protocol v2 (Default)

- Returns capabilities only
- More efficient
- Modern standard

## Common Capabilities

- `multi_ack` - Multiple acknowledgment support
- `shallow` - Shallow clone support
- `filter` - Partial clone support
- `side-band` - Side-band data transfer
- `side-band-64k` - 64k side-band
- `agent` - Server agent information

## Best Practices

### 1. Check Before Operations

```typescript
// ✅ Good: Check capabilities before cloning
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git'
})

if (info.capabilities['shallow']) {
  // Use shallow clone
}
```

### 2. Handle Protocol Versions

```typescript
// ✅ Good: Handle both protocol versions
const info = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git'
})

if (info.protocolVersion === 1 && info.refs) {
  // Use refs from protocol v1
} else {
  // Use listServerRefs for protocol v2
}
```

### 3. Check Push Capabilities

```typescript
// ✅ Good: Check push capabilities before pushing
const pushInfo = await getRemoteInfo({
  http,
  url: 'https://github.com/user/repo.git',
  forPush: true
})

if (pushInfo.capabilities['atomic']) {
  // Server supports atomic pushes
}
```

## Related Commands

- [`listServerRefs`](./list-server-refs.md) - List server refs (works with both protocol versions)
- [`fetch`](./fetch.md) - Fetch from remote
- [`clone`](./clone.md) - Clone repository





