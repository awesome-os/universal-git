---
title: Repository Class
sidebar_label: Repository
---

# Repository Class

The `Repository` class is a **thin wrapper** around `GitBackend` and multiple `WorktreeBackend` instances. It provides caching, state management, and a unified interface for all Git operations.

## What is Repository?

`Repository` is a thin wrapper that delegates to:
- **1 `GitBackend`** (always present) - handles all Git repository data (objects, refs, config, index, etc.)
  - For bare repositories: only `GitBackend` is present
  - For remote repositories: `GitBackend` handles remote operations
- **Multiple linked worktree checkouts** (optional) - each with its own `WorktreeBackend` instance
  - Main worktree: optional, has its own `WorktreeBackend`
  - Linked worktrees: each has its own `WorktreeBackend` instance
  - `WorktreeBackend` type can be specified on checkout (filesystem, memory, S3, etc.)

**Key Principle**: `Repository` is a thin wrapper - it doesn't implement Git operations itself, but delegates to backends. This enables:
- Backend-agnostic operations (work with any storage backend)
- Multiple worktrees with different backend types
- Consistent API regardless of backend implementation

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

#### Using Backends (New Advanced API - Recommended)

```typescript
import { Repository } from 'universal-git'
import { createBackend } from 'universal-git/backends'
import { createGitWorktreeBackend } from 'universal-git/git/worktree'
import * as fs from 'fs'

// Create backends
const gitBackend = createBackend({
  type: 'filesystem',
  fs,
  gitdir: '/path/to/repo/.git'
})

const worktree = createGitWorktreeBackend({
  fs,
  dir: '/path/to/repo'
})

// Open repository with backends
const repo = await Repository.open({
  gitBackend,
  worktree,
  cache: {}
})
```

**Note**: When `gitBackend` is provided, the `gitdir` parameter has no effect (gitdir is already set in the backend). When `worktree` is provided, the `dir` parameter has no effect (dir is already set in the worktree backend).

#### Using Legacy Parameters (Backward Compatible)

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

**Deprecation**: The `gitdir` and `dir` parameters are deprecated. Use `gitBackend` and `worktree` instead for better control and consistency.

#### Linked Worktree Pattern

When both `dir` and `gitdir` are provided, `Repository.open()` treats this as a **linked worktree** scenario:

- **`gitdir`** === bare repository (or main repository)
- **`dir`** === linked worktree checkout

This matches Git's standard worktree pattern where:
- The worktree's `.git` is a **file** (not a directory) pointing to the gitdir
- The gitdir contains the repository data (objects, refs, config, etc.)
- The dir contains the working directory files

**Important**: All implementations must pass the path to the `.git` directory (which needs to be treated as bare) when both `dir` and `gitdir` are provided. No inference is performed - the provided parameters are trusted.

```typescript
// Linked worktree scenario
const repo = await Repository.open({
  fs,
  dir: '/path/to/worktree',           // Worktree checkout directory
  gitdir: '/path/to/bare-repo/.git', // Bare repository gitdir
  cache: {},
})

// The Repository will:
// - Use dir as the working directory
// - Use gitdir as the repository gitdir (treated as bare)
// - No inference or path resolution is performed
```

**Behavior when only one parameter is provided:**

- **Only `gitdir`**: 
  - If gitdir has a `config` file directly → treated as bare repository (workingDir = null)
  - If gitdir doesn't have a `config` file → treated as `.git` subdirectory (workingDir = parent of gitdir)

- **Only `dir`**: 
  - Finds `.git` directory by walking up from dir
  - If dir itself has `config` file → treated as bare repository
  - Otherwise → finds `.git` subdirectory and uses parent as workingDir

### Initializing a New Repository

You can initialize a new repository directly when opening it:

```typescript
// Initialize a new repository
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  init: true,              // Initialize repository
  bare: false,             // Non-bare repository (default)
  defaultBranch: 'main',   // Default branch name (default: 'master')
  objectFormat: 'sha1'     // Object format: 'sha1' or 'sha256' (default: 'sha1')
})

// Repository is now initialized and ready to use
await add({ repo, filepath: 'README.md' })
```

**Initialization Options:**
- `init: true` - Initialize the repository if it doesn't exist
- `bare: false` - Create a non-bare repository (default). Set to `true` for bare repositories
- `defaultBranch: 'main'` - Default branch name (default: `'master'`)
- `objectFormat: 'sha1'` - Object format: `'sha1'` or `'sha256'` (default: `'sha1'`)

