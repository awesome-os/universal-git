---
title: Repository Class
sidebar_label: Repository
---

# Repository Class

The `Repository` class is the central abstraction for Git repository operations in universal-git. It provides caching, state management, and a unified interface for all Git operations.

## What is Repository?

`Repository` is a context object that:
- Manages Git repository state (index, config, refs, etc.)
- Provides caching for performance
- Handles instance management (singleton pattern)
- Integrates with backends for storage
- Provides lazy-loaded access to Git operations

## When to Use Repository

### Use Repository when:
- You need state consistency across multiple operations
- You want automatic caching
- You're performing multiple operations on the same repository
- You need access to repository state (index, config, etc.)

### Use Direct Commands when:
- You need a one-off operation
- You want explicit control over caching
- You're working with multiple repositories
- You prefer functional programming style

## Basic Usage

### Opening a Repository

```typescript
import { Repository } from 'universal-git'
import * as fs from 'fs'

// Open existing repository
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo'
})

// Or specify gitdir explicitly
const repo = await Repository.open({
  fs,
  gitdir: '/path/to/repo/.git'
})
```

### Using Repository Methods

```typescript
// Read repository state
const head = await repo.readHEAD()
const config = await repo.readConfig()
const index = await repo.readIndex()

// Write repository state
await repo.writeHEAD('ref: refs/heads/main')
await repo.writeConfig(config)
await repo.writeIndex(index)
```

## Instance Caching

`Repository` uses a two-level cache to ensure state consistency:

1. **First level**: Keyed by `FileSystemProvider` instance (ensures test isolation)
2. **Second level**: Keyed by normalized `gitdir` (ensures same repo = same instance)

**Why this matters:**
- When `add()` modifies `repo._index`, `status()` sees the same instance with the modified index
- Different filesystem instances get different Repository instances (test isolation)
- Same filesystem + same gitdir = same Repository instance (state consistency)

### Cache Behavior

```typescript
// Same instance (same fs + same gitdir)
const repo1 = await Repository.open({ fs, dir: '/path/to/repo' })
const repo2 = await Repository.open({ fs, dir: '/path/to/repo' })
console.log(repo1 === repo2) // true

// Different instance (different fs)
const fs2 = createFileSystem(/* different fs */)
const repo3 = await Repository.open({ fs: fs2, dir: '/path/to/repo' })
console.log(repo1 === repo3) // false
```

### Clearing the Cache

```typescript
// Clear all cached instances
Repository.clearInstanceCache()

// Or clear for a specific filesystem
Repository.clearInstanceCache(fs)
```

## Repository Properties

### Core Properties

```typescript
class Repository {
  readonly fs: FileSystemProvider              // Filesystem client
  readonly cache: Record<string, unknown>  // Cache object
  readonly instanceId: number         // Unique instance ID (for debugging)
  
  // Internal state (lazy-loaded)
  private _dir: string | null        // Working directory
  private _gitdir: string | null     // Git directory
  private _config: UnifiedConfigService | null
  private _index: GitIndex | null
  // ... more internal state
}
```

### Accessing Repository State

```typescript
// Get working directory
const dir = await repo.dir()

// Get git directory
const gitdir = await repo.gitdir()

// Check if bare repository
const isBare = await repo.isBare()

// Get object format (SHA-1 or SHA-256)
const format = await repo.objectFormat()
```

## Repository Methods

### Config Operations

```typescript
// Read config
const config = await repo.readConfig()

// Get config value
const value = await repo.getConfigValue('user.name')

// Set config value
await repo.setConfigValue('user.name', 'John Doe')

// Get all config values
const all = await repo.getConfigAll()
```

### Index Operations

```typescript
// Read index (staging area)
const index = await repo.readIndex()

// Write index
await repo.writeIndex(index)

// Index is cached in-memory for performance
// Modifications persist across operations
```

### Reference Operations

```typescript
// Read ref
const oid = await repo.readRef('refs/heads/main')

// Write ref (with reflog)
await repo.writeRefDirect('refs/heads/main', oid)

// Write symbolic ref
await repo.writeSymbolicRefDirect('HEAD', 'refs/heads/main')

// List refs
const refs = await repo.listRefs()
```

**Note**: Ref operations go through centralized functions in `src/git/refs/` to ensure reflog tracking and locking. See [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md).

### Object Operations

```typescript
// Read object
const object = await repo.readObject({ oid: 'abc123...' })

// Write object
const oid = await repo.writeObject({
  type: 'blob',
  content: UniversalBuffer.from('Hello, world!')
})
```

### Worktree Operations

```typescript
// Get worktree
const worktree = await repo.worktree()

// Worktree provides access to working directory operations
```

## Backend Integration

`Repository` can work with different backends:

```typescript
import { createBackend } from 'universal-git/backends'

const backend = createBackend({
  type: 'sqlite',
  dbPath: '/path/to/repo.db'
})

// Repository will use the backend for storage
// (Backend integration is in progress)
```

**Note**: Full backend integration is planned. Currently, `Repository` uses `FileSystemProvider` directly. See [Backend Integration Plan](../../plans/REPOSITORY_BACKEND_INTEGRATION_PLAN.md).

## Using Repository with Commands

Most commands accept a `Repository` instance:

```typescript
import { add, commit, status } from 'universal-git'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })

// Commands can use the repository for state management
await add({ fs, dir: '/path/to/repo', filepath: 'file.txt' })
await commit({ fs, dir: '/path/to/repo', message: 'Add file' })
await status({ fs, dir: '/path/to/repo' })
```

## Lazy Loading

Repository uses lazy loading for performance:

```typescript
// Config is loaded on first access
const config = await repo.readConfig() // Loads config

// Index is loaded on first access
const index = await repo.readIndex() // Loads index

// Worktree is loaded on first access
const worktree = await repo.worktree() // Loads worktree
```

## Error Handling

Repository methods handle errors gracefully:

```typescript
// Missing files return null or empty values
const config = await repo.readConfig() // Returns empty buffer if missing

// Errors are thrown for invalid operations
try {
  await repo.writeRefDirect('invalid/ref', oid)
} catch (error) {
  // Handle error
}
```

## Best Practices

### 1. Use Repository.open() for Automatic Setup

```typescript
// ✅ Good: Automatic setup
const repo = await Repository.open({ fs, dir: '/path/to/repo' })

// ❌ Avoid: Manual instantiation (unless needed)
const repo = new Repository(fs, dir, gitdir, cache)
```

### 2. Reuse Repository Instances

```typescript
// ✅ Good: Reuse instance
const repo = await Repository.open({ fs, dir: '/path/to/repo' })
await add({ fs, dir: '/path/to/repo', filepath: 'file1.txt' })
await add({ fs, dir: '/path/to/repo', filepath: 'file2.txt' })

// ❌ Avoid: Opening multiple times (though caching prevents this)
```

### 3. Clear Cache in Tests

```typescript
// ✅ Good: Clear cache for test isolation
beforeEach(() => {
  Repository.clearInstanceCache()
})
```

### 4. Use Direct Commands for One-Off Operations

```typescript
// ✅ Good: Direct command for one-off
await readObject({ fs, gitdir, oid: 'abc123...' })

// ✅ Also good: Repository for multiple operations
const repo = await Repository.open({ fs, dir })
const obj1 = await repo.readObject({ oid: 'abc123...' })
const obj2 = await repo.readObject({ oid: 'def456...' })
```

## See Also

- [Backends](./backends.md) - Backend storage systems
- [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) - How refs work
- [Cache Parameter](./cache.md) - Cache object usage
- [Factory Pattern](./factory-pattern.md) - Filesystem factory pattern

