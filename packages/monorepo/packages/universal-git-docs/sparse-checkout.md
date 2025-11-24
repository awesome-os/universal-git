---
title: Sparse Checkout
sidebar_label: Sparse Checkout
---

# Sparse Checkout

Sparse checkout allows you to work with a subset of your repository's files. This is especially useful for large monorepos where you only need specific directories.

## Overview

Sparse checkout lets you:
- Check out only specific directories from a repository
- Reduce disk usage by excluding unnecessary files
- Improve performance by working with fewer files
- Use two modes: **cone mode** (recommended) and **non-cone mode**

## Modes

### Cone Mode (Recommended)

Cone mode is simpler and faster. You specify directory paths, and Git automatically includes all files within those directories.

**Patterns:**
- `src/` - Includes all files in `src/` and subdirectories
- `docs/` - Includes all files in `docs/` and subdirectories

**Benefits:**
- Faster pattern matching
- Simpler patterns
- Better performance

### Non-Cone Mode

Non-cone mode uses Gitignore-style patterns for more flexibility.

**Patterns:**
- `src/**` - All files in `src/` and subdirectories
- `!src/temp/**` - Exclude `src/temp/` (negative patterns)
- `*.js` - All JavaScript files

**Benefits:**
- More flexible pattern matching
- Support for negative patterns
- Fine-grained control

## Basic Usage

### Initialize Sparse Checkout

```typescript
import { sparseCheckout } from 'universal-git'

// Initialize with cone mode (recommended)
await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  init: true,
  cone: true
})
```

### Set Patterns

```typescript
// Set patterns (cone mode)
await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  set: ['src/', 'docs/']
})

// Set patterns (non-cone mode)
await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  set: ['src/**', '!src/temp/**'],
  cone: false
})
```

### List Current Patterns

```typescript
// List current patterns
const patterns = await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  list: true
})

console.log(patterns) // ['src/', 'docs/']
```

## Examples

### Example 1: Monorepo with Multiple Packages

```typescript
import { init, sparseCheckout, checkout } from 'universal-git'

// Initialize repository
await init({ fs, dir: '/path/to/monorepo' })

// Clone (or fetch) the repository
await clone({
  fs,
  http,
  dir: '/path/to/monorepo',
  url: 'https://github.com/user/monorepo.git'
})

// Initialize sparse checkout
await sparseCheckout({
  fs,
  dir: '/path/to/monorepo',
  init: true,
  cone: true
})

// Check out only specific packages
await sparseCheckout({
  fs,
  dir: '/path/to/monorepo',
  set: ['packages/app/', 'packages/shared/']
})

// Now only files in packages/app/ and packages/shared/ are checked out
```

### Example 2: Excluding Large Directories

```typescript
// Use non-cone mode with negative patterns
await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  init: true,
  cone: false
})

// Include everything except large directories
await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  set: [
    '/*',              // Include root files
    '!node_modules/',  // Exclude node_modules
    '!dist/',          // Exclude dist
    '!build/'          // Exclude build
  ],
  cone: false
})
```

### Example 3: Multiple Directories

```typescript
// Check out multiple directories
await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  init: true,
  cone: true
})

await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  set: [
    'src/',
    'docs/',
    'tests/',
    'scripts/'
  ]
})
```

## API Reference

### `sparseCheckout(options)`

Manages sparse checkout patterns.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required for `init` and `set`)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `init` - Initialize sparse checkout (boolean)
- `cone` - Use cone mode (boolean, only with `init` or `set`)
- `set` - Set sparse checkout patterns (string[])
- `list` - List current patterns (boolean)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string[] | void>` - If `list` is true, returns array of patterns. Otherwise returns void.

**Operations:**

1. **`init`** - Initialize sparse checkout
   - Creates `.git/info/sparse-checkout` file
   - Sets cone mode if `cone: true`
   - Applies default pattern (`/*`) to working directory

2. **`set`** - Set patterns
   - Updates `.git/info/sparse-checkout` file
   - Re-applies checkout with new patterns
   - Removes files that don't match patterns

3. **`list`** - List patterns
   - Reads `.git/info/sparse-checkout` file
   - Returns array of current patterns

## How It Works

1. **Pattern Storage**: Patterns are stored in `.git/info/sparse-checkout`
2. **Mode Storage**: Cone mode is stored in `.git/config` under `core.sparseCheckoutCone`
3. **Checkout Application**: When patterns change, the working directory is updated to match
4. **Index Update**: The index is also updated to reflect sparse checkout state

## Pattern Syntax

### Cone Mode Patterns

- `src/` - Include all files in `src/` directory
- `docs/` - Include all files in `docs/` directory
- Patterns must end with `/` for directories

### Non-Cone Mode Patterns

- `src/**` - All files in `src/` and subdirectories
- `*.js` - All JavaScript files
- `!src/temp/**` - Exclude `src/temp/` (negative pattern)
- Uses Gitignore-style pattern matching

## Best Practices

### 1. Use Cone Mode When Possible

Cone mode is faster and simpler:

```typescript
// ✅ Good: Cone mode
await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  init: true,
  cone: true
})

await sparseCheckout({
  fs,
  dir: '/path/to/repo',
  set: ['src/', 'docs/']
})
```

### 2. Initialize Before Setting Patterns

Always initialize before setting patterns:

```typescript
// ✅ Good: Initialize first
await sparseCheckout({ fs, dir, init: true, cone: true })
await sparseCheckout({ fs, dir, set: ['src/'] })

// ❌ Bad: Setting without init
await sparseCheckout({ fs, dir, set: ['src/'] }) // May not work correctly
```

### 3. Use After Clone

Initialize sparse checkout after cloning:

```typescript
// ✅ Good: Clone then initialize sparse checkout
await clone({ fs, http, dir, url })
await sparseCheckout({ fs, dir, init: true, cone: true })
await sparseCheckout({ fs, dir, set: ['src/'] })
```

## Limitations

1. **Tracked Files Only**: Sparse checkout only affects tracked files
2. **No Untracked Files**: Untracked files are not affected by sparse checkout
3. **Index State**: The index reflects sparse checkout state
4. **Checkout Required**: Patterns are applied during checkout operations

## Troubleshooting

### Files Not Being Excluded

If files are not being excluded:

1. Check that sparse checkout is initialized:
   ```typescript
   const patterns = await sparseCheckout({ fs, dir, list: true })
   console.log(patterns) // Should not be empty
   ```

2. Verify patterns are correct:
   ```typescript
   // Check current patterns
   const patterns = await sparseCheckout({ fs, dir, list: true })
   ```

3. Re-apply checkout:
   ```typescript
   await checkout({ fs, dir, ref: 'HEAD', force: true })
   ```

### Patterns Not Working

If patterns are not working:

1. Check cone mode setting:
   ```typescript
   // Verify cone mode
   const isCone = await getConfig({ fs, dir, path: 'core.sparseCheckoutCone' })
   ```

2. Try non-cone mode for complex patterns:
   ```typescript
   await sparseCheckout({ fs, dir, set: ['src/**'], cone: false })
   ```

## See Also

- [Checkout](./checkout.md) - Checkout operations
- [Clone](./clone.md) - Clone repositories
- [Architecture](./architecture.md) - Code structure