**Note**: Initialization is handled by the backend. If a `gitBackend` is provided, it will be used for initialization. Otherwise, a `FilesystemBackend` will be created automatically.

### Configuration Options

`Repository.open()` supports several configuration options:

```typescript
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  
  // Cache object for performance
  cache: {},
  
  // Auto-detect system and global git config (default: true)
  autoDetectConfig: true,
  
  // Ignore system and global config (only use local repo config)
  // When true, skips auto-detection but still respects explicitly provided paths
  ignoreSystemConfig: false,
  
  // Explicitly provide system config path
  systemConfigPath: '/etc/gitconfig',
  
  // Explicitly provide global config path
  globalConfigPath: '~/.gitconfig'
})
```

#### Config Path Behavior

The configuration system follows Git's precedence: **worktree > local > global > system**

- **`autoDetectConfig: true`** (default): Automatically detects system and global config paths from environment variables and platform defaults
- **`ignoreSystemConfig: true`**: Skips auto-detection of system/global config, but still uses explicitly provided `systemConfigPath` and `globalConfigPath` if specified
- **Explicit paths**: Always take precedence over auto-detection

**Examples:**

```typescript
// Default: Auto-detect system/global config
const repo1 = await Repository.open({ fs, dir: '/path/to/repo' })

// Ignore system/global config (only local repo config)
const repo2 = await Repository.open({ 
  fs, 
  dir: '/path/to/repo',
  ignoreSystemConfig: true 
})

// Use custom system config path (even with ignoreSystemConfig: true)
const repo3 = await Repository.open({ 
  fs, 
  dir: '/path/to/repo',
  ignoreSystemConfig: true,
  systemConfigPath: '/custom/system/config' // Still used
})

// Disable auto-detection but allow explicit paths
const repo4 = await Repository.open({ 
  fs, 
  dir: '/path/to/repo',
  autoDetectConfig: false,
  globalConfigPath: '~/.gitconfig' // Explicitly provided
})
```

**Use Cases:**

- **Testing**: Use `ignoreSystemConfig: true` to ensure tests only read from local repository config, avoiding interference from system/global git config
- **Isolated environments**: When you want to ensure only repository-specific configuration is used
- **Custom config paths**: When you need to use non-standard config file locations

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

**Note**: Ref operations are handled by `GitBackend` methods, which internally use centralized functions in `src/git/refs/` to ensure reflog tracking and locking. The backend automatically handles worktree context (HEAD goes to worktree gitdir, other refs go to main gitdir). See [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md).

**Backend Integration**: `Repository.writeRefDirect()` and other ref methods simply call `gitBackend.writeRef()` - the backend handles all details internally (fs, gitdir, objectFormat, worktree context, etc.). You don't need to pass these parameters.

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
// Get main worktree
const worktree = repo.worktree

// Create a new linked worktree with a specific backend type
const newWorktree = await repo.createWorktree(
  '/path/to/new/worktree',
  'feature-branch',
  'feature-worktree',
  {
    worktreeBackendFactory: (dir) => {
      // Create a custom backend for this worktree
      return new GitWorktreeS3(s3Client, bucket, `${prefix}/${dir}`)
    }
  }
)

// Get worktree by name
const worktreeByName = repo.getWorktreeByName('feature-worktree')

// Get worktree by the ref it's checked out to
const worktreeByRef = await repo.getWorktree('feature-branch')
// Searches all worktrees (main + linked) to find which one has 'feature-branch' checked out

// Get worktree by directory path
const worktreeByPath = repo.getWorktreeByPath('/path/to/worktree')

// List all worktrees
const allWorktrees = repo.listWorktrees()
// Or use the property getter
const worktrees = repo.worktrees

