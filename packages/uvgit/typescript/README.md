# uvgit TypeScript Implementation

This package implements Phase 1 of the uvgit architecture using the File System Access API.

## Phase 1: Read-Only Plumbing (The Foundation) ✅

This implementation provides:

1. **Ref Handles:** `GitRefHandle` and `VirtualRefHandle` for reading references
2. **Object Handles:** `GitLooseObjectHandle` for reading loose git objects
3. **Basic Provider:** `GitDirFsProvider` for filesystem navigation
4. **Goal:** Be able to run `git cat-file -p HEAD` (logic: resolve HEAD -> read Ref -> read Loose Object)

## Phase 2: Packing Support ✅

This implementation provides:

1. **Pack Handles:** `GitPackHandle` with random access reading (`readChunk` method)
2. **Index Parsing:** `GitPackIndexHandle` to parse `.idx` files
3. **Packed Objects:** `GitPackedObjectHandle` for reading objects from pack files
4. **Objects Provider:** `GitDirObjectsProvider` that checks both loose objects and pack indices
5. **Goal:** Read a repository that has been garbage collected (`git gc`)

## Phase 3: Writing & Staging ✅

This implementation provides:

1. **CAS Writing:** `GitDirObjectsProvider.write()` method that hashes and creates loose files
2. **Index Handle:** `GitIndexHandle` parser/serializer for `.git/index` file
3. **Ref Updates:** `GitRefHandle.updateOid()` and `updateSymbolicRef()` methods
4. **Object Writer Utilities:** Helper functions for writing git objects (blob, tree, commit, tag)
5. **Goal:** `git add .` and `git commit` (Create blobs, update index, write tree, write commit, update branch)

## Usage Example

```typescript
import { GitDir } from './GitDir';
import { GitDirFsProvider } from './providers/GitDirFsProvider';
import { GitRefHandle } from './handles/GitRefHandle';
import { GitLooseObjectHandle } from './handles/GitLooseObjectHandle';

// 1. Setup (Node environment example)
const adapter = require('native-file-system-adapter');
const fsRoot = await adapter.getOriginPrivateDirectory(); // or path-based in Node

const gitDir = new GitDir();
gitDir.mount(new GitDirFsProvider('', fsRoot)); // Mount root
await gitDir.init();

// 2. Navigate and read HEAD
const headHandle = await gitDir.resolve('HEAD');

if (headHandle && headHandle instanceof GitRefHandle) {
  // A. Standard API works
  const file = await headHandle.getFile();
  console.log('HEAD file size:', file.size);

  // B. Smart API works
  console.log('Current OID:', await headHandle.readOid());

  // C. Deep Linking works - resolve to the actual commit object
  const objectHandle = await headHandle.resolve();
  
  if (objectHandle && objectHandle instanceof GitLooseObjectHandle) {
    const parsed = await objectHandle.readParsed();
    console.log('Object type:', parsed.type);
    console.log('Object size:', parsed.size);
    console.log('Object content:', new TextDecoder().decode(parsed.content));
  }
}
```

## Architecture

- **Handles**: Smart wrappers around `FileSystemHandle` that add Git-specific methods
- **Providers**: Implementations that resolve paths within specific mount points
- **GitDir**: Main coordinator that manages multiple providers and handles path resolution

## Files Structure

```
typescript/
├── handles/
│   ├── GitBaseHandle.ts          # Base class for all handles
│   ├── GitRefHandle.ts           # Reference handle (refs/heads/main)
│   ├── VirtualRefHandle.ts       # Virtual ref handle (packed refs)
│   └── GitLooseObjectHandle.ts   # Loose object handle (objects/ab/cd...)
├── providers/
│   ├── GitDirProvider.ts         # Provider interface
│   └── GitDirFsProvider.ts       # Filesystem-based provider
├── GitDir.ts                     # Main coordinator class
├── index.ts                      # Public exports
├── package.json
├── tsconfig.json
└── README.md
```

## Phase 4: Composition (Virtualization) ✅

This implementation provides:

1. **Worktree Provider:** `GitDirWorktreeProvider` that combines Main Objects + Local Index/HEAD
2. **Namespace Provider:** `GitDirNamespaceProvider` for virtual ref remapping
3. **Provider Composition:** Enhanced GitDir with support for provider composition and routing
4. **Goal:** Advanced features like `git worktree add` and multi-tenant hosting logic

## All Phases Complete! 🎉

