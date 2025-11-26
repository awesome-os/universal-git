---
title: Backends
sidebar_label: Backends
---

# Git Backends

Universal-git uses a backend abstraction system to store Git repository data. Backends separate Git data storage from the filesystem, enabling different storage mechanisms (filesystem, SQLite, in-memory, etc.) while maintaining the same API.

## What are Backends?

A **backend** is an implementation of the `GitBackend` interface that handles all storage operations for Git repository data:

- Objects (commits, trees, blobs, tags)
- References (branches, tags, remotes)
- Configuration files
- Index (staging area)
- Reflogs
- Hooks
- And more...

**Important**: Backends handle **Git repository data only** (stored in `.git/`). For working directory files, see [Git Worktree Backends](#git-worktree-backends).

## Available Backends

### FilesystemBackend (Default)

Stores Git data using the traditional filesystem structure, fully compatible with native Git repositories.

**Use when:**
- You need native Git compatibility
- Working with existing Git repositories
- Default choice for most use cases

**Example:**
```typescript
import { createBackend } from 'universal-git/backends'
import * as fs from 'fs'

const backend = createBackend({
  type: 'filesystem',
  fs,
  gitdir: '/path/to/.git'
})

await backend.initialize()
```

### SQLiteBackend

Stores all Git data in a single SQLite database file.

**Use when:**
- You want a single-file repository format
- You need atomic transactions
- Working with large repositories
- You need better performance for certain operations

**Example:**
```typescript
import { createBackend } from 'universal-git/backends'

const backend = createBackend({
  type: 'sqlite',
  dbPath: '/path/to/repo.db'
})

await backend.initialize()
```

**Benefits:**
- Single file (easy to backup/transfer)
- Atomic transactions
- Better performance for large repos
- Cross-platform compatibility

### InMemoryBackend

Stores all Git data in memory. Fast but non-persistent.

**Use when:**
- Writing tests (fast, isolated)
- Temporary operations
- You don't need persistence

**Example:**
```typescript
import { createBackend } from 'universal-git/backends'

const backend = createBackend({
  type: 'in-memory'
})

await backend.initialize()
```

**Benefits:**
- Very fast (no disk I/O)
- Perfect for testing
- No cleanup needed
- Isolated operations

**Limitations:**
- Data is lost when instance is destroyed
- Limited by available memory

## Creating Backends

### Using the Factory (Recommended)

The `createBackend` factory function is the recommended way to create backends:

```typescript
import { createBackend } from 'universal-git/backends'
import * as fs from 'fs'

// Filesystem backend
const fsBackend = createBackend({
  type: 'filesystem',
  fs,
  gitdir: '/path/to/.git'
})

// SQLite backend
const sqliteBackend = createBackend({
  type: 'sqlite',
  dbPath: '/path/to/repo.db'
})

// In-memory backend
const memoryBackend = createBackend({
  type: 'in-memory'
})
```

**Why use the factory?**
- Normalizes filesystem instances automatically
- Maintains proper caching behavior
- Ensures consistent initialization
- Type-safe options

### Direct Instantiation (Not Recommended)

While you can instantiate backends directly, it's not recommended:

```typescript
// ❌ Not recommended
import { FilesystemBackend } from 'universal-git/backends'
const backend = new FilesystemBackend(fs, gitdir)

// ✅ Recommended
import { createBackend } from 'universal-git/backends'
const backend = createBackend({
  type: 'filesystem',
  fs,
  gitdir
})
```

## Backend Interface

All backends implement the `GitBackend` interface, which provides methods for:

### Universal Methods

All backends provide universal interface methods that work regardless of implementation:

- `getFileSystem()` - Returns the filesystem instance if the backend uses a filesystem, or `null` if not
  - **Purpose**: Allows consumers to access the filesystem without knowing the backend implementation
  - **Filesystem backends**: Return the `FileSystemProvider` instance
  - **Non-filesystem backends**: Return `null`
  - **Example**:
    ```typescript
    const backend = createBackend({ type: 'filesystem', fs, gitdir })
    const fs = backend.getFileSystem() // Returns FileSystemProvider
    
    const sqliteBackend = createBackend({ type: 'sqlite', dbPath: '/path/to/repo.db' })
    const fs = sqliteBackend.getFileSystem() // Returns null
    ```

- `existsFile(path: string): Promise<boolean>` - Checks if a Git repository file exists
  - **Purpose**: Generic method to check file existence across all backend types
  - **Parameters**: `path` - File path relative to gitdir (e.g., `'index'`, `'config'`, `'HEAD'`)
  - **Returns**: `true` if the file exists, `false` otherwise
  - **Works with**: All backend types (filesystem, SQLite, in-memory, etc.)
  - **Example**:
    ```typescript
    const backend = createBackend({ type: 'filesystem', fs, gitdir })
    const indexExists = await backend.existsFile('index') // true if .git/index exists
    
    // Works with any backend type
    const sqliteBackend = createBackend({ type: 'sqlite', dbPath: '/path/to/repo.db' })
    const indexExists = await sqliteBackend.existsFile('index') // Checks database
    ```

- `hasConfig(): Promise<boolean>` - Checks if the repository config file exists
  - **Purpose**: Dedicated method to check if a repository is initialized (since `init` creates config)
  - **Returns**: `true` if config exists (repository is initialized), `false` otherwise (repository is not initialized)
  - **Works with**: All backend types (filesystem, SQLite, in-memory, etc.)
  - **Note**: If config doesn't exist, the repository is not initialized. Use this method instead of `existsFile('config')` when checking repository initialization status.
  - **Example**:
    ```typescript
    const backend = createBackend({ type: 'filesystem', fs, gitdir })
    const isInitialized = await backend.hasConfig() // true if repository is initialized
    
    if (!isInitialized) {
      // Repository is not initialized - need to run init first
      await backend.initialize()
    }
    
    // Works with any backend type
    const sqliteBackend = createBackend({ type: 'sqlite', dbPath: '/path/to/repo.db' })
    const isInitialized = await sqliteBackend.hasConfig() // Checks database
    ```

- `hasIndex(): Promise<boolean>` - Checks if the repository index file exists
  - **Purpose**: Dedicated method to check if a repository is instantiated (since `init` creates index)
  - **Returns**: `true` if index exists (repository is instantiated), `false` otherwise (repository is not instantiated)
  - **Works with**: All backend types (filesystem, SQLite, in-memory, etc.)
  - **Note**: If index doesn't exist, the repository is not instantiated. Use this method instead of `existsFile('index')` when checking repository instantiation status.
  - **Example**:
    ```typescript
    const backend = createBackend({ type: 'filesystem', fs, gitdir })
    const isInstantiated = await backend.hasIndex() // true if repository is instantiated
    
    if (!isInstantiated) {
      // Repository is not instantiated - need to run init first
      await backend.initialize()
    }
    
    // Works with any backend type
    const sqliteBackend = createBackend({ type: 'sqlite', dbPath: '/path/to/repo.db' })
    const isInstantiated = await sqliteBackend.hasIndex() // Checks database
    ```

### Core Metadata
- `readHEAD()` / `writeHEAD()` - HEAD pointer
- `readConfig()` / `writeConfig()` - Repository config
- `hasConfig()` - Check if repository config exists (indicates if repository is initialized)
- `readIndex()` / `writeIndex()` - Staging area
- `hasIndex()` - Check if repository index exists (indicates if repository is instantiated)
- `readDescription()` / `writeDescription()` - Repository description
- `existsFile(path: string)` - Check if a Git repository file exists (works across all backend types)

### Object Database
- `readLooseObject()` / `writeLooseObject()` - Loose objects
- `readPackfile()` / `writePackfile()` - Packfiles
- `readPackIndex()` / `writePackIndex()` - Pack indices
- `readPackBitmap()` / `writePackBitmap()` - Pack bitmaps
- `readMultiPackIndex()` / `writeMultiPackIndex()` - Multi-pack index

### References
- `readRef(ref: string, depth?: number, cache?: Record<string, unknown>): Promise<string | null>` - Read a ref (handles worktree context automatically)
- `writeRef(ref: string, value: string, skipReflog?: boolean, cache?: Record<string, unknown>): Promise<void>` - Write a ref (handles worktree context automatically)
- `writeSymbolicRef(ref: string, value: string, oldOid?: string, cache?: Record<string, unknown>): Promise<void>` - Write a symbolic ref (handles worktree context automatically)
- `readSymbolicRef(ref: string): Promise<string | null>` - Read a symbolic ref (handles worktree context automatically)
- `deleteRef(ref: string, cache?: Record<string, unknown>): Promise<void>` - Delete a ref (handles worktree context automatically)
- `listRefs(filepath: string): Promise<string[]>` - List refs in a directory

**Worktree Context Handling**: All ref operations automatically handle worktree context:
- **HEAD** and worktree-specific refs go to the worktree gitdir (`.git/worktrees/<name>/HEAD`)
- **Other refs** (branches, tags, etc.) go to the main gitdir (`.git/refs/heads/`, `.git/refs/tags/`, etc.)

**Note**: Backend ref methods internally use centralized functions in `src/git/refs/` to ensure reflog tracking and locking. The backend handles all details (fs, gitdir, objectFormat, worktree context) - you don't need to pass these parameters. See [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md).

### Reflogs
- `readReflog()` / `writeReflog()` - Reflog entries
- `listReflogs()` - List all reflogs

### Hooks
- `readHook()` / `writeHook()` - Git hooks
- `listHooks()` - List all hooks

### And More...
- State files (MERGE_HEAD, FETCH_HEAD, etc.)
- Sequencer files (rebase, cherry-pick state)
- Info files (exclude, attributes, grafts)
- Submodules
- Worktrees
- Git LFS files
- Shallow clone markers

## Using Backends with Commands

Most commands accept `gitBackend` and `worktree` parameters (new advanced API):

```typescript
import { commit } from 'universal-git'
import { createBackend } from 'universal-git/backends'
import { createGitWorktreeBackend } from 'universal-git/git/worktree'
import * as fs from 'fs'

// Create backends
const gitBackend = createBackend({
  type: 'sqlite',
  dbPath: '/path/to/repo.db'
})

const worktree = createGitWorktreeBackend({
  fs,
  dir: '/path/to/worktree'
})

// Use with commands
await commit({
  gitBackend,
  worktree,
  message: 'My commit'
})
```

**Note**: When `gitBackend` is provided, the `gitdir` parameter has no effect (gitdir is already set in the backend). Similarly, when `worktree` is provided, the `dir` parameter has no effect (dir is already set in the worktree backend).

### Legacy API (Auto-creates Backends)

For backward compatibility, commands still accept the legacy `fs`/`gitdir`/`dir` parameters. These are automatically converted to backends internally:

```typescript
// Legacy API - backends are auto-created internally
await commit({
  fs,
  dir: '/path/to/repo',
  message: 'My commit'
})
```

**Deprecation**: The `gitdir` and `dir` parameters are deprecated. Use `gitBackend` and `worktree` instead for better control and consistency.

## Backend Registry

You can register custom backends using the `BackendRegistry`:

```typescript
import { BackendRegistry } from 'universal-git/backends'

// Register a custom backend
BackendRegistry.register('my-backend', (options) => {
  return new MyCustomBackend(options)
})

// Use it
const backend = createBackend({
  type: 'my-backend',
  // ... custom options
})
```

## Git Worktree Backends

**Note**: Git worktree backends are separate from Git backends. They handle working directory files, not Git repository data.

Like `GitBackend`, `GitWorktreeBackend` also provides universal interface methods:

- `getFileSystem()` - Returns the filesystem instance if the backend uses a filesystem, or `null` if not
  - **Purpose**: Allows consumers to access the filesystem without knowing the backend implementation
  - **Filesystem backends**: Return the `FileSystemProvider` instance
  - **Non-filesystem backends**: Return `null`

For information about Git worktree backends, see the [Backend Integration Plan](../../plans/REPOSITORY_BACKEND_INTEGRATION_PLAN.md).

## Performance Comparison

| Backend | Persistence | Speed | Size Limit | Best For |
|---------|------------|-------|------------|----------|
| Filesystem | ✅ Persistent | Fast (small repos) | OS limit | Default, native Git compatibility |
| SQLite | ✅ Persistent | Fast (large repos) | ~140TB | Large repos, single-file format |
| In-Memory | ❌ Non-persistent | Very fast | RAM limit | Testing, temporary operations |

## Error Handling

All backends handle missing files gracefully:
- Return `null` for missing files (when appropriate)
- Return empty buffers for missing binary data
- Consistent with Git's behavior

## Thread Safety

- **FilesystemBackend**: Relies on filesystem atomic operations
- **SQLiteBackend**: Uses WAL mode for better concurrency
- **InMemoryBackend**: Single-threaded (JavaScript is single-threaded)

## Migration Between Backends

To migrate between backends, you need to copy all data:

```typescript
async function migrateBackend(source: GitBackend, target: GitBackend) {
  // Migrate core metadata
  const head = await source.readHEAD()
  await target.writeHEAD(head)
  
  const config = await source.readConfig()
  await target.writeConfig(config)
  
  // Migrate objects
  const objects = await source.listObjects()
  for (const oid of objects) {
    const object = await source.readLooseObject(oid)
    if (object) {
      await target.writeLooseObject(oid, object)
    }
  }
  
  // ... migrate all other data
}
```

## See Also

- [Repository Class](./repository.md) - Using backends with Repository
- [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) - How refs work with backends
- [Factory Pattern](./factory-pattern.md) - Filesystem factory pattern

