---
title: Set Config
sidebar_label: setConfig
---

# setConfig

Write a Git configuration value.

## Overview

The `setConfig` command:
- Sets a configuration value
- Supports string, boolean, and number values
- Can append to multi-valued configs
- Can unset values (by setting to `undefined`)

## Basic Usage

```typescript
import { setConfig } from 'universal-git'

// Set a config value
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'user.name',
  value: 'John Doe'
})
```

## Examples

### Example 1: Set User Name

```typescript
// Set user name
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'user.name',
  value: 'John Doe'
})
```

### Example 2: Set Boolean Config

```typescript
// Set boolean config
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'core.bare',
  value: true
})
```

### Example 3: Set Number Config

```typescript
// Set number config
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'core.compression',
  value: 6
})
```

### Example 4: Append to Multi-Valued Config

```typescript
// Append fetch refspec
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch',
  value: '+refs/heads/*:refs/remotes/origin/*',
  append: true  // Append instead of replace
})
```

### Example 5: Unset Config Value

```typescript
// Unset config value
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'user.name',
  value: undefined  // Unsets the value
})
```

### Example 6: Set Remote URL

```typescript
// Set remote URL
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.url',
  value: 'https://github.com/user/repo.git'
})
```

## API Reference

### `setConfig(options)`

Set a configuration value.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `path` - Config key path (required)
- `value` - Config value (required)
  - Can be: `string`, `boolean`, `number`, or `undefined` (to unset)
- `append` - Append instead of replace (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when config is set

## Value Types

### String Values

```typescript
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'user.name',
  value: 'John Doe'
})
```

### Boolean Values

```typescript
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'core.bare',
  value: true
})
```

### Number Values

```typescript
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'core.compression',
  value: 6
})
```

### Unset Values

```typescript
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'user.name',
  value: undefined  // Removes the config entry
})
```

## Append Mode

### Replace (Default)

```typescript
// Replace existing value
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch',
  value: '+refs/heads/*:refs/remotes/origin/*'
  // append: false (default)
})
```

### Append

```typescript
// Append to existing values
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch',
  value: '+refs/heads/feature/*:refs/remotes/origin/feature/*',
  append: true  // Adds to existing values
})
```

## Common Config Operations

### Set User Configuration

```typescript
await setConfig({ fs, dir, path: 'user.name', value: 'John Doe' })
await setConfig({ fs, dir, path: 'user.email', value: 'john@example.com' })
```

### Set Core Configuration

```typescript
await setConfig({ fs, dir, path: 'core.autocrlf', value: 'true' })
await setConfig({ fs, dir, path: 'core.bare', value: false })
await setConfig({ fs, dir, path: 'init.defaultBranch', value: 'main' })
```

### Set Remote Configuration

```typescript
await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.url',
  value: 'https://github.com/user/repo.git'
})

await setConfig({
  fs,
  dir: '/path/to/repo',
  path: 'remote.origin.fetch',
  value: '+refs/heads/*:refs/remotes/origin/*',
  append: true
})
```

## Best Practices

### 1. Use with Repository

```typescript
// ✅ Good: Use Repository for consistency
import { Repository } from 'universal-git'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })
const config = await repo.getConfig()
await config.set('user.name', 'John Doe', 'local')
```

### 2. Verify After Setting

```typescript
// ✅ Good: Verify config was set
await setConfig({ fs, dir, path: 'user.name', value: 'John Doe' })
const value = await getConfig({ fs, dir, path: 'user.name' })
assert.strictEqual(value, 'John Doe')
```

## Limitations

1. **Local Only**: Currently only writes to local config (`.git/config`)
2. **No Include Support**: Doesn't support `[include]` directives
3. **No Validation**: Doesn't validate config value format

## See Also

- [Get Config](./get-config.md) - Read config values
- [Get Config All](./get-config-all.md) - Read all config values

