# Factory Function Pattern

**Status**: ✅ **ACTIVE**  
**Purpose**: Document the factory function pattern for creating FileSystem instances  
**Related**: [Repository Unification Plan — DONE Archive](../plans/REPOSITORY_UNIFICATION_PLAN_DONE.md#refactoring-plan-archive-structural-typing--tests), [FileSystem Model](@awesome-os/universal-git-src/models/FileSystem.ts)

---

## Overview

The factory function pattern provides a clean, implementation-agnostic way to create FileSystem instances. Instead of directly instantiating the `FileSystem` class, consumers use the `createFileSystem` factory function.

## Why Use Factory Functions?

1. **Decouples consumers from implementation**: Consumers don't need to know about the `FileSystem` class
2. **Hides implementation details**: The factory is the only file that knows about the class
3. **Enables future flexibility**: Can swap implementations without breaking consumers
4. **Provides consistent API**: Single factory function for all filesystem creation

## Usage

### Basic Usage

```typescript
import * as fs from 'fs'
import { createFileSystem } from './utils/createFileSystem'

// Create a normalized FileSystem instance
const FileSystemProvider = createFileSystem(fs)

// Use with git commands
await git.init({ fs: FileSystemProvider, dir: '/path/to/repo' })
```

### With Callback-Based Filesystem

```typescript
import * as fs from 'fs'
import { createFileSystem } from './utils/createFileSystem'

// Works with callback-based fs (Node.js fs module)
const FileSystemProvider = createFileSystem(fs)
```

### With Promise-Based Filesystem

```typescript
import { promises as fs } from 'fs'
import { createFileSystem } from './utils/createFileSystem'

// Works with promise-based fs (fs.promises)
const FileSystemProvider = createFileSystem(fs)
```

### With Existing FileSystem Instance

```typescript
import { createFileSystem } from './utils/createFileSystem'

// If already a FileSystem instance, returns it directly
const fsClient1 = createFileSystem(someFs)
const fsClient2 = createFileSystem(fsClient1) // Returns same instance
```

## Implementation Details

The factory function:
- Ensures same raw fs object = same FileSystem instance (critical for Repository caching)
- Handles both callback and promise-based filesystems
- Returns existing FileSystem instances directly (no double-wrapping)
- Provides consistent caching behavior across the codebase

## Internal Usage

Within the codebase, `createFileSystem` is used in:
- `Repository.ts` - For normalizing filesystem instances
- Future command refactoring will use it throughout

## Benefits

1. **Type Safety**: TypeScript's structural typing ensures correct shape
2. **Consistency**: Consistent caching and normalization behavior
3. **Maintainability**: Single point of change for filesystem creation logic
4. **Testability**: Easy to mock or replace in tests

## Related Patterns

- **Capability Modules**: Low-level operations are stateless functions
- **Context Objects**: Repository provides unified access to all dependencies
- **Backend Factory Pattern**: `createBackend` for GitBackend instances (should use `createFileSystem` internally)
- See [Repository Unification Plan — DONE Archive](../plans/REPOSITORY_UNIFICATION_PLAN_DONE.md#refactoring-plan-archive-structural-typing--tests) for complete architectural patterns

---

## Backend Integration

The factory pattern extends to Git backend creation. The `createBackend` factory should normalize filesystem instances using `createFileSystem`:

```typescript
import { createBackend } from 'universal-git/backends'
import { createFileSystem } from 'universal-git/utils/createFileSystem'
import * as fs from 'fs'

// Create normalized FileSystem first
const FileSystemProvider = createFileSystem(fs)

// Create backend using factory (factory should normalize fs internally)
const backend = createBackend({
  type: 'filesystem',
  fs: FileSystemProvider,  // Can be RawFileSystemProvider or FileSystemProvider - factory normalizes it
  gitdir: '/path/to/.git',
})
```

**Note**: The factory pattern is now consistently implemented across FileSystem, GitBackend, and Repository. All factories normalize filesystem instances properly, ensuring consistent caching and behavior. The `createBackend` factory normalizes the `fs` parameter using `createFileSystem` before creating `FilesystemBackend` instances.

---

**Last Updated**: 2025-01-XX  
**Status**: ✅ **ACTIVE** - Factory pattern fully implemented and in use

