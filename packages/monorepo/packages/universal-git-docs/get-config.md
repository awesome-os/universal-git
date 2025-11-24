---
title: Get Config
sidebar_label: getConfig
---

# getConfig

Read a Git configuration value.

## Overview

The `getConfig` command:
- Reads a single config value
- Supports all config scopes (local, global, system)
- Returns the value or `undefined` if not found
- Works with Repository class for consistency

## Basic Usage

```typescript
import { getConfig } from 'universal-git'

// Read a config value
const value = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'user.name'
})

console.log('User name:', value)
```

## Examples

### Example 1: Read User Config

```typescript
// Read user name
const userName = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'user.name'
})

console.log('User:', userName)
```

### Example 2: Read Remote URL

```typescript
// Read remote URL
const remoteUrl = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.url'
})

console.log('Remote URL:', remoteUrl)
```

### Example 3: Read Branch Config

```typescript
// Read branch tracking config
const trackingBranch = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'branch.main.remote'
})

console.log('Tracking remote:', trackingBranch)
```

### Example 4: Check if Config Exists

```typescript
// Check if config exists
const value = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'core.autocrlf'
})

if (value !== undefined) {
  console.log('autocrlf is set to:', value)
} else {
  console.log('autocrlf is not configured')
}
```

### Example 5: Read Boolean Config

```typescript
// Read boolean config
const bare = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'core.bare'
})

console.log('Bare repository:', bare === true)
```

## API Reference

### `getConfig(options)`

Read a configuration value.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `path` - Config key path (required)
  - Format: `section.subsection.key` or `section.key`
  - Examples: `'user.name'`, `'remote.origin.url'`, `'core.autocrlf'`
- `cache` - Cache object (optional)

**Returns:**

- `Promise<unknown>` - Config value, or `undefined` if not found

## Config Path Format

Config paths use dot notation:

```typescript
// Section.key
'user.name'
'core.bare'

// Section.subsection.key
'remote.origin.url'
'branch.main.remote'
'remote.origin.fetch'
```

## Common Config Values

### User Configuration

```typescript
const name = await getConfig({ fs, dir, path: 'user.name' })
const email = await getConfig({ fs, dir, path: 'user.email' })
```

### Core Configuration

```typescript
const bare = await getConfig({ fs, dir, path: 'core.bare' })
const autocrlf = await getConfig({ fs, dir, path: 'core.autocrlf' })
const defaultBranch = await getConfig({ fs, dir, path: 'init.defaultBranch' })
```

### Remote Configuration

```typescript
const remoteUrl = await getConfig({ fs, dir, path: 'remote.origin.url' })
const fetchRef = await getConfig({ fs, dir, path: 'remote.origin.fetch' })
```

### Branch Configuration

```typescript
const remote = await getConfig({ fs, dir, path: 'branch.main.remote' })
const merge = await getConfig({ fs, dir, path: 'branch.main.merge' })
```

## Best Practices

### 1. Use with Repository

```typescript
// ✅ Good: Use Repository for consistency
import { Repository } from 'universal-git'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })
const config = await repo.getConfig()
const value = await config.get('user.name')

// ⚠️ Also works: Direct command
const value = await getConfig({ fs, dir: '/path/to/repo', path: 'user.name' })
```

### 2. Handle Undefined Values

```typescript
// ✅ Good: Check for undefined
const value = await getConfig({ fs, dir, path: 'user.name' })
if (value !== undefined) {
  console.log('Value:', value)
} else {
  console.log('Config not set')
}

// ⚠️ May fail: Assume value exists
const value = await getConfig({ fs, dir, path: 'user.name' })
console.log(value.toString())  // Error if undefined
```

## Limitations

1. **Single Value**: Returns only the first value for multi-valued configs (use `getConfigAll`)
2. **Local Only**: Currently only reads local config (`.git/config`)
3. **No Include Support**: Doesn't support `[include]` or `[includeIf]` directives

## See Also

- [Get Config All](./get-config-all.md) - Read all values for a key
- [Set Config](./set-config.md) - Write config values
