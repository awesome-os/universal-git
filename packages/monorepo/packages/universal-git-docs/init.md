---
title: Init
sidebar_label: init
---

# init

Initialize a new Git repository.

## Overview

The `init` command:
- Creates a new Git repository
- Sets up the `.git` directory structure
- Configures initial settings
- Supports bare and non-bare repositories
- Supports SHA-1 and SHA-256 object formats

## Basic Usage

### Using Repository.init() (Recommended)

The recommended way to initialize a repository is using the `init()` method on a `Repository` instance:

```typescript
import { Repository } from 'universal-git'

// Open a repository (doesn't need to exist yet)
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo'
})

// Initialize the repository
await repo.init()

// Or with options
await repo.init({
  defaultBranch: 'main',
  objectFormat: 'sha1'
})

// Repository is ready to use
await repo.add('README.md')
await repo.commit('Initial commit')
```

**Benefits:**
- Git-like API (all commands on Repository instance)
- Backend-agnostic (works with any backend type)
- Can initialize after opening
- Full control over initialization options

### Using Repository.open() with init Option

You can also initialize and open in one call:

```typescript
import { Repository } from 'universal-git'

// Initialize and open a new repository
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  init: true
})

// Repository is ready to use
await repo.add('README.md')
```

**Benefits:**
- Single call to both initialize and open the repository
- Backend-agnostic (works with any backend type)
- Returns a `Repository` instance ready for use
- Handles initialization automatically through the backend

### Using init() Command (Legacy)

You can also use the `init()` command directly:

```typescript
import { init } from 'universal-git'

// Initialize a new repository
await init({
  fs,
  dir: '/path/to/repo'
})
```

**Note**: The `init()` command is now a convenience wrapper that delegates to backend initialization. For new code, prefer using `Repository.open({ init: true })`.

## Examples

### Example 1: Basic Init with Repository.open()

```typescript
// Initialize and open a new repository (recommended)
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  init: true
})

// Repository is ready to use immediately
await add({ repo, filepath: 'README.md' })
```

### Example 1b: Basic Init with init() Command

```typescript
// Initialize a new repository using init() command
await init({
  fs,
  dir: '/path/to/repo'
})

// Creates .git directory and initializes repository
```

### Example 2: Init with Custom Default Branch

```typescript
// Using Repository.open() (recommended)
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  init: true,
  defaultBranch: 'main'  // Instead of 'master'
})

// Or using init() command
await init({
  fs,
  dir: '/path/to/repo',
  defaultBranch: 'main'  // Instead of 'master'
})
```

### Example 3: Init SHA-256 Repository

```typescript
// Using Repository.open() (recommended)
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  init: true,
  objectFormat: 'sha256'
})

// Or using init() command
await init({
  fs,
  dir: '/path/to/repo',
  objectFormat: 'sha256'
})
```

### Example 4: Bare Repository

```typescript
// Using Repository.open() (recommended)
const repo = await Repository.open({
  fs,
  gitdir: '/path/to/bare-repo',
  init: true,
  bare: true
})

// Or using init() command
await init({
  fs,
  dir: '/path/to/bare-repo',
  bare: true
})

// Repository has no working directory, only .git contents
```

### Example 5: Init with Custom Backend

```typescript
import { Repository } from 'universal-git'
import { createBackend } from 'universal-git/backends'

// Using Repository.open() with custom backend (recommended)
const gitBackend = createBackend({
  type: 'sqlite',
  dbPath: '/path/to/repo.db'
})

const repo = await Repository.open({
  gitBackend,
  init: true,
  defaultBranch: 'main',
  objectFormat: 'sha1'
})

// Or using init() command with custom backend
import { init } from 'universal-git'
await init({
  fs,
  gitdir: '/path/to/repo',
  backend: gitBackend
})
```

## API Reference

### `init(options)`

