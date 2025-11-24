---
title: Architecture Migration Guide
sidebar_label: Architecture Migration
---

# Migrating from Managers to Git Directory Structure

This guide explains the architectural changes from the old manager-based structure to the new Git directory structure.

## Overview

Universal-git has migrated from a manager-based architecture to a structure that directly mirrors the `.git` directory. This makes the codebase more intuitive and easier to navigate.

## Old Structure (Deprecated)

### Manager Classes

The old structure used manager classes:

```
src/
├── managers/              # Manager classes (REMOVED)
│   ├── GitConfigManager.ts
│   ├── GitRefManager.ts
│   ├── GitIndexManager.ts
│   ├── GitStashManager.ts
│   └── GitShallowManager.ts
├── api/                   # API layer (REMOVED)
│   └── ...                # 70 command files
├── storage/               # Storage operations (REMOVED)
│   └── ...                # Object database
└── core-utils/
    └── odb/               # Object database (REMOVED)
        └── ...
```

### Manager Pattern

```typescript
// Old: Manager-based approach
import { GitConfigManager } from 'universal-git/internal-apis'

const manager = new GitConfigManager({ fs, gitdir })
const value = await manager.get('user.name')
await manager.set('user.name', 'John Doe')
```

## New Structure (Current)

### Git Directory Structure

The new structure mirrors `.git` directory:

```
src/
├── git/                   # Direct .git operations
│   ├── config.ts         # .git/config operations
│   ├── HEAD.ts           # .git/HEAD operations
│   ├── index/            # .git/index operations
│   │   ├── GitIndex.ts
│   │   ├── readIndex.ts
│   │   └── writeIndex.ts
│   ├── refs/             # .git/refs/ operations
│   │   ├── readRef.ts
│   │   ├── writeRef.ts
│   │   └── deleteRef.ts
│   ├── objects/          # .git/objects/ operations
│   │   ├── readObject.ts
│   │   ├── writeObject.ts
│   │   └── ...
│   └── ...
└── commands/             # High-level Git commands
    ├── clone.ts
    ├── fetch.ts
    └── ...
```

### Direct Function Pattern

```typescript
// New: Direct function approach
import { getConfig, setConfig } from 'universal-git'

const value = await getConfig({ fs, gitdir, path: 'user.name' })
await setConfig({ fs, gitdir, path: 'user.name', value: 'John Doe' })
```

## Migration Guide

### Config Operations

**Before (Manager):**
```typescript
import { GitConfigManager } from 'universal-git/internal-apis'

const manager = new GitConfigManager({ fs, gitdir })
const name = await manager.get('user.name')
await manager.set('user.name', 'John Doe')
```

**After (Direct Functions):**
```typescript
import { getConfig, setConfig } from 'universal-git'

const name = await getConfig({ fs, gitdir, path: 'user.name' })
await setConfig({ fs, gitdir, path: 'user.name', value: 'John Doe' })
```

### Ref Operations

**Before (Manager):**
```typescript
import { GitRefManager } from 'universal-git/internal-apis'

const manager = new GitRefManager({ fs, gitdir })
const oid = await manager.readRef('refs/heads/main')
await manager.writeRef('refs/heads/main', 'abc123...')
```

**After (Direct Functions):**
```typescript
import { resolveRef, writeRef } from 'universal-git'

const oid = await resolveRef({ fs, gitdir, ref: 'refs/heads/main' })
await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: 'abc123...' })
```

### Index Operations

**Before (Manager):**
```typescript
import { GitIndexManager } from 'universal-git/internal-apis'

const manager = new GitIndexManager({ fs, gitdir })
const index = await manager.readIndex()
index.add({ filepath: 'file.txt', oid: '...', mode: '100644' })
await manager.writeIndex(index)
```

**After (Repository):**
```typescript
import { Repository } from 'universal-git'

const repo = await Repository.open({ fs, dir, gitdir })
const index = await repo.readIndexDirect()
index.add({ filepath: 'file.txt', oid: '...', mode: '100644' })
await repo.writeIndexDirect(index)
```

## Key Changes

### 1. No More Managers

Managers have been removed and replaced with direct functions:

- `GitConfigManager` → `getConfig`, `setConfig` functions
- `GitRefManager` → `readRef`, `writeRef`, `deleteRef` functions
- `GitIndexManager` → `Repository.readIndexDirect/writeIndexDirect`
- `GitStashManager` → `stash` command functions
- `GitShallowManager` → `shallow` functions

### 2. Direct File Operations

Operations now directly work with `.git` files:

```typescript
// Old: Abstracted through managers
const manager = new GitConfigManager({ fs, gitdir })
await manager.set('user.name', 'John')

// New: Direct file operations
await setConfig({ fs, gitdir, path: 'user.name', value: 'John' })
// Directly writes to .git/config
```

### 3. Repository Class

The `Repository` class provides a unified interface:

```typescript
import { Repository } from 'universal-git'

const repo = await Repository.open({ fs, dir, gitdir })

// Repository provides access to all operations
const index = await repo.readIndexDirect()
const config = await repo.getConfig('user.name')
const oid = await repo.resolveRef('HEAD')
```

## Benefits

### 1. Intuitive Navigation

Want to work with the index? Look in `src/git/index/`:
- Matches `.git/index` file location
- Easy to find related code

### 2. Single Source of Truth

`.git/index` file is the source of truth:
- No abstraction layers
- Direct file operations
- Clear data flow

### 3. Less Abstraction

Direct operations instead of manager wrappers:
- Fewer layers
- Easier to understand
- Better performance

### 4. Easier Debugging

Can trace code to specific `.git` files:
- `src/git/index/` → `.git/index`
- `src/git/refs/` → `.git/refs/`
- `src/git/config.ts` → `.git/config`

## Backward Compatibility

### Internal APIs

Some manager classes were kept temporarily via `internal-apis.ts` for backward compatibility, but they are now **removed**. All code should use the new structure.

### Migration Path

1. **Update imports**: Replace manager imports with direct function imports
2. **Update calls**: Replace manager method calls with function calls
3. **Update types**: Replace manager types with function parameter types

## Examples

### Example 1: Reading Config

```typescript
// Old
import { GitConfigManager } from 'universal-git/internal-apis'
const manager = new GitConfigManager({ fs, gitdir })
const name = await manager.get('user.name')

// New
import { getConfig } from 'universal-git'
const name = await getConfig({ fs, gitdir, path: 'user.name' })
```

### Example 2: Writing Refs

```typescript
// Old
import { GitRefManager } from 'universal-git/internal-apis'
const manager = new GitRefManager({ fs, gitdir })
await manager.writeRef('refs/heads/main', oid)

// New
import { writeRef } from 'universal-git'
await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: oid })
```

### Example 3: Index Operations

```typescript
// Old
import { GitIndexManager } from 'universal-git/internal-apis'
const manager = new GitIndexManager({ fs, gitdir })
const index = await manager.readIndex()

// New
import { Repository } from 'universal-git'
const repo = await Repository.open({ fs, dir, gitdir })
const index = await repo.readIndexDirect()
```

## See Also

- [Architecture Documentation](../architecture.md) - Current architecture overview
- [Repository Documentation](../repository.md) - Repository class usage
- [Project State](../../plans/PROJECT_STATE.md) - Migration status