// Worktree provides access to working directory operations
```

**Multiple Worktrees**: `Repository` can manage multiple worktrees simultaneously. Each worktree has its own `WorktreeBackend` instance, allowing different storage backends for different worktrees.

#### Worktree Access Methods

`Repository` provides several methods to access and manage worktrees:

- **`getWorktree()`** - Returns the main worktree (or `null` for bare repositories)
- **`getWorktree(ref: string)`** - Finds which worktree is checked out to a specific ref (branch, tag, or commit SHA). Searches all worktrees (main + linked).
- **`getWorktreeByName(name: string)`** - Gets a linked worktree by its name (returns `null` if not found)
- **`getWorktreeByPath(dir: string)`** - Gets a worktree by its directory path (returns `null` if not found)
- **`listWorktrees()`** - Returns an array of all worktrees (main + linked)
- **`worktrees`** - Property getter that returns all worktrees as an array
- **`createWorktree(dir, ref, name?, options?)`** - Creates a new linked worktree

**Example: Finding a worktree by ref**

```typescript
// Find which worktree has 'feature-branch' checked out
const featureWorktree = await repo.getWorktree('feature-branch')
if (featureWorktree) {
  console.log(`Found worktree at: ${featureWorktree.dir}`)
} else {
  console.log('No worktree is checked out to feature-branch')
}
```

**Example: Iterating over all worktrees**

```typescript
// Get all worktrees
const allWorktrees = repo.worktrees

for (const worktree of allWorktrees) {
  const name = worktree.getName() || 'main'
  const gitdir = await worktree.getGitdir()
  console.log(`Worktree: ${name}, Dir: ${worktree.dir}, Gitdir: ${gitdir}`)
}
```

### Remote Operations

`Repository` is the central place for remote backend management. Each remote configured in `.git/config` (via `remote.<name>.url`) is represented as a `GitRemoteBackend` instance, cached per Repository instance.

```typescript
// Get a remote backend for a configured remote
const originBackend = await repo.getRemote('origin')

// Discover remote references
const remoteRefs = await originBackend.discover({
  service: 'git-upload-pack',
  url: 'https://github.com/user/repo.git',
  http: httpClient
})

// List all configured remotes with their backends
const remotes = await repo.listRemotes()
for (const { name, backend } of remotes) {
  console.log(`Remote ${name}: ${backend.baseUrl}`)
}

// Invalidate remote cache when remotes change
repo.invalidateRemoteCache()
```

**Remote Backend Options**: You can provide protocol-specific clients when getting a remote:

```typescript
import { http } from 'universal-git/http/web'
import { ssh } from 'universal-git/ssh'

// Get remote with HTTP client
const httpRemote = await repo.getRemote('origin', {
  http: httpClient
})

// Get remote with SSH client
const sshRemote = await repo.getRemote('upstream', {
  ssh: sshClient
})

// Get remote with REST API support (for GitHub, GitLab, etc.)
const apiRemote = await repo.getRemote('origin', {
  http: httpClient,
  useRestApi: true
})
```

**URL-Indexed Architecture**:

The `RemoteBackendRegistry` uses URL-indexed caching, enabling easy bidirectional translation:

- **Config → Backend**: `repo.getRemote(name)` reads URL from config (`remote.<name>.url`), then looks up or creates backend via `RemoteBackendRegistry.getBackend(url)`
- **Backend → Config**: Get URL from backend via `backend.getUrl()`, then find config entry by iterating remotes and comparing URLs

The registry caches backends globally by normalized URL, so multiple remotes with the same URL share the same backend instance. Repository caches backends per remote name for quick lookup.

```typescript
// Example: Config → Backend translation
const config = await repo.getConfig()
const url = await config.get('remote.origin.url') // Read from config
const backend = await repo.getRemote('origin') // Look up backend by URL

// Example: Backend → Config translation
const backend = await repo.getRemote('origin')
const backendUrl = backend.getUrl() // Get URL from backend
// Find config entry: iterate remotes and compare URLs
const remoteNames = await config.getSubsections('remote')
for (const name of remoteNames) {
  const configUrl = await config.get(`remote.${name}.url`)
  if (configUrl === backendUrl) {
    console.log(`Remote '${name}' uses this backend`)
  }
}
```

**Benefits**:
- **Config-Driven**: Remotes are automatically discovered from `.git/config`
- **Caching**: Remote backends are cached per Repository instance (by name) and globally (by URL)
- **Unified API**: `repo.getRemote('origin')` returns a `GitRemoteBackend` instance
- **Registry Integration**: Uses `RemoteBackendRegistry` for protocol detection and backend creation
- **URL-Indexed**: Easy translation between config entries and backend instances
- **Shared Instances**: Multiple remotes with same URL share backend instance

**Note**: The remote backend cache is per-Repository instance (by name). The `RemoteBackendRegistry` also maintains a global cache (by URL). If you modify remotes via config (e.g., using `addRemote` or `deleteRemote`), call `repo.invalidateRemoteCache()` to refresh the per-Repository cache.

## Backend Integration

`Repository` can work with different backends using the new backend-first API:

```typescript
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

