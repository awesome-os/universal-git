# Git Backend Implementations

This directory contains backend implementations for storing Git repository data. The `GitBackend` interface abstracts all storage operations, allowing you to use either a traditional filesystem-based backend or a SQLite-based backend.

## Backend Types

### FilesystemBackend

The `FilesystemBackend` stores all Git data using the traditional filesystem structure, compatible with standard Git repositories. This is the default backend and maintains full compatibility with native Git.

**Usage:**
```typescript
import { createBackend } from './backends/index.js'
import * as fs from 'fs'

// ✅ RECOMMENDED: Use factory (normalizes fs automatically)
const backend = createBackend({
  type: 'filesystem',
  fs,  // Can be RawFileSystemProvider or FileSystemProvider - factory normalizes it
  gitdir: '/path/to/.git'
})
await backend.initialize()
```

**Note**: While you can instantiate `FilesystemBackend` directly, using the `createBackend` factory is recommended as it ensures proper filesystem normalization and caching behavior. See [Factory Pattern](#backend-factory) section below.

### SQLiteBackend

The `SQLiteBackend` stores all Git data in a single SQLite database file. This provides:
- Single-file repository format (easy to backup/transfer)
- Atomic transactions
- Better performance for certain operations
- Cross-platform compatibility

**Usage:**
```typescript
import { SQLiteBackend } from './backends/index.js'
import Database from 'better-sqlite3'

// Option 1: Use better-sqlite3 (Node.js)
const backend = new SQLiteBackend('/path/to/repo.db')
await backend.initialize()

// Option 2: Provide your own SQLite module
const sqlite = require('better-sqlite3')
const backend = new SQLiteBackend('/path/to/repo.db', sqlite)
await backend.initialize()
```

## Backend Factory

Use the `createBackend` function to create backends dynamically. This is the **recommended** way to create backends as it ensures proper normalization and caching.

### Factory Pattern Benefits

The `createBackend` factory function:
- **Normalizes filesystem instances**: For `FilesystemBackend`, the factory automatically normalizes the `fs` parameter using `createFileSystem`, ensuring consistent caching behavior
- **Maintains caching**: Same raw filesystem object = same normalized `FileSystem` instance (critical for Repository instance caching)
- **Type flexibility**: Accepts both raw filesystem providers (callback or promise-based) and already-normalized `FileSystemProvider` instances
- **Consistent behavior**: All backends created through the factory follow the same patterns

### Usage

```typescript
import { createBackend } from './backends/index.js'
import { createFileSystem } from '../utils/createFileSystem.js'
import * as fs from 'fs'

// Filesystem backend - factory normalizes fs automatically
const fsBackend = createBackend({
  type: 'filesystem',
  fs: fs,  // Can be RawFileSystemProvider or FileSystemProvider - factory normalizes it
  gitdir: '/path/to/.git'
})

// Or normalize fs first (optional, factory does this anyway)
const normalizedFs = createFileSystem(fs)
const fsBackend2 = createBackend({
  type: 'filesystem',
  fs: normalizedFs,  // Already normalized, factory handles it correctly
  gitdir: '/path/to/.git'
})

// SQLite backend
const sqliteBackend = createBackend({
  type: 'sqlite',
  dbPath: '/path/to/repo.db',
  sqliteModule: mySqliteModule // optional
})

// In-memory backend
const inMemoryBackend = createBackend({
  type: 'in-memory',
})
```

### Direct Instantiation (Not Recommended)

While you can instantiate backends directly, it's **not recommended** because:
- Direct instantiation bypasses the factory's normalization logic
- May not maintain proper caching behavior
- Inconsistent with factory pattern principles

```typescript
// ❌ NOT RECOMMENDED: Direct instantiation
const backend = new FilesystemBackend(fs, gitdir)

// ✅ RECOMMENDED: Use factory
const backend = createBackend({
  type: 'filesystem',
  fs,
  gitdir,
})
```

**See**: [Factory Pattern Documentation](../../docs/factory-pattern.md) for more details.

## Complete Feature Coverage

Both backends implement the full `GitBackend` interface, covering:

### Core Metadata & Current State
- HEAD pointer
- Config file
- Index (staging area)
- Description
- State files (FETCH_HEAD, ORIG_HEAD, MERGE_HEAD, CHERRY_PICK_HEAD, REVERT_HEAD, BISECT_*)
- Sequencer files (for rebase/cherry-pick operations)

### Object Database (ODB)
- Loose objects (stored in `objects/[00-ff]/`)
- Packfiles (`.pack`, `.idx`, `.bitmap`)
- ODB info files (alternates, commit-graph, multi-pack-index, packs)

### References
- Loose refs (`refs/heads/`, `refs/tags/`, `refs/remotes/`, `refs/notes/`, `refs/replace/`)
- Packed refs (`packed-refs`)

### Reflogs
- Reflog files for HEAD and all refs (`logs/HEAD`, `logs/refs/heads/`, etc.)

### Info Files
- `info/exclude` (repository-specific gitignore)
- `info/attributes` (repository-specific gitattributes)
- `info/grafts` (legacy, replaced by `refs/replace/`)

### Hooks
- All hook files (`hooks/pre-commit`, `hooks/post-receive`, etc.)

### Advanced Features
- Submodules (`modules/`)
- Worktrees (`worktrees/`)
- Git LFS (`lfs/`)
- Shallow clones (`shallow`)
- Git daemon export (`git-daemon-export-ok`)

## Migration Between Backends

To migrate from filesystem to SQLite (or vice versa), you would need to:

1. Read all data from the source backend
2. Write all data to the target backend

Example migration utility (pseudo-code):
```typescript
async function migrateBackend(source: GitBackend, target: GitBackend) {
  // Migrate core metadata
  const head = await source.readHEAD()
  await target.writeHEAD(head)
  
  const config = await source.readConfig()
  await target.writeConfig(config)
  
  // ... migrate all other data
}
```

## Performance Considerations

### FilesystemBackend
- Fast for small repositories
- Native Git compatibility
- Can leverage OS-level caching
- Slower for large repositories with many files

### SQLiteBackend
- Better for large repositories (single file, indexed)
- Atomic transactions for complex operations
- Can be slower for very small repositories (overhead)
- Requires SQLite library

## Thread Safety

Both backends are designed to be thread-safe:
- **FilesystemBackend**: Relies on the underlying filesystem's atomic operations
- **SQLiteBackend**: Uses WAL mode for better concurrency

## Error Handling

Both backends handle missing files gracefully by returning `null` or empty buffers, consistent with Git's behavior.