Initialize a new Git repository.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (optional, required if `bare: false`)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')` or `dir` if bare)
- `bare` - Create bare repository (optional, default: `false`)
- `defaultBranch` - Default branch name (optional, default: `'master'`)
- `objectFormat` - Object format: `'sha1'` or `'sha256'` (optional, default: `'sha1'`)
- `backend` - Custom Git backend (optional, defaults to FilesystemBackend)

**Returns:**

- `Promise<void>` - Resolves when repository is initialized

## Repository Types

### Non-Bare Repository (Default)

A non-bare repository has a working directory:

```
/path/to/repo/
├── .git/          # Git directory
│   ├── objects/
│   ├── refs/
│   ├── config
│   └── ...
└── ...            # Working directory files
```

```typescript
// Create non-bare repository
await init({
  fs,
  dir: '/path/to/repo'
})
```

### Bare Repository

A bare repository has no working directory:

```
/path/to/bare-repo/
├── objects/       # Git directory contents
├── refs/
├── config
└── ...
```

```typescript
// Create bare repository
await init({
  fs,
  dir: '/path/to/bare-repo',
  bare: true
})
```

## Object Formats

### SHA-1 (Default)

SHA-1 is the default object format:

```typescript
// Initialize with SHA-1 (default)
await init({
  fs,
  dir: '/path/to/repo',
  objectFormat: 'sha1'  // Default
})
```

### SHA-256

SHA-256 provides enhanced security:

```typescript
// Initialize with SHA-256
await init({
  fs,
  dir: '/path/to/repo',
  objectFormat: 'sha256'
})
```

**Note**: Once initialized, the object format cannot be changed. Choose carefully.

## What Init Creates

The `init` command creates:

1. **`.git` directory** (or bare repository structure)
2. **Initial configuration**:
   - Repository format version
   - Object format (SHA-1 or SHA-256)
   - Default branch name
3. **Directory structure**:
   - `objects/` - Object database
   - `refs/` - References (branches, tags)
   - `config` - Repository configuration
   - `HEAD` - Points to default branch

## Best Practices

### 1. Choose Object Format at Init

```typescript
// ✅ Good: Choose format when initializing
await init({
  fs,
  dir: '/path/to/repo',
  objectFormat: 'sha256'  // Choose at creation
})

// ❌ Not possible: Cannot change format later
```

### 2. Use Descriptive Default Branch

```typescript
// Use modern default branch name
await init({
  fs,
  dir: '/path/to/repo',
  defaultBranch: 'main'  // Instead of 'master'
})
```

### 3. Initialize Before Other Operations

```typescript
// ✅ Good: Initialize and open repository in one call
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  init: true
})
await add({ repo, filepath: 'README.md' })
await commit({ repo, message: 'Initial commit' })

// ✅ Also good: Initialize separately
await init({ fs, dir: '/path/to/repo' })
const repo = await Repository.open({ fs, dir: '/path/to/repo' })
await add({ repo, filepath: 'README.md' })

// ❌ Bad: Operations fail without init
await add({ fs, dir: '/path/to/repo', filepath: 'README.md' })
// Error: Repository not initialized
```

## Limitations

1. **Format Immutable**: Object format cannot be changed after init
2. **Already Initialized**: Re-running init on existing repo is a no-op
3. **Bare Repositories**: Cannot have working directory

## Troubleshooting

### Repository Already Exists

If repository is already initialized:

```typescript
// Init is idempotent - safe to run multiple times
await init({ fs, dir: '/path/to/repo' })
await init({ fs, dir: '/path/to/repo' })  // No error, just returns
```

### Directory Not Found

If directory doesn't exist:

```typescript
// Ensure directory exists first
await fs.mkdir('/path/to/repo')
await init({ fs, dir: '/path/to/repo' })
```

## See Also

- [Clone](./clone.md) - Clone existing repository
- [SHA-256](./sha256.md) - SHA-256 object format
- [Backends](./backends.md) - Git backends


