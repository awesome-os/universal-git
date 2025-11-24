# Git Directory Operations

This directory contains direct operations on `.git` directory files and subdirectories.

## Structure

The structure mirrors the actual `.git` directory structure:

```
src/git/
├── HEAD.ts              # .git/HEAD operations
├── config.ts            # .git/config operations
├── index/               # .git/index (staging area)
│   ├── readIndex.ts     # Read index from disk
│   ├── writeIndex.ts    # Write index to disk
│   └── extensions/      # Index extensions (UNTR, FSMN)
├── objects/             # .git/objects/ (object database)
│   ├── loose/           # Loose objects
│   ├── pack/            # Packfiles
│   └── info/            # ODB metadata
├── refs/                # .git/refs/ (references) ✅ MIGRATED
│   ├── readRef.ts       # Read and resolve refs
│   ├── writeRef.ts      # Write refs (direct and symbolic)
│   ├── listRefs.ts      # List refs matching prefix
│   ├── deleteRef.ts     # Delete refs
│   └── index.ts         # Export file
│   └── notes/           # Git notes operations
├── logs/                # .git/logs/ (reflogs)
├── info/                # .git/info/ (local overrides)
├── hooks/               # .git/hooks/ (git hooks)
├── state/                # Temporary state files
│   ├── FETCH_HEAD.ts
│   ├── MERGE_HEAD.ts
│   └── sequencer/       # Rebase/cherry-pick state
├── modules/             # .git/modules/ (submodules)
├── worktrees/           # .git/worktrees/ (linked worktrees)
├── lfs/                 # .git/lfs/ (Git LFS)
└── shallow.ts           # .git/shallow (shallow clone)

```

## Principles

1. **Single Source of Truth**: The `.git` directory files are the source of truth
2. **Direct Operations**: Functions read/write directly to `.git` files
3. **Simple Caching**: Optional cache based on file modification time
4. **No Coordination**: No complex state management - just file operations
5. **Matches Git**: Structure matches actual `.git` directory

## Usage

```typescript
import { readIndex, writeIndex } from './git/index/index.ts'

// Read index
const index = await readIndex({ fs, gitdir, cache })

// Modify index
index.insert({ filepath: 'test.txt', oid: '...', stats: {...} })

// Write index
await writeIndex({ fs, gitdir, index, cache })
```

## Migration Status

**Core Operations**: ✅ **COMPLETE**
- Refs operations (`readRef`, `writeRef`, `listRefs`, `deleteRef`) fully migrated
- Reflog operations (`readLog`, `writeLog`, `logRefUpdate`) fully migrated
- Index operations (`readIndex`, `writeIndex`) fully migrated
- Config operations (`getConfig`, `setConfig`) fully migrated

**Remaining Work**: See [TODO.md](../TODO.md) "Migration Work" section for remaining migration tasks.