// Open repository with backends
const repo = await Repository.open({
  gitBackend,
  worktree,
  cache: {}
})
```

**Universal Backend Methods**: All backends provide universal interface methods that work regardless of implementation:
- `getFileSystem()` - Returns the filesystem instance if available, or `null` if not
- This allows consumers to access the filesystem without knowing the backend implementation

**Note**: `Repository.open()` now accepts `gitBackend` and `worktree` parameters. The `fs` parameter is derived from backends automatically when using filesystem backends. See [Backends Documentation](./backends.md) for more details.

## Using Repository with Commands

### Repository as Command Interface

All Git commands are exposed directly on the `Repository` class, providing a Git-like API based on the current working directory context. This pattern allows you to work with Git repositories in a way that mirrors the command-line Git experience.

#### Basic Pattern

```typescript
// Open or initialize a repository
const repo = await Repository.open({ fs, dir: '/path/to/repo' })

// All commands are available directly on the Repository instance
await repo.init()                    // Initialize repository
await repo.add('file.txt')           // Add files
await repo.commit('Initial commit')  // Commit changes
await repo.status()                  // Check status
await repo.push('origin')            // Push to remote
```

### Initializing a Repository

The `init()` method initializes a new Git repository:

```typescript
// Initialize with default settings
await repo.init()

// Initialize with custom options
await repo.init({
  bare: false,
  defaultBranch: 'main',
  objectFormat: 'sha1'
})
```

**Options:**
- `bare?: boolean` - Create a bare repository (default: `false`)
- `defaultBranch?: string` - Default branch name (default: `'master'`)
- `objectFormat?: 'sha1' | 'sha256'` - Object format (default: `'sha1'`)

### Checkout to WorktreeBackend

The `checkout()` method supports two overloads:

#### 1. Checkout to a WorktreeBackend (New Pattern)

This allows you to checkout to a `WorktreeBackend` even if the repository is empty, creating a clean staging area:

```typescript
import { GitWorktreeMemory } from 'universal-git/git/worktree'

// Create a WorktreeBackend (can be filesystem, memory, S3, etc.)
const worktreeBackend = new GitWorktreeMemory()

// Checkout to the WorktreeBackend
// This works even with empty repositories!
await repo.checkout(worktreeBackend, {
  ref: 'main'  // Optional: specify branch/ref to checkout
})

// Now you have a clean staging area where you can add files
await worktreeBackend.write('file.txt', 'Hello, World!')
await repo.add('file.txt')
await repo.commit('Initial commit')
```

**Empty Repository Behavior:**
- Creates an empty index (staging area)
- Sets HEAD to the specified ref (or default branch)
- Creates the branch ref if it doesn't exist
- Ready for adding files and committing

**Non-Empty Repository Behavior:**
- Performs normal checkout to the specified ref
- Updates working directory files
- Updates HEAD (unless `noUpdateHead: true`)

#### 2. Checkout a Ref in Current Worktree (Traditional)

```typescript
// Checkout a branch
await repo.checkout('main')

// Checkout with options
await repo.checkout('feature-branch', {
  force: true,
  noUpdateHead: false
})
```

### Available Command Methods

All common Git commands are available on `Repository`:

#### File Operations

```typescript
// Add files to staging
await repo.add('file.txt')
await repo.add(['file1.txt', 'file2.txt'])
await repo.add()  // Add all files

// Remove files
await repo.remove('file.txt', { cached: true })
await repo.remove(['file1.txt', 'file2.txt'], { force: true })

// Check status
const status = await repo.status('file.txt')
const matrix = await repo.statusMatrix({ filepaths: ['src/'] })
```

#### Commit Operations

```typescript
// Commit staged changes
const commitOid = await repo.commit('Initial commit')

// Commit with options
await repo.commit('Add feature', {
  author: { name: 'John Doe', email: 'john@example.com' },
  committer: { name: 'Jane Doe', email: 'jane@example.com' },
  noVerify: false,
  amend: false
})
```

#### Branch Operations

```typescript
// Create a branch
await repo.branch('feature-branch')

// Create and checkout
await repo.branch('feature-branch', { checkout: true })

// Get current branch
const current = await repo.currentBranch()  // Returns 'main' or null if detached

// List branches
const branches = await repo.listBranches()
const remoteBranches = await repo.listBranches({ remote: true })
```

#### Reset Operations

```typescript
// Reset to HEAD (mixed)
await repo.reset()