All four phases of the implementation are now complete:
- ✅ Phase 1: Read-Only Plumbing
- ✅ Phase 2: Packing Support
- ✅ Phase 3: Writing & Staging
- ✅ Phase 4: Composition (Virtualization)

## Usage for Writing Objects

```typescript
import { GitDir } from './GitDir';
import { GitDirObjectsProvider } from './providers/GitDirObjectsProvider';
import { GitIndexHandle } from './handles/GitIndexHandle';
import { GitRefHandle } from './handles/GitRefHandle';

const gitDir = new GitDir();
// ... setup providers ...

// Write a blob object
const objectsProvider = gitDir.providers.find(p => p instanceof GitDirObjectsProvider);
if (objectsProvider instanceof GitDirObjectsProvider) {
  const content = new TextEncoder().encode('Hello, World!');
  const oid = await objectsProvider.write('blob', content);
  console.log('Written blob:', oid);
}

// Update the index
const indexHandle = await gitDir.resolve('index');
if (indexHandle instanceof GitIndexHandle) {
  const entries = await indexHandle.parse();
  // Add or update entries
  entries.push({
    path: 'file.txt',
    oid: 'abc123...',
    mode: 0o100644, // Regular file
    ctimeSeconds: Math.floor(Date.now() / 1000),
    ctimeNanoseconds: 0,
    mtimeSeconds: Math.floor(Date.now() / 1000),
    mtimeNanoseconds: 0,
    dev: 0,
    ino: 0,
    uid: 0,
    gid: 0,
    size: 13,
  });
  await indexHandle.update(entries);
}

// Update a reference
const refHandle = await gitDir.resolve('refs/heads/main');
if (refHandle instanceof GitRefHandle) {
  await refHandle.updateOid('abc123...');
}
```

## Usage with Worktrees

```typescript
import { GitDir } from './GitDir';

// Main repository
const mainRepoDir = await getDirectoryHandle('.git');
const mainGitDir = await GitDir.fromDirectoryHandle(mainRepoDir);

// Worktree
const worktreeDir = await mainRepoDir.getDirectoryHandle('worktrees/feature-branch');
const worktreeGitDir = await GitDir.fromWorktree(
  worktreeDir,
  mainRepoDir,
  'feature-branch'
);

// Worktree has its own HEAD and index, but shares objects and refs
const worktreeHead = await worktreeGitDir.resolve('HEAD');
const worktreeIndex = await worktreeGitDir.resolve('index');
// Objects and refs come from main repo
const sharedObject = await worktreeGitDir.resolve('objects/ab/cdef...');
```

## Usage with Namespaces

```typescript
import { GitDir } from './GitDir';

// Base repository
const baseGitDir = await GitDir.fromDirectoryHandle(repoDir);

// Create a namespaced GitDir
const namespacedGitDir = GitDir.withNamespace(baseGitDir, 'team-a');

// References are automatically translated:
// Request: "refs/heads/main"
// Actual: "refs/namespaces/team-a/refs/heads/main"
const ref = await namespacedGitDir.resolve('refs/heads/main');
// This will look for refs/namespaces/team-a/refs/heads/main

// Objects are shared (no translation)
const object = await namespacedGitDir.resolve('objects/ab/cdef...');
// This looks in the normal objects/ directory
```

## Usage with Pack Files

```typescript
import { GitDir } from './GitDir';
import { GitDirFsProvider } from './providers/GitDirFsProvider';
import { GitDirObjectsProvider } from './providers/GitDirObjectsProvider';

const gitDir = new GitDir();

// Mount the root filesystem provider
const fsProvider = new GitDirFsProvider('', rootHandle);
gitDir.mount(fsProvider);

// Mount the objects provider (handles both loose and packed objects)
const objectsDir = await rootHandle.getDirectoryHandle('objects');
const objectsProvider = new GitDirObjectsProvider(objectsDir);
gitDir.mount(objectsProvider);

await gitDir.init();

// Resolve an object - will check loose first, then pack files
const objectHandle = await gitDir.resolve('objects/ab/cdef1234...');
if (objectHandle instanceof GitLooseObjectHandle) {
  const parsed = await objectHandle.readParsed();
  console.log('Loose object:', parsed.type);
} else if (objectHandle instanceof GitPackedObjectHandle) {
  const parsed = await objectHandle.readParsed();
  console.log('Packed object:', parsed.type);
}
```
