# Git Worktree Backend

**Status**: ✅ **Phase 1 Complete** - Interface and Filesystem implementation ready

## Overview

The `GitWorktreeBackend` interface abstracts storage operations for Git working directory files, allowing implementations using filesystem, blob storage, SQL, in-memory, or other storage mechanisms.

**Key Distinction**:
- **GitBackend**: Stores Git repository data (refs, objects, config, index, etc.) - located in `.git/`
- **GitWorktreeBackend**: Stores working directory files (actual project files) - located in the working tree

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Repository Class                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐      ┌──────────────────────┐  │
│  │   GitBackend     │      │  GitWorktreeBackend   │  │
│  │                  │      │                      │  │
│  │  - Refs          │      │  - Working dir files │  │
│  │  - Objects       │      │  - File operations   │  │
│  │  - Config        │      │  - Directory ops     │  │
│  │  - Index         │      │  - Metadata          │  │
│  │  - Reflogs       │      │                      │  │
│  │  - State files   │      │                      │  │
│  └──────────────────┘      └──────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Current Implementation

### ✅ FilesystemGitWorktreeBackend

**Status**: ✅ **Complete**

Default implementation that wraps `FileSystem` to provide the `GitWorktreeBackend` interface.

**Usage**:
```typescript
import { FileSystem } from '@awesome-os/universal-git/models'
import { FilesystemGitWorktreeBackend } from '@awesome-os/universal-git/backends/git-worktree'

const fs = new FileSystem(nodeFs)
const worktreeBackend = new FilesystemGitWorktreeBackend(fs, '/path/to/working/dir')
```

## Planned Implementations

### 📋 BlobStorageGitWorktreeBackend

Store Git worktree files in blob storage (S3, Azure Blob, GCS, etc.)

**Use Cases**:
- Cloud-based file storage
- Distributed working directories
- Large file handling

### 📋 SQLGitWorktreeBackend

Store Git worktree files in SQL database

**Use Cases**:
- Structured file storage
- Queryable file metadata
- Transactional file operations

### 📋 InMemoryGitWorktreeBackend

Store Git worktree files in memory

**Use Cases**:
- Fast tests
- Temporary operations
- In-memory processing

### 📋 IndexedDBGitWorktreeBackend (browser-only)

Store Git worktree files in browser IndexedDB

**Use Cases**:
- Browser-based applications
- Persistent browser storage
- Large file handling in browser

## Interface

The `GitWorktreeBackend` interface provides:

### File Operations
- `read(path, options?)` - Read file contents
- `write(path, data, options?)` - Write file contents
- `exists(path, options?)` - Check if file/directory exists

### Directory Operations
- `mkdir(path, options?)` - Create directory
- `readdir(path)` - Read directory contents
- `readdirDeep(path)` - Recursively read all files
- `rmdir(path, options?)` - Delete directory

### File Removal
- `rm(path, options?)` - Delete file or directory

### Metadata Operations
- `stat(path)` - Get file stats (follows symlinks)
- `lstat(path)` - Get file stats (doesn't follow symlinks)

### Symlink Operations
- `readlink(path, options?)` - Read symlink target
- `writelink(path, target)` - Create symlink

## Integration with Repository

The `Repository` class will be updated to use `GitWorktreeBackend` for all working directory operations:

```typescript
// Future API (Phase 2+)
const repo = await Repository.open({
  fs,
  dir,
  gitdir,
  backend: gitBackend,              // For Git repository data
  gitWorktreeBackend: worktreeBackend  // For working directory files
})
```

## Backward Compatibility

All existing code will continue to work. If `gitWorktreeBackend` is not provided, `FilesystemGitWorktreeBackend` will be auto-created from `fs`:

```typescript
// Existing code continues to work
const repo = await Repository.open({ fs, dir })
// Automatically creates FilesystemGitWorktreeBackend internally
```

## Related Documentation

- [Repository Backend Integration Plan](../../REPOSITORY_BACKEND_INTEGRATION_PLAN.md) - Full integration plan
- [TODO.md](../../TODO.md) - Task tracking
- [GitBackend README](../README.md) - Git repository backend documentation


