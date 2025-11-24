---
title: Get Config All
sidebar_label: getConfigAll
---

# getConfigAll

Read all values for a multi-valued Git configuration key.

## Overview

The `getConfigAll` command:
- Returns all values for a config key
- Useful for multi-valued configs (like `remote.origin.fetch`)
- Returns an array of values
- Returns empty array if key doesn't exist

## Basic Usage

```typescript
import { getConfigAll } from 'universal-git'

// Read all values for a config key
const values = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})

console.log('Fetch refspecs:', values)
```

## Examples

### Example 1: Read All Fetch Refspecs

```typescript
// Read all fetch refspecs for a remote
const fetchRefspecs = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})

console.log('Fetch refspecs:', fetchRefspecs)
// ['+refs/heads/*:refs/remotes/origin/*']
```

### Example 2: Read All URLs for Remote

```typescript
// Read all URLs (if multiple configured)
const urls = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.url'
})

console.log('Remote URLs:', urls)
```

### Example 3: Check if Config Has Values

```typescript
// Check if config has any values
const values = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})

if (values.length > 0) {
  console.log('Has fetch refspecs:', values)
} else {
  console.log('No fetch refspecs configured')
}
```

### Example 4: Compare with getConfig

```typescript
// getConfig returns first value only
const firstValue = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})

// getConfigAll returns all values
const allValues = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})

console.log('First value:', firstValue)
console.log('All values:', allValues)
```

## API Reference

### `getConfigAll(options)`

Read all values for a configuration key.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `path` - Config key path (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<Array<any>>` - Array of config values, empty array if not found

## When to Use

### Use `getConfig` for:
- Single-valued configs
- First value only needed
- Simple checks

```typescript
const userName = await getConfig({ fs, dir, path: 'user.name' })
```

### Use `getConfigAll` for:
- Multi-valued configs
- All values needed
- Configs that can have multiple entries

```typescript
const fetchRefspecs = await getConfigAll({ fs, dir, path: 'remote.origin.fetch' })
```

## Common Multi-Valued Configs

### Remote Fetch Refspecs

```typescript
const fetchRefspecs = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})
// ['+refs/heads/*:refs/remotes/origin/*']
```

### Remote Push Refspecs

```typescript
const pushRefspecs = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.push'
})
```

## Best Practices

### 1. Handle Empty Arrays

```typescript
// ✅ Good: Check for empty array
const values = await getConfigAll({ fs, dir, path: 'remote.origin.fetch' })
if (values.length > 0) {
  console.log('Values:', values)
} else {
  console.log('No values configured')
}
```

### 2. Use for Multi-Valued Configs

```typescript
// ✅ Good: Use getConfigAll for multi-valued configs
const fetchRefspecs = await getConfigAll({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})

// ⚠️ Only gets first: getConfig for multi-valued
const firstRefspec = await getConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch'
})
```

## Limitations

1. **Local Only**: Currently only reads local config
2. **No Include Support**: Doesn't support `[include]` directives

## See Also

- [Get Config](./get-config.md) - Read single config value
- [Set Config](./set-config.md) - Write config values

