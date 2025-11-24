---
title: Architecture
sidebar_label: Architecture
---

# Architecture

Universal-git's codebase is organized to mirror the actual `.git` directory structure. This design makes the codebase intuitive, maintainable, and easy to navigate.

## Why Match `.git` Directory Structure?

The code structure directly mirrors the `.git` directory structure for several key reasons:

1. **Intuitive Navigation**: Want to work with the index? Look in `src/git/index/`. Need to read refs? Check `src/git/refs/`.
2. **Single Source of Truth**: The `.git/index` file is the source of truth, and the code that reads/writes it is right there.
3. **Less Abstraction**: Direct file operations with minimal indirection make the code easier to understand.
4. **Easier Debugging**: You can trace code directly to specific `.git` files.
5. **Better Maintainability**: The structure matches Git's actual organization, making it familiar to Git users.

## Directory Structure

### High-Level Organization

```
src/
├── commands/          # High-level Git commands (public API)
├── git/              # Direct .git directory operations
├── core-utils/       # Low-level utilities (some deprecated)
├── models/           # Data structures and parsers
├── backends/         # Storage backend implementations
├── errors/           # Error classes
├── utils/            # Utility functions
└── wire/             # Git wire protocol implementations
```

### Commands Layer (`src/commands/`)

The **commands layer** provides the public API for Git operations. These are high-level functions that users call directly:

- `add.ts` - Stage files
- `commit.ts` - Create commits
- `checkout.ts` - Checkout branches/files
- `merge.ts` - Merge branches
- `clone.ts` - Clone repositories
- And 65+ more commands...

**Example:**
```typescript
import { add, commit } from 'universal-git'

await add({ fs, dir, filepath: 'file.txt' })
await commit({ fs, dir, message: 'Add file' })
```

### Git Operations Layer (`src/git/`)

The **git operations layer** contains direct operations on `.git` directory files. This layer mirrors the actual `.git` directory structure:

```
src/git/
├── HEAD.ts              # .git/HEAD operations
├── config.ts            # .git/config operations
├── shallow.ts           # .git/shallow operations
├── index/               # .git/index (staging area)
│   ├── GitIndex.ts      # Index model/parser
│   ├── readIndex.ts     # Read index from disk
│   └── writeIndex.ts    # Write index to disk
├── objects/             # .git/objects/ (object database)
│   ├── loose/           # Loose object operations
│   ├── pack/            # Packfile operations
│   └── info/            # ODB metadata (alternates, etc.)
├── refs/                # .git/refs/ (references) ✅ MIGRATED
│   ├── readRef.ts       # Read and resolve refs
│   ├── writeRef.ts      # Write refs (with reflog)
│   ├── listRefs.ts      # List refs
│   ├── deleteRef.ts     # Delete refs
│   └── notes/           # Git notes operations
├── logs/                # .git/logs/ (reflogs)
│   ├── logRefUpdate.ts  # Create reflog entries
│   ├── readLog.ts       # Read reflog
│   └── writeLog.ts      # Write reflog
├── info/                # .git/info/ (local overrides)
│   └── isIgnored.ts     # Check if file is ignored
├── hooks/               # .git/hooks/ (git hooks)
├── state/               # Temporary state files
│   ├── FETCH_HEAD.ts    # Fetch state
│   ├── MERGE_HEAD.ts    # Merge state
│   └── sequencer/       # Rebase/cherry-pick state
├── bundle/              # Git bundle format
├── lfs/                 # Git LFS operations
├── remote/              # Remote operations
└── forge/               # Git forge adapters (GitHub, GitLab, etc.)
```

**Example:**
```typescript
import { readRef, writeRef } from 'universal-git/git/refs'

// Read a ref
const oid = await readRef({ fs, gitdir, ref: 'refs/heads/main' })

// Write a ref (with automatic reflog)
await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: oid })
```

### Core Utils Layer (`src/core-utils/`)

The **core utils layer** contains low-level utilities and algorithms:

- `Repository.ts` - Repository context object
- `MergeStream.ts` - Merge operation stream
- `algorithms/` - Merge, diff, and other algorithms
- `parsers/` - Various parsers
- `filesystem/` - Filesystem utilities

**Note**: Some parts of this layer are deprecated in favor of `src/git/` functions.

### Models Layer (`src/models/`)

The **models layer** contains data structures and parsers:

- `GitIndex.ts` - Index file parser
- `GitCommit.ts` - Commit object parser
- `GitTree.ts` - Tree object parser
- `GitConfig.ts` - Config file parser
- `GitPackIndex.ts` - Pack index parser
- And more...

### Backends Layer (`src/backends/`)

The **backends layer** provides storage abstractions:

- `GitBackend.ts` - Backend interface
- `FilesystemBackend.ts` - Filesystem implementation
- `SQLiteBackend.ts` - SQLite implementation
- `InMemoryBackend.ts` - In-memory implementation

See [Backends](./backends.md) for more information.

## Mapping: Code to `.git` Directory

| `.git` File/Directory | Code Location |
|----------------------|----------------|
| `.git/HEAD` | `src/git/HEAD.ts` |
| `.git/config` | `src/git/config.ts` |
| `.git/index` | `src/git/index/` |
| `.git/objects/` | `src/git/objects/` |
| `.git/refs/` | `src/git/refs/` |
| `.git/logs/` | `src/git/logs/` |
| `.git/info/` | `src/git/info/` |
| `.git/hooks/` | `src/git/hooks/` |
| `.git/state/` | `src/git/state/` |
| `.git/shallow` | `src/git/shallow.ts` |

## How Commands Use Git Operations

Commands typically use git operations like this:

```typescript
// src/commands/commit.ts
import { writeCommit } from '../git/objects/writeCommit.ts'
import { writeRef } from '../git/refs/writeRef.ts'
import { readIndex } from '../git/index/readIndex.ts'

export async function commit({ fs, dir, gitdir, message, ... }) {
  // 1. Read the index
  const index = await readIndex({ fs, gitdir })
  
  // 2. Write the commit object
  const oid = await writeCommit({ fs, gitdir, tree: index.tree, message, ... })
  
  // 3. Update the ref (with automatic reflog)
  await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: oid })
  
  return oid
}
```

## Migration Status

The codebase has been migrated from an older structure to match the `.git` directory:

### ✅ Completed Migrations

- **Index operations** → `src/git/index/`
- **Refs operations** → `src/git/refs/`
- **Object database** → `src/git/objects/`
- **Configuration** → `src/git/config.ts`
- **Shallow operations** → `src/git/shallow.ts`
- **API layer** → `src/commands/`
- **Reflogs** → `src/git/logs/`
- **Hooks** → `src/git/hooks/`
- **State files** → `src/git/state/`

### Removed Directories

- ~~`src/api/`~~ → Migrated to `src/commands/`
- ~~`src/managers/`~~ → Migrated to `src/git/`
- ~~`src/storage/`~~ → Migrated to `src/git/objects/`
- ~~`src/core-utils/odb/`~~ → Migrated to `src/git/objects/`

## Principles

### 1. Single Source of Truth

The `.git` directory files are the source of truth. Code reads and writes directly to these files.

### 2. Direct Operations

Functions in `src/git/` perform direct file operations with minimal abstraction.

### 3. Centralized Ref Operations

All ref operations go through `src/git/refs/` functions to ensure:
- Reflog entries are created
- File locking prevents concurrent writes
- Validation occurs before writing

See [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) for details.

### 4. Backend Abstraction

Backends abstract storage, but ref operations still go through centralized functions. See [Backends](./backends.md) for details.

## Finding Code

### "Where is the code that reads the index?"

Look in `src/git/index/readIndex.ts`

### "Where is the code that writes refs?"

Look in `src/git/refs/writeRef.ts`

### "Where is the code that reads commits?"

Look in `src/git/objects/readCommit.ts` or `src/commands/readCommit.ts`

### "Where is the merge logic?"

Look in `src/commands/merge.ts` (high-level) and `src/core-utils/MergeStream.ts` (low-level)

### "Where is the clone command?"

Look in `src/commands/clone.ts`

## Benefits of This Structure

1. **Familiar to Git Users**: If you know Git's structure, you know where to find code
2. **Easy to Navigate**: Want index code? Look in `src/git/index/`
3. **Clear Responsibilities**: Each directory has a clear purpose
4. **Less Indirection**: Direct file operations are easier to understand
5. **Better Debugging**: Can trace code to specific `.git` files
6. **Maintainable**: Structure matches Git's organization

## See Also

- [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) - How refs work
- [Backends](./backends.md) - Storage backends
- [Repository Class](./repository.md) - Repository context
- [dir vs gitdir](./dir-vs-gitdir.md) - Working tree vs git directory