// Reset to specific commit
await repo.reset('abc123...', 'hard')

// Reset modes: 'soft', 'mixed', 'hard'
await repo.reset('HEAD~1', 'soft')   // Keep changes in staging
await repo.reset('HEAD~1', 'mixed')  // Keep changes in working directory
await repo.reset('HEAD~1', 'hard')   // Discard all changes
```

#### Remote Operations

```typescript
// Fetch from remote
await repo.fetch('origin')
await repo.fetch('origin', {
  ref: 'main',
  depth: 1,
  tags: true
})

// Push to remote
const result = await repo.push('origin', 'main')
await repo.push('origin', 'main', {
  force: false,
  includeSubmodules: true
})

// Pull from remote (fetch + merge)
const pullResult = await repo.pull('origin', 'main')
await repo.pull('origin', 'main', {
  fastForward: true,
  fastForwardOnly: false
})
```

### Complete Workflow Example

Here's a complete example showing the new pattern:

```typescript
import { Repository } from 'universal-git'
import { GitWorktreeMemory } from 'universal-git/git/worktree'
import * as fs from 'fs'

// 1. Open or initialize repository
const repo = await Repository.open({
  fs,
  dir: '/path/to/repo',
  init: true  // Initialize if it doesn't exist
})

// Or initialize explicitly
await repo.init({ defaultBranch: 'main' })

// 2. Create a WorktreeBackend (can be any type: filesystem, memory, S3, etc.)
const worktreeBackend = new GitWorktreeMemory()

// 3. Checkout to the WorktreeBackend (creates clean staging area)
await repo.checkout(worktreeBackend, { ref: 'main' })

// 4. Add files to the worktree
await worktreeBackend.write('README.md', '# My Project')
await worktreeBackend.write('src/index.js', 'console.log("Hello")')

// 5. Stage files
await repo.add('README.md')
await repo.add('src/index.js')

// 6. Check status
const status = await repo.status('README.md')
console.log(status)  // 'added'

// 7. Commit
const commitOid = await repo.commit('Initial commit')

// 8. Create a new branch
await repo.branch('feature-branch', { checkout: true })

// 9. Make changes and commit
await worktreeBackend.write('src/feature.js', 'export function feature() {}')
await repo.add('src/feature.js')
await repo.commit('Add feature')

// 10. Push to remote
await repo.push('origin', 'feature-branch')
```

### Benefits of Repository Command Pattern

1. **Git-like API**: Commands work like Git CLI, based on current working directory
2. **State Consistency**: All operations use the same Repository instance with shared state
3. **Automatic Caching**: Repository manages caching automatically
4. **Backend Agnostic**: Works with any `WorktreeBackend` type (filesystem, memory, S3, etc.)
5. **Empty Repository Support**: Can checkout to a `WorktreeBackend` even with no commits yet
6. **Type Safety**: Full TypeScript support with proper types

### Legacy Command Pattern

You can still use commands directly (for backward compatibility):

```typescript
import { add, commit, status } from 'universal-git'

const repo = await Repository.open({ fs, dir: '/path/to/repo' })

// Commands can use the repository for state management
await add({ repo, filepath: 'file.txt' })
await commit({ repo, message: 'Add file' })
await status({ repo })
```

**Note**: The Repository command pattern is recommended for new code, as it provides better state consistency and a more Git-like API.

## Lazy Loading

Repository uses lazy loading for performance:

```typescript
// Config is loaded on first access
const config = await repo.readConfig() // Loads config

// Index is loaded on first access
const index = await repo.readIndex() // Loads index

// Worktree is loaded on first access
const worktree = repo.worktree // Loads worktree
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

## Submodule Management

`Repository` provides comprehensive submodule management, where each submodule is represented by its own `Repository` instance with its own `GitBackend` and `WorktreeBackend`.

### Getting Submodule Repositories

```typescript
// Get a submodule Repository by path or name
const submoduleRepo = await repo.getSubmodule('libs/mylib')

// Each submodule has its own GitBackend
const submoduleGitBackend = submoduleRepo.gitBackend

// Each submodule has its own WorktreeBackend
const submoduleWorktree = await submoduleRepo.getWorktree()
const submoduleWorktreeBackend = submoduleWorktree?.backend

// Use submodule Repository for operations
const submoduleHead = await submoduleRepo.resolveRef('HEAD')
const submoduleFiles = await listFiles({ repo: submoduleRepo })
```

