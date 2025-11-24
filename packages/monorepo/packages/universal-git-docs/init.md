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

```typescript
import { init } from 'universal-git'

// Initialize a new repository
await init({
  fs,
  dir: '/path/to/repo'
})
```

## Examples

### Example 1: Basic Init

```typescript
// Initialize a new repository
await init({
  fs,
  dir: '/path/to/repo'
})

// Creates .git directory and initializes repository
```

### Example 2: Init with Custom Default Branch

```typescript
// Initialize with custom default branch name
await init({
  fs,
  dir: '/path/to/repo',
  defaultBranch: 'main'  // Instead of 'master'
})
```

### Example 3: Init SHA-256 Repository

```typescript
// Initialize repository with SHA-256 object format
await init({
  fs,
  dir: '/path/to/repo',
  objectFormat: 'sha256'
})
```

### Example 4: Bare Repository

```typescript
// Initialize a bare repository (no working directory)
await init({
  fs,
  dir: '/path/to/bare-repo',
  bare: true
})

// Repository has no working directory, only .git contents
```

### Example 5: Init with Custom Backend

```typescript
import { SQLiteBackend } from 'universal-git/backends'

// Initialize with custom backend
const backend = new SQLiteBackend('/path/to/database.db')
await init({
  fs,
  gitdir: '/path/to/repo',
  backend
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
// ✅ Good: Initialize first
await init({ fs, dir: '/path/to/repo' })
await add({ fs, dir: '/path/to/repo', filepath: 'README.md' })
await commit({ fs, dir: '/path/to/repo', message: 'Initial commit' })

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