### Listing Submodules

```typescript
// List all submodules with their Repository instances
const submodules = await repo.listSubmodules()

for (const { name, path, url, repo: submoduleRepo } of submodules) {
  if (submoduleRepo) {
    console.log(`Submodule: ${name} at ${path}`)
    console.log(`Repository: ${submoduleRepo.instanceId}`)
    console.log(`GitBackend: ${submoduleRepo.gitBackend}`)
    
    // Access submodule's HEAD
    const head = await submoduleRepo.resolveRef('HEAD')
    console.log(`HEAD: ${head}`)
  }
}
```

### Submodule Architecture

Each submodule has its own complete `Repository` instance:

```
Parent Repository
├── GitBackend (main repository)
├── WorktreeBackend (main worktree)
└── Submodule Repositories (cached in _submoduleRepos)
    ├── Submodule 1 Repository
    │   ├── GitBackend (submodule 1)
    │   └── WorktreeBackend (submodule 1 worktree)
    ├── Submodule 2 Repository
    │   ├── GitBackend (submodule 2)
    │   └── WorktreeBackend (submodule 2 worktree)
    └── Nested Submodule Repository
        ├── GitBackend (nested submodule)
        └── WorktreeBackend (nested submodule worktree)
```

### WorktreeBackend Submodule Awareness

`WorktreeBackend` implementations are **multi-worktree aware** and automatically handle submodules by delegating operations to submodule `WorktreeBackend` instances:

```typescript
const worktreeBackend = repo.worktreeBackend

// Reading a file in a submodule automatically delegates to submodule's WorktreeBackend
const content = await worktreeBackend.read('libs/mylib/file.txt')
// This internally:
// 1. Detects that 'libs/mylib/file.txt' is in a submodule
// 2. Gets the submodule's Repository via repo.getSubmodule('libs/mylib')
// 3. Gets the submodule's WorktreeBackend
// 4. Delegates the read operation with relative path 'file.txt'
```

### Adding Submodules to WorktreeBackend

You can programmatically add submodules to a `WorktreeBackend`:

```typescript
const repo = await Repository.open({ fs, dir: '/path/to/repo' })
const worktreeBackend = repo.worktreeBackend

// Create or open a submodule Repository
const submoduleRepo = await Repository.open({
  fs,
  dir: '/path/to/repo/libs/my-module',
  gitdir: '/path/to/repo/.git/modules/libs/my-module'
})

// Add the submodule to the worktree backend
await worktreeBackend.addSubmodule('libs/my-module', submoduleRepo)

// Now the submodule is registered and cached
// File operations on 'libs/my-module/*' will automatically delegate to the submodule
```

### Submodule Path Resolution

```typescript
// Check if a path is in a submodule
const submodulePath = await worktreeBackend.getSubmoduleForPath('libs/mylib/file.txt')
// Returns: 'libs/mylib' or null

// Resolve a path across worktree boundaries
const resolved = await worktreeBackend.resolvePath('libs/mylib/file.txt')
// Returns: {
//   worktree: GitWorktreeBackend,  // Submodule's WorktreeBackend
//   relativePath: 'file.txt',       // Path relative to submodule root
//   submodulePath: 'libs/mylib'     // Submodule path
// }

// Get submodule WorktreeBackend directly
const submoduleBackend = await worktreeBackend.getSubmodule('libs/mylib')
// Returns: GitWorktreeBackend for the submodule

// List all submodule WorktreeBackends
const submodules = await worktreeBackend.listSubmodules()
// Returns: Array<{ path: string, backend: GitWorktreeBackend }>
```

### Invalidating Submodule Cache

```typescript
// Invalidate submodule Repository cache (e.g., after adding/removing submodules)
repo.invalidateSubmoduleCache()
```

**Key Benefits:**
- Each submodule operates independently with its own `GitBackend`
- Submodules can have different remote configurations
- Automatic path resolution across worktree boundaries
- Recursive support for nested submodules
- Efficient caching of submodule Repository instances

For more details, see [Submodules Documentation](./submodules.md).

## See Also

- [Backends](./backends.md) - Backend storage systems
- [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) - How refs work
- [Cache Parameter](./cache.md) - Cache object usage
- [Factory Pattern](./factory-pattern.md) - Filesystem factory pattern
- [Remote Management](./remote.md) - Remote repository management

