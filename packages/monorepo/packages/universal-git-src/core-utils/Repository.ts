import { NotFoundError } from '../errors/NotFoundError.ts'
import { findRoot } from "../commands/findRoot.ts"
import { join } from './GitPath.ts'
// UnifiedConfigService refactored to capability modules in git/config/
// Using src/git/ functions directly for state, refs, and index operations
import { Worktree } from './Worktree.ts'
import { GitIndex } from '../git/index/GitIndex.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { detectObjectFormat, type ObjectFormat } from '../utils/detectObjectFormat.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import type { FileSystemProvider, RawFileSystemProvider } from "../models/FileSystem.ts"
import type { Transport, TransportOptions } from '../transport/index.ts'
import { createTransport, createDefaultTransport } from '../transport/index.ts'
import { WorkerPool } from '../workers/WorkerPool.ts'
import type { ProxiedRepository } from '../workers/Proxies.ts'
import type { ProgressCallback } from '../git/remote/types.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'

type ObjectReaderWrapper = {
  read: (params: {
    oid: string
    format?: 'content' | 'parsed' | 'deflated' | 'wrapped'
  }) => Promise<unknown>
}

type ObjectWriterWrapper = {
  write: (params: {
    type: string
    object: UniversalBuffer | Uint8Array
    format?: 'wrapped' | 'deflated' | 'content'
  }) => Promise<string>
}

/**
 * Repository - Thin wrapper around GitBackend and multiple WorktreeBackend instances
 * 
 * Repository is a thin wrapper that delegates to:
 * - 1 GitBackend (always present) - handles all Git repository data (objects, refs, config, index, etc.)
 *   - For bare repositories: only GitBackend is present
 *   - For remote repositories: GitBackend handles remote operations
 * - Multiple linked worktree checkouts (optional) - each with its own WorktreeBackend
 *   - Main worktree: optional, has its own WorktreeBackend
 *   - Linked worktrees: each has its own WorktreeBackend instance
 *   - WorktreeBackend type can be specified on checkout (filesystem, memory, S3, etc.)
 * 
 * Repository provides:
 * - State management (index caching, config caching)
 * - Instance caching (singleton pattern for same gitdir)
 * - Unified interface for Git operations
 * - Delegation to backends for all storage operations
 */
export class Repository {
  // CRITICAL: Two-level static cache for Repository instances
  // First level: keyed by FileSystemProvider instance (ensures test isolation)
  // Second level: keyed by normalized gitdir (ensures same repo = same instance)
  // This ensures that:
  // 1. Different filesystem instances get different Repository instances (test isolation)
  // 2. Same filesystem + same gitdir = same Repository instance (state consistency)
  // This is essential for state consistency - when add() modifies repo._index,
  // status() must see the same instance with the same modified _index.
  private static _instanceCache: Map<FileSystemProvider, Map<string, Repository>> = new Map()

  // Internal fs storage - only for system/global config access
  // Not exposed directly - fs should be accessed through WorktreeBackend when available
  // Can be null when no WorktreeBackend is linked via checkout
  // Can be set when checkout() is called with a WorktreeBackend that provides fs
  private _fs: FileSystemProvider | null
  private _dir: string | null
  private _gitdir: string | null
  public readonly cache: Record<string, unknown>
  private readonly _systemConfigPath?: string
  private readonly _globalConfigPath?: string

  // Backend instances (new API - preferred over fs/dir/gitdir)
  // Repository is a thin wrapper around:
  // 1. One GitBackend (always present - for bare repos or remote repos)
  // 2. Multiple linked worktree checkouts, each with its own WorktreeBackend
  // 3. Multiple remote backends (one per configured remote)
  private _gitBackend: GitBackend | null = null
  private _worktreeBackend: GitWorktreeBackend | null = null  // Main worktree backend (if any)
  private _worktrees: Map<string, Worktree> = new Map()  // Multiple linked worktrees
  private _remoteBackends: Map<string, import('../git/remote/GitRemoteBackend.ts').GitRemoteBackend> = new Map()  // Remote backends cache
  private _submoduleRepos: Map<string, Repository> = new Map()  // Submodule Repository instances cache (keyed by submodule path)
  
  // Config provider for system/global config management
  private _configProvider: import('../git/config/ConfigProvider.ts').ConfigProvider | null = null

  // Config is now loaded on-demand using capability modules (git/config/loader.ts, git/config/merge.ts)
  // No longer caching UnifiedConfigService instance
  // StateManager removed - use src/git/state/ functions directly
  private _objectReader: ObjectReaderWrapper | null = null
  private _objectWriter: ObjectWriterWrapper | null = null
  private _isBare: boolean | null = null
  private _worktree: Worktree | null = null  // Main worktree (cached for backward compatibility)
  private _objectFormat: ObjectFormat | null = null
  
  // CRITICAL: Repository owns the index state to ensure in-memory modifications persist
  // This solves the race condition where add() modifies the index, but status() reads
  // a stale cached version due to filesystem mtime resolution limitations
  private _index: GitIndex | null = null
  private _indexMtime: number | null = null
  
  // Unique ID for debugging - helps track Repository instances across operations
  public readonly instanceId = Math.random()
  
  // Worker thread support
  private _workerPool?: WorkerPool
  private _transport?: Transport
  private _proxiedRepository?: ProxiedRepository

  constructor(
    fs: FileSystemProvider | null,
    dir: string | null,
    gitdir: string | null,
    cache: Record<string, unknown> = {},
    systemConfigPath?: string,
    globalConfigPath?: string,
    gitBackend?: GitBackend,
    worktreeBackend?: GitWorktreeBackend,
    configProvider?: import('../git/config/ConfigProvider.ts').ConfigProvider
  ) {
    // Derive fs from backends if not provided (for system/global config access)
    // fs can be null if no WorktreeBackend is linked - this is valid for bare repos
    if (fs) {
      this._fs = fs
    } else if (gitBackend?.getFileSystem) {
      this._fs = gitBackend.getFileSystem() || null
    } else if (worktreeBackend?.getFileSystem) {
      this._fs = worktreeBackend.getFileSystem() || null
    } else {
      // fs can be null - Repository can exist without filesystem when no WorktreeBackend is linked
      this._fs = null
    }
    
    this._gitdir = gitdir
    this.cache = cache
    this._systemConfigPath = systemConfigPath
    this._globalConfigPath = globalConfigPath
    this._gitBackend = gitBackend || null
    this._worktreeBackend = worktreeBackend || null
    this._configProvider = configProvider || null
    
    // If worktree backend is provided, derive dir from it if dir is not set
    if (worktreeBackend && !dir && worktreeBackend.getDirectory) {
      const worktreeDir = worktreeBackend.getDirectory()
      if (worktreeDir) {
        this._dir = worktreeDir
      } else {
        this._dir = dir
      }
    } else {
      this._dir = dir
    }
    
    // Set Repository reference on WorktreeBackend for submodule delegation
    if (worktreeBackend && 'setRepository' in worktreeBackend) {
      (worktreeBackend as any).setRepository(this)
    }
  }

  /**
   * Get filesystem instance - only available when WorktreeBackend is linked via checkout
   * Repository should not expose fs directly - it should only be accessible through backends
   * @returns FileSystemProvider if worktree backend provides it, or null if no WorktreeBackend is linked
   */
  get fs(): FileSystemProvider | null {
    // Only expose fs through WorktreeBackend - fs is only available after checkout
    if (this._worktreeBackend?.getFileSystem) {
      const fs = this._worktreeBackend.getFileSystem()
      if (fs) {
        return fs
      }
    }
    // No WorktreeBackend linked via checkout - fs is not available
    return null
  }

  /**
   * Check if filesystem is available
   * @returns true if filesystem is available, false otherwise
   */
  hasFileSystem(): boolean {
    return this.fs !== null
  }

  /**
   * Detects system and global git config paths
   * Follows git's config file precedence rules
   * 
   * Uses the capability module git/config/discover.ts
   */
  static async detectConfigPaths(
    fs: FileSystemProvider,
    env?: Record<string, string>
  ): Promise<{ systemConfigPath?: string; globalConfigPath?: string }> {
    const { discoverConfigPaths } = await import('../git/config/discover.ts')
    return discoverConfigPaths(fs, env)
  }

  /**
   * Opens a repository from a directory or backends
   * 
   * CRITICAL: Reuses Repository instances from cache to ensure index state consistency.
   * When multiple operations (add, status, etc.) use the same cache and gitdir, they
   * get the same Repository instance, which owns the index state.
   * 
   * **Parameter Precedence:**
   * 1. If `gitBackend` is provided, `gitdir` is derived from it (gitdir parameter is ignored)
   * 2. If `worktree` is provided, `dir` is derived from it (dir parameter is ignored)
   * 3. If `fs` is not provided, it is derived from backends (if they are FilesystemBackend/GitWorktreeFs)
   * 
   * **New API (Recommended):**
   * - `gitBackend: GitBackend` - Git backend instance (preferred over `gitdir`)
   * - `worktree: GitWorktreeBackend` - Worktree backend instance (preferred over `dir`)
   * 
   * **Legacy API (Deprecated):**
   * - `fs` - Raw filesystem client or FileSystemProvider (normalized internally)
   * - `dir` - Working directory (optional, deprecated - use `worktree` instead)
   * - `gitdir` - Git directory path (optional, deprecated - use `gitBackend` instead)
   * 
   * @param options - Repository options
   * @param options.fs - Raw filesystem client or FileSystemProvider (optional if gitBackend/worktree are provided)
   * @param options.dir - Working directory (optional, deprecated - use `worktree` instead)
   * @param options.gitdir - Git directory path (optional, deprecated - use `gitBackend` instead)
   * @param options.cache - Cache object for performance (optional)
   * @param options.systemConfigPath - Explicit path to system git config (optional)
   * @param options.globalConfigPath - Explicit path to global git config (optional)
   * @param options.autoDetectConfig - Auto-detect system/global config paths (default: true)
   * @param options.ignoreSystemConfig - Skip auto-detection of system/global config, but still use explicitly provided paths (default: false)
   * @param options.gitBackend - Git backend instance (new API - preferred over gitdir)
   * @param options.worktree - Worktree backend instance (new API - preferred over dir)
   * @returns Repository instance (cached if same fs + gitdir)
   * 
   * @example
   * ```typescript
   * // New API with backends
   * const repo = await Repository.open({
   *   gitBackend: myGitBackend,
   *   worktree: myWorktreeBackend,
   *   cache: {}
   * })
   * 
   * // Legacy API
   * const repo = await Repository.open({
   *   fs,
   *   dir: '/path/to/repo',
   *   cache: {}
   * })
   * ```
   */
  static async open({
    fs: inputFs,
    dir,
    gitdir: providedGitdir,
    cache = {},
    systemConfigPath,
    globalConfigPath,
    autoDetectConfig = true,
    ignoreSystemConfig = false,
    gitBackend,
    worktree,
    init = false,
    bare = false,
    defaultBranch = 'master',
    objectFormat = 'sha1',
  }: {
    fs?: FileSystemProvider | RawFileSystemProvider
    dir?: string
    gitdir?: string
    cache?: Record<string, unknown>
    systemConfigPath?: string
    globalConfigPath?: string
    autoDetectConfig?: boolean
    ignoreSystemConfig?: boolean
    gitBackend?: GitBackend
    worktree?: GitWorktreeBackend
    init?: boolean
    bare?: boolean
    defaultBranch?: string
    objectFormat?: 'sha1' | 'sha256'
  }): Promise<Repository> {
    const { normalize, join } = await import('./GitPath.ts')
    const { FilesystemBackend } = await import('../backends/FilesystemBackend.ts')
    const { createGitWorktreeBackend } = await import('../git/worktree/index.ts')
    
    // Step 1: Auto-create backends from dir/gitdir/fs if not provided
    // This ensures Repository always has backends, removing fs dependency
    let resolvedGitBackend: GitBackend
    let resolvedWorktreeBackend: GitWorktreeBackend | null = null
    let fs: FileSystemProvider | null = null
    
    // Normalize dir first to POSIX format (Git convention) - needed in multiple places
    const normalizedDir = dir ? normalize(dir) : undefined
    
    if (gitBackend) {
      // Use provided gitBackend
      resolvedGitBackend = gitBackend
      // Derive fs from gitBackend for system/global config access
      if (gitBackend.getFileSystem) {
        fs = gitBackend.getFileSystem() || null
      }
    } else {
      // Need to create FilesystemBackend - require fs and gitdir
      if (!inputFs) {
        throw new Error("Either 'fs' or 'gitBackend' is required. When 'gitBackend' is not provided, 'fs' is required to create FilesystemBackend.")
      }
      fs = createFileSystem(inputFs)
      
      // Determine gitdir
      let finalGitdir: string
      if (providedGitdir) {
        finalGitdir = normalize(providedGitdir)
      } else if (normalizedDir) {
        // When only dir is provided: gitdir = dir/.git
        // CRITICAL: If init is true, NEVER call findRoot - always create new repo at dir/.git
        // This prevents accidentally finding and modifying a parent directory's .git folder
        if (init) {
          // Always create new repository at dir/.git when init is true
          finalGitdir = normalize(join(normalizedDir, '.git'))
        } else {
          // Check if dir itself is a bare repo (has config file directly)
          const configPath = join(normalizedDir, 'config')
          const isBare = await fs.exists(configPath)
          if (isBare) {
            finalGitdir = normalizedDir
          } else {
            // Find .git directory by walking up from dir
            // WARNING: This can find a parent directory's .git folder
            // Only use this when init is false and we're sure we want to find an existing repo
            try {
              const root = await findRoot({ fs, filepath: normalizedDir })
              finalGitdir = normalize(join(root, '.git'))
            } catch (err) {
              if (err instanceof NotFoundError) {
                throw new NotFoundError(`Not a git repository: ${normalizedDir}`)
              } else {
                throw err
              }
            }
          }
        }
      } else {
        throw new Error("Either 'dir', 'gitdir', or 'gitBackend' is required.")
      }
      
      // Create FilesystemBackend
      resolvedGitBackend = new FilesystemBackend(fs, finalGitdir)
    }
    
    if (worktree) {
      // Use provided worktree backend
      resolvedWorktreeBackend = worktree
      // Derive fs from worktree if not already set
      if (!fs && worktree.getFileSystem) {
        fs = worktree.getFileSystem() || null
      }
    } else if (normalizedDir) {
      // Need to create GitWorktreeFs - require fs and dir
      if (!fs) {
        if (!inputFs) {
          throw new Error("Either 'fs' or 'worktree' is required. When 'worktree' is not provided, 'fs' is required to create GitWorktreeFs.")
        }
        fs = createFileSystem(inputFs)
      }
      
      // Create GitWorktreeFs with normalized dir
      resolvedWorktreeBackend = createGitWorktreeBackend({ fs, dir: normalizedDir })
    }
    
    // Ensure we have fs for system/global config access (derive from backends if needed)
    if (!fs) {
      if (resolvedGitBackend.getFileSystem) {
        fs = resolvedGitBackend.getFileSystem() || null
      }
      if (!fs && resolvedWorktreeBackend?.getFileSystem) {
        fs = resolvedWorktreeBackend.getFileSystem() || null
      }
      if (!fs) {
        throw new Error("Cannot access system/global config: no filesystem available. At least one backend must provide a filesystem via getFileSystem().")
      }
    }

    // Step 2: Determine gitdir and workingDir from resolved backends
    let finalGitdir: string
    let workingDir: string | null = null
    
    // Derive gitdir from gitBackend
    if (resolvedGitBackend instanceof FilesystemBackend) {
      finalGitdir = normalize(resolvedGitBackend.getGitdir())
    } else {
      // For non-filesystem backends, use providedGitdir or derive from dir
      if (providedGitdir) {
        finalGitdir = normalize(providedGitdir)
      } else if (normalizedDir) {
        // Derive gitdir from dir (dir/.git)
        if (fs) {
          const configPath = join(normalizedDir, 'config')
          const isBare = await fs.exists(configPath)
          if (isBare) {
            finalGitdir = normalizedDir
          } else {
            finalGitdir = normalize(join(normalizedDir, '.git'))
          }
        } else {
          // Default to dir/.git if no fs available
          finalGitdir = normalize(join(normalizedDir, '.git'))
        }
      } else {
        throw new Error("Cannot determine gitdir: 'gitdir' or 'dir' is required when using non-filesystem gitBackend.")
      }
    }
    
    // Derive workingDir from worktree backend or dir
    // Normalize workingDir to POSIX format (Git convention)
    if (resolvedWorktreeBackend) {
      if (resolvedWorktreeBackend.getDirectory) {
        const worktreeDir = resolvedWorktreeBackend.getDirectory()
        workingDir = worktreeDir ? normalize(worktreeDir) : null
      }
      // If worktree backend doesn't have getDirectory, use normalized dir parameter
      if (!workingDir && normalizedDir) {
        workingDir = normalizedDir
      }
    } else if (normalizedDir) {
      workingDir = normalizedDir
    }

    // Step 3: Get or create the fs-specific cache
    // CRITICAL: We use a two-level cache to ensure that:
    // - Different filesystem instances get different Repository instances (test isolation)
    // - Same filesystem + same gitdir = same Repository instance (state consistency)
    if (!fs) {
      throw new Error("Cannot cache Repository: filesystem is required for caching. At least one backend must provide a filesystem.")
    }
    if (!Repository._instanceCache.has(fs)) {
      Repository._instanceCache.set(fs, new Map<string, Repository>())
    }
    const fsCache = Repository._instanceCache.get(fs)!

    // Step 4: Check the fs-specific cache for the instance
    // CRITICAL: If dir is provided and cached instance has dir=null, don't use cached instance
    // This ensures that non-bare repositories created via clone() work correctly
    if (fsCache.has(finalGitdir)) {
      const cachedRepo = fsCache.get(finalGitdir)!
      // Check if we can reuse the cached instance
      // We can reuse if:
      // 1. Both have the same workingDir (or both are null)
      // 2. Worktree backends are compatible (both auto-created for same dir, or both explicitly provided)
      const cachedDir = await cachedRepo.getDir()
      const dirsMatch = (workingDir === null && cachedDir === null) || (workingDir === cachedDir)
      
      if (dirsMatch) {
        // Same gitdir and same dir - can reuse cached instance
        // Note: Even if backends are different instances, they're for the same repository,
        // so we can reuse the cached Repository instance
        return cachedRepo
      } else {
        // Different dirs - create new instance
        // This handles the case where a bare repo was cached, but we're now opening it as non-bare
        // or vice versa
      }
    }

    // Step 5: Auto-detect config paths if not provided and auto-detection is enabled
    let finalSystemPath = systemConfigPath
    let finalGlobalPath = globalConfigPath

    // If ignoreSystemConfig is true, skip auto-detection but still respect explicitly provided paths
    // If ignoreSystemConfig is false, auto-detect paths if enabled and paths aren't explicitly provided
    if (!ignoreSystemConfig && autoDetectConfig && (!finalSystemPath || !finalGlobalPath)) {
      const detected = await Repository.detectConfigPaths(fs)
      finalSystemPath = finalSystemPath || detected.systemConfigPath
      finalGlobalPath = finalGlobalPath || detected.globalConfigPath
    }

    // Step 6: Create ConfigProvider from system/global config paths
    // ConfigProvider handles all config operations (system, global, local, worktree)
    let configProvider: import('../git/config/ConfigProvider.ts').ConfigProvider | undefined
    if (fs && (finalSystemPath || finalGlobalPath)) {
      const { StaticConfigProvider } = await import('../git/config/ConfigProvider.ts')
      const { loadSystemConfig, loadGlobalConfig } = await import('../git/config/loader.ts')
      const systemConfig = await loadSystemConfig(fs, finalSystemPath)
      const globalConfig = await loadGlobalConfig(fs, finalGlobalPath)
      // Pass gitBackend, worktreeBackend, fs, and gitdir so ConfigProvider can handle all config
      configProvider = new StaticConfigProvider(systemConfig, globalConfig, resolvedGitBackend, resolvedWorktreeBackend || undefined, fs, finalGitdir)
    } else if (resolvedGitBackend || resolvedWorktreeBackend || fs) {
      // Even without system/global config paths, create ConfigProvider for local/worktree config
      const { StaticConfigProvider } = await import('../git/config/ConfigProvider.ts')
      configProvider = new StaticConfigProvider(undefined, undefined, resolvedGitBackend, resolvedWorktreeBackend || undefined, fs || undefined, finalGitdir)
    }

    // Step 7: Create new Repository instance and cache it in fs-specific cache
    // CRITICAL: Repository now always has backends - fs is only for system/global config
    const repo = new Repository(fs, workingDir, finalGitdir, cache, finalSystemPath, finalGlobalPath, resolvedGitBackend, resolvedWorktreeBackend || undefined, configProvider)
    fsCache.set(finalGitdir, repo)
    
    // Step 7.5: If worktree was provided, automatically checkout to it
    // This makes fs available immediately after Repository.open
    if (resolvedWorktreeBackend) {
      // Set Repository reference on WorktreeBackend for submodule delegation
      if ('setRepository' in resolvedWorktreeBackend) {
        (resolvedWorktreeBackend as any).setRepository(repo)
      }
      // Automatically checkout to the provided worktree
      // This ensures fs is available immediately
      // For empty repositories, checkout will just set up the worktree without requiring a ref
      try {
        await repo.checkout(resolvedWorktreeBackend)
      } catch (err) {
        // If checkout fails (e.g., empty repo), just set up the worktree without checking out a ref
        // This allows Repository.open to succeed even for empty repositories
        if (err instanceof Error && err.message.includes('Not a 40-char OID')) {
          // Empty repository - just set up the worktree without checking out
          repo._worktreeBackend = resolvedWorktreeBackend
          const dir = resolvedWorktreeBackend.getDirectory?.() || null
          if (dir) {
            repo._dir = dir
          }
          const { Worktree } = await import('./Worktree.ts')
          repo._worktree = new Worktree(repo, dir || '', resolvedWorktreeBackend)
        } else {
          throw err
        }
      }
    }
    
    // Step 8: Initialize repository if requested
    if (init) {
      // Check if already initialized
      if (!(await resolvedGitBackend.isInitialized())) {
        // Initialize backend structure
        await resolvedGitBackend.initialize()
        
        // Set initial config values
        const config = await repo.getConfig()
        if (objectFormat === 'sha256') {
          await config.set('core.repositoryformatversion', '1', 'local')
          await config.set('extensions.objectformat', 'sha256', 'local')
        } else {
          await config.set('core.repositoryformatversion', '0', 'local')
        }
        await config.set('core.filemode', 'false', 'local')
        await config.set('core.bare', bare.toString(), 'local')
        if (!bare) {
          await config.set('core.logallrefupdates', 'true', 'local')
        }
        await config.set('core.symlinks', 'false', 'local')
        await config.set('core.ignorecase', 'true', 'local')
        
        // Set HEAD to default branch
        await resolvedGitBackend.writeHEAD(`ref: refs/heads/${defaultBranch}`)
      }
    }
    
    return repo
  }

  /**
   * Clear the static instance cache (useful for testing)
   */
  static clearInstanceCache(): void {
    Repository._instanceCache.clear()
  }

  /**
   * Gets the working directory
   */
  get dir(): string | null {
    return this._dir
  }

  /**
   * Gets the working directory (async method for consistency with getGitdir)
   */
  async getDir(): Promise<string | null> {
    return this._dir
  }

  /**
   * Gets the git directory
   */
  async getGitdir(): Promise<string> {
    if (this._gitdir) {
      return this._gitdir
    }
    // Use gitBackend if available
    if (this._gitBackend) {
      const { FilesystemBackend } = await import('../backends/FilesystemBackend.ts')
      if (this._gitBackend instanceof FilesystemBackend) {
        this._gitdir = this._gitBackend.getGitdir()
        return this._gitdir
      }
    }
    // Fallback: derive from dir
    if (this._dir) {
      // Find .git directory
        const root = await findRoot({ fs: this._fs, filepath: this._dir })
      this._gitdir = join(root, '.git')
      return this._gitdir
    }
    throw new Error('Cannot determine gitdir: neither dir nor gitdir provided, and gitBackend does not provide gitdir')
  }

  /**
   * Gets the git directory as a property (async getter)
   */
  get gitdir(): Promise<string> {
    return this.getGitdir()
  }

  /**
   * Gets the Git backend instance
   * Returns null if no backend was provided (using legacy fs-based operations)
   */
  get gitBackend(): GitBackend | null {
    return this._gitBackend
  }

  /**
   * Gets the worktree backend instance
   * Returns null if no backend was provided (using legacy fs-based operations)
   */
  get worktreeBackend(): GitWorktreeBackend | null {
    return this._worktreeBackend
  }

  /**
   * Checks if repository is bare
   */
  async isBare(): Promise<boolean> {
    if (this._isBare === null) {
      // Use gitBackend if available, otherwise fall back to fs
      if (this._gitBackend) {
        try {
          // Try to read config from backend - if it exists, check bare setting
          const configBuffer = await this._gitBackend.readConfig()
          const { parse: parseConfig } = await import('../core-utils/ConfigParser.ts')
          const config = parseConfig(configBuffer)
          const bare = config.get('core.bare')
          this._isBare = bare === 'true' || bare === true
        } catch {
          // Config doesn't exist or can't be read - default to non-bare
          this._isBare = false
        }
      } else {
        // This should never happen since we always have gitBackend now
        // But keep for safety - default to non-bare
        this._isBare = false
      }
    }
    return this._isBare
  }

  /**
   * Gets a config helper object that uses capability modules.
   * 
   * This provides a backward-compatible interface while using the new
   * capability module pattern (git/config/loader.ts, git/config/merge.ts).
   * 
   * @returns Config helper object with get, set, getAll, getSubsections, getSections methods
   */
  async getConfig(): Promise<{
    get(path: string): Promise<unknown>
    set(path: string, value: unknown, scope?: 'local' | 'global' | 'system' | 'worktree', append?: boolean): Promise<void>
    getAll(path: string): Promise<Array<{ value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }>>
    getSubsections(section: string): Promise<(string | null)[]>
    getSections(): Promise<string[]>
    reload(): Promise<void>
  }> {
    // If ConfigProvider is available, delegate all operations to it
    if (this._configProvider) {
      return {
        get: (path: string) => this._configProvider!.get(path),
        set: (path: string, value: unknown, scope?: 'local' | 'global' | 'system' | 'worktree', append?: boolean) =>
          this._configProvider!.set(path, value, scope, append),
        getAll: (path: string) => this._configProvider!.getAll(path),
        getSubsections: (section: string) => this._configProvider!.getSubsections(section),
        getSections: () => this._configProvider!.getSections(),
        reload: () => this._configProvider!.reload(),
      }
    }

    // Fallback: create ConfigProvider on-the-fly for backward compatibility
    const gitdir = await this.getGitdir()
    const { StaticConfigProvider } = await import('../git/config/ConfigProvider.ts')
    const { loadSystemConfig, loadGlobalConfig } = await import('../git/config/loader.ts')
    const systemConfig = await loadSystemConfig(this._fs, this._systemConfigPath)
    const globalConfig = await loadGlobalConfig(this._fs, this._globalConfigPath)
    const fallbackProvider = new StaticConfigProvider(systemConfig, globalConfig, this._gitBackend || undefined, this._worktreeBackend || undefined, this._fs, gitdir)
    
    return {
      get: (path: string) => fallbackProvider.get(path),
      set: (path: string, value: unknown, scope?: 'local' | 'global' | 'system' | 'worktree', append?: boolean) =>
        fallbackProvider.set(path, value, scope, append),
      getAll: (path: string) => fallbackProvider.getAll(path),
      getSubsections: (section: string) => fallbackProvider.getSubsections(section),
      getSections: () => fallbackProvider.getSections(),
      reload: () => fallbackProvider.reload(),
    }
  }

  /**
   * Gets the object format (SHA-1 or SHA-256) used by this repository
   * Caches the result for performance
   */
  async getObjectFormat(): Promise<ObjectFormat> {
    if (!this._objectFormat) {
      const gitdir = await this.getGitdir()
      // Use gitBackend if available, otherwise fall back to fs
      this._objectFormat = await detectObjectFormat(
        this._fs,
        gitdir,
        this.cache,
        this._gitBackend || undefined
      )
    }
    return this._objectFormat
  }

  /**
   * Gets the unified configuration service as a property (async getter)
   */
  get config(): Promise<Awaited<ReturnType<typeof this.getConfig>>> {
    return this.getConfig()
  }

  /**
   * Uses src/git/state/ functions directly
   * Example: import { readMergeHead, writeMergeHead } from '../git/state/index.ts'
   */
  // getStateManager() method removed - use src/git/state/ functions directly

  /**
   * Gets the ref manager
   */
  // getRefManager() method removed - use capability modules from git/refs/ directly

  /**
   * Gets the object reader
   */
  async getObjectReader(): Promise<ObjectReaderWrapper> {
    if (!this._objectReader) {
      // Use backend if available, otherwise fall back to direct object functions
      if (this._gitBackend) {
        this._objectReader = {
          read: async (params) => {
            // Handle 'parsed' format separately - backend doesn't support it
            if (params.format === 'parsed') {
              const result = await this._gitBackend!.readObject(params.oid, 'content', this.cache)
              // Parse the object based on its type
              const commitModule = await import('../core-utils/parsers/Commit.ts')
              const treeModule = await import('../core-utils/parsers/Tree.ts')
              const tagModule = await import('../core-utils/parsers/Tag.ts')
              const blobModule = await import('../core-utils/parsers/Blob.ts')
              const parseCommit = commitModule.parse
              const parseTree = treeModule.parse
              const parseTag = tagModule.parse
              const parseBlob = blobModule.parse
              
              if (result.type === 'commit') {
                return { ...result, object: parseCommit(result.object) }
              } else if (result.type === 'tree') {
                return { ...result, object: parseTree(result.object) }
              } else if (result.type === 'tag') {
                return { ...result, object: parseTag(result.object) }
              } else if (result.type === 'blob') {
                return { ...result, object: parseBlob(result.object) }
              }
              return result
            }
            // For other formats, use backend
            const validFormat = params.format || 'content'
            return this._gitBackend!.readObject(params.oid, validFormat as 'content' | 'deflated' | 'wrapped', this.cache)
          },
        }
      } else {
        // Fallback to direct object functions
        const gitdir = await this.getGitdir()
        const { readObject } = await import('../git/objects/readObject.ts')
        this._objectReader = {
          read: async (params) => {
            // Handle 'parsed' format separately - readObject doesn't support it
            if (params.format === 'parsed') {
              const result = await readObject({
                oid: params.oid,
                fs: this._fs,
                gitdir,
                cache: this.cache,
                format: 'content',
              })
              // Parse the object based on its type
              const commitModule = await import('../core-utils/parsers/Commit.ts')
              const treeModule = await import('../core-utils/parsers/Tree.ts')
              const tagModule = await import('../core-utils/parsers/Tag.ts')
              const blobModule = await import('../core-utils/parsers/Blob.ts')
              const parseCommit = commitModule.parse
              const parseTree = treeModule.parse
              const parseTag = tagModule.parse
              const parseBlob = blobModule.parse
              
              if (result.type === 'commit') {
                return { ...result, object: parseCommit(result.object) }
              } else if (result.type === 'tree') {
                return { ...result, object: parseTree(result.object) }
              } else if (result.type === 'tag') {
                return { ...result, object: parseTag(result.object) }
              } else if (result.type === 'blob') {
                return { ...result, object: parseBlob(result.object) }
              }
              return result
            }
            // For other formats, pass through to readObject (it will filter out 'parsed')
            const { format, ...restParams } = params
            // Handle 'parsed' format by converting to 'content' (readObject doesn't support 'parsed')
            const validFormat = (format as string) === 'parsed' ? 'content' : format
            return readObject({
              ...restParams,
              fs: this._fs,
              gitdir,
              cache: this.cache,
              format: validFormat as 'content' | 'deflated' | 'wrapped' | undefined,
            })
          },
        }
      }
    }
    return this._objectReader
  }

  /**
   * Gets the object writer
   */
  async getObjectWriter(): Promise<ObjectWriterWrapper> {
    if (!this._objectWriter) {
      // Use backend if available, otherwise fall back to direct object functions
      if (this._gitBackend) {
        this._objectWriter = {
          write: async (params) => {
            return this._gitBackend!.writeObject(
              params.type,
              UniversalBuffer.from(params.object),
              params.format || 'content',
              undefined, // oid
              false, // dryRun
              this.cache
            )
          },
        }
      } else {
        // Fallback to direct object functions
        const gitdir = await this.getGitdir()
        const { writeObject } = await import('../git/objects/writeObject.ts')
        this._objectWriter = {
          write: async (params) => {
            return writeObject({
              ...params,
              fs: this._fs,
              gitdir,
            })
          },
        }
      }
    }
    return this._objectWriter
  }


  /**
   * Reads the index directly from the .git/index file
   * This is the single source of truth - reads directly from disk
   * Delegates to src/git/index/readIndex.ts
   * 
   * @param useCache - Whether to use cache (default: true)
   * @param allowUnmerged - Whether to allow unmerged paths (default: true). If false, throws UnmergedPathsError if index has unmerged paths.
   */
  async readIndexDirect(force: boolean = false, allowUnmerged: boolean = true, gitdirOverride?: string): Promise<GitIndex> {
    const gitdir = gitdirOverride || await this.getGitdir()
    const normalizedFs = createFileSystem(this._fs)
    const { join } = await import('./GitPath.ts')
    const indexPath = join(gitdir, 'index')
    
    
    // If force is true, clear the owned instance to force a fresh read from disk
    if (force) {
      this._index = null
      this._indexMtime = null
    }
    
    // If we have an in-memory index, check if it's stale
    // Note: mtime checking only works with filesystem backends
    // For non-filesystem backends, we always re-read (backend handles caching internally)
    if (this._index && !this._gitBackend) {
      let currentMtime: number | null = null
      try {
        const stat = await normalizedFs.lstat(indexPath)
        // Handle both normalized and raw stat objects
        const mtimeSeconds = (stat as any).mtimeSeconds ?? (stat as any).mtime?.seconds ?? ((stat as any).mtime?.getTime ? (stat as any).mtime.getTime() / 1000 : null) ?? null
        const mtimeNanoseconds = (stat as any).mtimeNanoseconds ?? (stat as any).mtime?.nanoseconds ?? 0
        if (mtimeSeconds !== null && mtimeSeconds !== undefined) {
          currentMtime = mtimeSeconds * 1000 + (mtimeNanoseconds || 0) / 1000000
        } else {
          currentMtime = null
        }
      } catch (e) {
        // File doesn't exist on disk, our in-memory one is the only source of truth
        // Record index-read mutation even when file doesn't exist
        try {
          const { getStateMutationStream } = await import('./StateMutationStream.ts')
          const { normalize } = await import('./GitPath.ts')
          const mutationStream = getStateMutationStream()
          const normalizedGitdir = normalize(gitdir)
          mutationStream.record({
            type: 'index-read',
            gitdir: normalizedGitdir,
            data: {},
          })
        } catch {
          // Ignore errors in mutation recording
        }
        // Check for unmerged paths if allowUnmerged is false
        if (!allowUnmerged && this._index.unmergedPaths.length > 0) {
          const { UnmergedPathsError } = await import('../errors/UnmergedPathsError.ts')
          throw new UnmergedPathsError(this._index.unmergedPaths)
        }
        return this._index
      }
      
      // If mtime on disk is the same as when we last read/wrote it, our in-memory copy is likely valid
      // However, we still need to verify the file is not corrupted by attempting to read it.
      // If the file is corrupted (empty, wrong magic, wrong checksum), readIndex() will throw an error.
      // We only skip the read if mtime matches AND we're not forcing a read AND we're confident the file is valid.
      // For safety, we always re-read to detect corruption, even if mtime matches.
      // This ensures corrupted index files are always detected, even if mtime hasn't changed.
      if (this._indexMtime === currentMtime && !force) {
        // Even though mtime matches, we need to verify the file is not corrupted
        // Attempt to read the file - if it's corrupted, readIndex() will throw
        // If it's valid, we can return the cached index for efficiency
        try {
          // Verify by reading from fs (we're in a block that only runs when !this._gitBackend)
          const { readIndex } = await import('../git/index/readIndex.ts')
          const diskIndex = await readIndex({
            fs: this._fs,
            gitdir,
          })
          // File is valid, return cached index (more efficient than returning diskIndex)
          // Record index-read mutation even for cached reads
          try {
            const { getStateMutationStream } = await import('./StateMutationStream.ts')
            const { normalize } = await import('./GitPath.ts')
            const mutationStream = getStateMutationStream()
            const normalizedGitdir = normalize(gitdir)
            mutationStream.record({
              type: 'index-read',
              gitdir: normalizedGitdir,
              data: {},
            })
          } catch {
            // Ignore errors in mutation recording
          }
          // Check for unmerged paths if allowUnmerged is false
          if (!allowUnmerged && this._index.unmergedPaths.length > 0) {
            const { UnmergedPathsError } = await import('../errors/UnmergedPathsError.ts')
            throw new UnmergedPathsError(this._index.unmergedPaths)
          }
          return this._index
        } catch (err) {
          // File is corrupted or read failed - clear cache and propagate error
          this._index = null
          this._indexMtime = null
          throw err
        }
      }
      
      // If mtimes differ, it means an external process (or a bug) modified the index file
      // We must discard our in-memory version and re-read from disk
      // This should be rare - normally writeIndexDirect updates _indexMtime correctly
      // CRITICAL: Even if mtime matches, if force=true, we still re-read to detect corruption
    }
    
    // If we're here, we need to read from disk
    // CRITICAL: readIndex() may throw errors for corrupted index files (empty, wrong magic, wrong checksum)
    // These errors should propagate to the caller, not be caught and swallowed
    let index: GitIndex
    if (this._gitBackend) {
      // Use backend to read index
      const objectFormat = await this.getObjectFormat()
      const indexBuffer = await this._gitBackend.readIndex()
      // Handle empty index files (same as filesystem version)
      if (indexBuffer.length === 0) {
        // Empty buffer - check if index exists to distinguish between:
        // - Index doesn't exist → repository is not instantiated (since init creates index)
        // - Index exists but is empty → throw error (corrupted)
        const indexExists = await this._gitBackend.hasIndex()
        if (indexExists) {
          // Index exists but is empty - this is corruption, throw error
          const { InternalError } = await import('../errors/InternalError.ts')
          throw new InternalError('Index file is empty (.git/index)')
        } else {
          // Index doesn't exist - repository is not instantiated
          // Return empty index as valid state (will be created on first write)
          index = new GitIndex()
        }
      } else {
        // Check if magic bytes are invalid (corrupted/invalid index)
        // A valid index file must start with 'DIRC' magic bytes
        if (indexBuffer.length >= 4) {
          const magic = indexBuffer.toString('utf8', 0, 4)
          if (magic !== 'DIRC') {
            // Invalid magic bytes - check if first 4 bytes are zeros (common corruption pattern)
            const magicBytes = indexBuffer.slice(0, 4)
            const isMagicZeros = magicBytes.every(byte => byte === 0)
            if (isMagicZeros) {
              // Magic bytes are zeros - file is corrupted/empty, return empty index
              index = new GitIndex()
            } else {
              // Otherwise, try to parse and let GitIndex.fromBuffer() throw the appropriate error
              index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
            }
          } else {
            // Valid magic bytes - parse the index
            index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
          }
        } else {
          // Buffer too short - return empty index
          index = new GitIndex()
        }
      }
    } else {
      // Fallback to fs-based read (handles empty files internally)
      const { readIndex } = await import('../git/index/readIndex.ts')
      index = await readIndex({
        fs: this._fs,
        gitdir,
      })
    }
    
    // Only update the owned instance and its mtime if readIndex() succeeded
    // If readIndex() threw an error, we should not update the cache
    this._index = index
    // Update mtime only for filesystem backends (non-filesystem backends handle caching internally)
    if (!this._gitBackend) {
      try {
        const stat = await normalizedFs.lstat(indexPath)
        // Handle both normalized and raw stat objects
        const mtimeSeconds = (stat as any).mtimeSeconds ?? (stat as any).mtime?.seconds ?? ((stat as any).mtime?.getTime ? (stat as any).mtime.getTime() / 1000 : null) ?? null
        const mtimeNanoseconds = (stat as any).mtimeNanoseconds ?? (stat as any).mtime?.nanoseconds ?? 0
        if (mtimeSeconds !== null && mtimeSeconds !== undefined) {
          this._indexMtime = mtimeSeconds * 1000 + (mtimeNanoseconds || 0) / 1000000
        } else {
          this._indexMtime = null
        }
      } catch {
        this._indexMtime = null
      }
    } else {
      // For non-filesystem backends, set mtime to null (backend handles caching)
      this._indexMtime = null
    }
    
    // Record index-read mutation
    try {
      const { getStateMutationStream } = await import('./StateMutationStream.ts')
      const { normalize } = await import('./GitPath.ts')
      const mutationStream = getStateMutationStream()
      const normalizedGitdir = normalize(gitdir)
      mutationStream.record({
        type: 'index-read',
        gitdir: normalizedGitdir,
        data: {},
      })
    } catch {
      // Ignore errors in mutation recording
    }
    
    // Check for unmerged paths if allowUnmerged is false
    // unmergedPaths is a getter that returns an array, so use .length
    if (!allowUnmerged && index.unmergedPaths.length > 0) {
      const { UnmergedPathsError } = await import('../errors/UnmergedPathsError.ts')
      throw new UnmergedPathsError(index.unmergedPaths)
    }
    
    return index
  }

  /**
   * Writes the index directly to the .git/index file
   * This is the single source of truth - writes directly to disk
   * 
   * CRITICAL: After writing, updates the repository's owned index instance.
   * This ensures that subsequent readIndexDirect() calls return the same modified
   * instance, even if filesystem mtime resolution causes the stale check to pass.
   * 
   * Delegates to src/git/index/writeIndex.ts for the actual write operation.
   */
  async writeIndexDirect(index: GitIndex, gitdirOverride?: string): Promise<void> {
    const gitdir = gitdirOverride || await this.getGitdir()
    const normalizedFs = createFileSystem(this._fs)
    const { join } = await import('./GitPath.ts')
    
    // Write to backend if available, otherwise fallback to fs
    if (this._gitBackend) {
      // Convert GitIndex to UniversalBuffer and write via backend
      const objectFormat = await this.getObjectFormat()
      const indexBuffer = await index.toBuffer(objectFormat)
      await this._gitBackend.writeIndex(indexBuffer)
    } else {
      // Fallback to fs-based write
      const { writeIndex } = await import('../git/index/writeIndex.ts')
      await writeIndex({
        fs: this._fs,
        gitdir,
        index,
      })
    }
    
    // CRITICAL: Update the repository's owned instance and its mtime
    // This ensures that subsequent readIndexDirect() calls return this exact
    // modified instance, solving the race condition where add() modifies the
    // index but status() reads a stale cached version
    this._index = index
    // Update mtime only for filesystem backends (non-filesystem backends handle caching internally)
    if (!this._gitBackend) {
      const indexPath = join(gitdir, 'index')
      try {
        const stat = await normalizedFs.lstat(indexPath)
        // Handle both normalized and raw stat objects
        const mtimeSeconds = (stat as any).mtimeSeconds ?? (stat as any).mtime?.seconds ?? ((stat as any).mtime?.getTime ? (stat as any).mtime.getTime() / 1000 : null) ?? null
        const mtimeNanoseconds = (stat as any).mtimeNanoseconds ?? (stat as any).mtime?.nanoseconds ?? 0
        if (mtimeSeconds !== null && mtimeSeconds !== undefined) {
          this._indexMtime = mtimeSeconds * 1000 + (mtimeNanoseconds || 0) / 1000000
        } else {
          this._indexMtime = null
        }
      } catch (e) {
        this._indexMtime = null
      }
    } else {
      // For non-filesystem backends, set mtime to null (backend handles caching)
      this._indexMtime = null
    }
    
    // Record index-write mutation
    try {
      const { getStateMutationStream } = await import('./StateMutationStream.ts')
      const { normalize } = await import('./GitPath.ts')
      const mutationStream = getStateMutationStream()
      const normalizedGitdir = normalize(gitdir)
      mutationStream.record({
        type: 'index-write',
        gitdir: normalizedGitdir,
        data: {},
      })
    } catch {
      // Ignore errors in mutation recording
    }
  }

  /**
   * Resolves a ref to an OID
   * Uses src/git/refs/resolveRef directly
   */
  async resolveRef(ref: string, depth?: number): Promise<string> {
    return this.resolveRefDirect(ref, depth)
  }

  /**
   * Resolves a ref directly using src/git/refs/resolveRef
   * This is the single source of truth for ref resolution
   * Handles worktree context correctly (HEAD in worktree gitdir, other refs in main gitdir)
   */
  async resolveRefDirect(ref: string, depth?: number): Promise<string> {
    // Use backend - it handles worktree context internally
    if (this._gitBackend) {
      const result = await this._gitBackend.readRef(ref, depth, this.cache)
      if (result === null) {
        const { NotFoundError } = await import('../errors/NotFoundError.ts')
        throw new NotFoundError(`Ref '${ref}' not found`)
      }
      return result
    }
    
    // Fallback: should not happen if Repository is properly initialized
    throw new Error('GitBackend is required for resolveRef')
  }

  /**
   * Reads a symbolic ref and returns its target without resolving to OID
   * Uses src/git/refs/readSymbolicRef directly
   * Handles worktree context correctly (HEAD in worktree gitdir, other refs in main gitdir)
   */
  async readSymbolicRef(ref: string): Promise<string | null> {
    return this.readSymbolicRefDirect(ref)
  }

  /**
   * Reads a symbolic ref directly using backend
   * The backend handles worktree context internally
   */
  async readSymbolicRefDirect(ref: string): Promise<string | null> {
    // Use backend - it handles worktree context internally
    if (this._gitBackend) {
      return this._gitBackend.readSymbolicRef(ref)
    }
    
    // Fallback: should not happen if Repository is properly initialized
    throw new Error('GitBackend is required for readSymbolicRef')
  }

  /**
   * Lists refs matching a prefix
   * Uses src/git/refs/listRefs directly
   */
  async listRefs(filepath: string): Promise<string[]> {
    return this.listRefsDirect(filepath)
  }

  /**
   * Lists refs directly using backend
   * The backend handles worktree context internally (refs are in main gitdir)
   */
  async listRefsDirect(filepath: string): Promise<string[]> {
    // Use backend - it handles worktree context internally
    // Note: listRefs always uses main gitdir, even in worktrees
    if (this._gitBackend) {
      return this._gitBackend.listRefs(filepath)
    }
    
    // Fallback: should not happen if Repository is properly initialized
    throw new Error('GitBackend is required for listRefs')
  }

  /**
   * Writes a ref
   * Uses src/git/refs/writeRef directly
   */
  async writeRef(ref: string, value: string, skipReflog = false): Promise<void> {
    return this.writeRefDirect(ref, value, skipReflog)
  }

  /**
   * Writes a ref directly using backend or src/git/refs/writeRef
   * This is the single source of truth for writing refs
   * Handles worktree context correctly (HEAD in worktree gitdir, other refs in main gitdir)
   */
  async writeRefDirect(ref: string, value: string, skipReflog = false): Promise<void> {
    // CRITICAL: Validate OID format - use dynamic length based on object format
    // Trim whitespace first to handle any accidental whitespace
    const trimmedValue = value.trim()
    
    // Get object format for validation
    const objectFormat = await this.getObjectFormat()
    
    // Use validateOid for format-aware validation
    const { validateOid } = await import('../utils/detectObjectFormat.ts')
    if (!validateOid(trimmedValue, objectFormat)) {
      const { InvalidOidError } = await import('../errors/InvalidOidError.ts')
      const { getOidLength } = await import('../utils/detectObjectFormat.ts')
      const expectedLength = getOidLength(objectFormat)
      throw new InvalidOidError(
        `Invalid value for ref "${ref}": Not a ${expectedLength}-char OID. Got "${trimmedValue}" (length: ${trimmedValue.length})`
      )
    }
    
    // Use backend - it handles worktree context internally
    if (this._gitBackend) {
      return this._gitBackend.writeRef(ref, trimmedValue, skipReflog, this.cache)
    }
    
    // Fallback: should not happen if Repository is properly initialized
    throw new Error('GitBackend is required for writeRef')
  }

  /**
   * Writes a symbolic ref directly using backend
   * The backend handles worktree context internally
   */
  async writeSymbolicRefDirect(ref: string, value: string, oldOid?: string): Promise<void> {
    // Use backend - it handles worktree context internally
    if (this._gitBackend) {
      return this._gitBackend.writeSymbolicRef(ref, value, oldOid, this.cache)
    }
    
    // Fallback: should not happen if Repository is properly initialized
    throw new Error('GitBackend is required for writeSymbolicRef')
  }

  /**
   * Deletes a ref directly using backend
   * The backend handles worktree context internally
   */
  async deleteRefDirect(ref: string): Promise<void> {
    // Use backend - it handles worktree context internally
    if (this._gitBackend) {
      return this._gitBackend.deleteRef(ref, this.cache)
    }
    
    // Fallback: should not happen if Repository is properly initialized
    throw new Error('GitBackend is required for deleteRef')
  }

  /**
   * Gets the current worktree
   * Returns null for bare repositories
   * @internal - Use getWorktreeSync() to avoid method name collision with async version
   */
  getWorktreeSync(): Worktree | null {
    // If worktree backend is provided, we have a worktree (even if _dir is null)
    // The worktree backend itself represents the working directory
    if (this._worktreeBackend) {
      // Get dir from worktree backend if _dir is not set
      if (!this._dir && this._worktreeBackend.getDirectory) {
        const worktreeDir = this._worktreeBackend.getDirectory()
        if (worktreeDir) {
          this._dir = worktreeDir
        }
      }
    }
    
    // If we have a worktree backend, we have a worktree (even if _dir is null)
    // Otherwise, check if _dir is set
    if (!this._dir && !this._worktreeBackend) {
      return null // Bare repository has no worktree
    }
    if (!this._worktree) {
      // Create worktree with current dir and gitdir
      // Note: gitdir will be resolved when needed
      // If _dir is still null but _worktreeBackend exists, get it from the backend
      const worktreeDir = this._dir || (this._worktreeBackend?.getDirectory?.() || '')
      this._worktree = new Worktree(this, worktreeDir, this._gitdir, null, this._worktreeBackend || undefined)
    }
    return this._worktree
  }

  /**
   * Gets the current worktree as a property
   * Returns null for bare repositories
   */
  get worktree(): Worktree | null {
    return this.getWorktreeSync()
  }

  /**
   * Gets the current worktree (synchronous version)
   * Returns null for bare repositories
   * This is the public API - the async version with ref parameter is for finding worktrees by ref
   */
  getWorktree(): Worktree | null {
    return this.getWorktreeSync()
  }

  /**
   * Creates a new linked worktree
   * 
   * Repository is a thin wrapper around:
   * - 1 GitBackend (always present)
   * - Multiple linked worktree checkouts, each with its own WorktreeBackend
   * 
   * Native Git structure:
   * - Main worktree: `<repo>/.git/index`
   * - Linked worktree: 
   *   - gitdir: `<repo>/.git/worktrees/<name>`
   *   - `<worktree-dir>/.git` is a file containing path to gitdir
   *   - Index at `<gitdir>/index`
   *   - HEAD at `<gitdir>/HEAD`
   * 
   * @param worktreeDir - Directory for the new worktree
   * @param ref - Branch, tag, or commit to checkout (defaults to HEAD)
   * @param name - Name for the worktree (defaults to basename of worktreeDir)
   * @param options - Additional options
   * @param options.worktreeBackendFactory - Factory function to create WorktreeBackend instance (optional, defaults to filesystem)
   * @param options.worktreeBackend - Pre-created WorktreeBackend instance (optional, overrides factory)
   */
  async createWorktree(
    worktreeDir: string,
    ref: string = 'HEAD',
    name?: string,
    options: {
      force?: boolean
      detach?: boolean
      checkout?: boolean
      worktreeBackendFactory?: (dir: string) => Promise<GitWorktreeBackend> | GitWorktreeBackend
      worktreeBackend?: GitWorktreeBackend
    } = {}
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    const { normalize: normalizePath } = await import('./GitPath.ts')
    const normalizedWorktreeDir = normalizePath(worktreeDir)
    
    // Determine worktree name
    const worktreeName = name || normalizedWorktreeDir.split('/').pop() || 'worktree'
    
    // Validate worktree name (must be valid directory name)
    if (!/^[a-zA-Z0-9._-]+$/.test(worktreeName)) {
      throw new Error(`Invalid worktree name: ${worktreeName}`)
    }
    
    // Check if worktree directory is within the current worktree root
    // If not, we must use fs directly (worktreeBackend only handles paths relative to its root)
    const currentWorktree = this.getWorktree()
    const currentWorktreeDir = currentWorktree?.dir || this._dir
    const isWithinWorktree = currentWorktreeDir && normalizedWorktreeDir.startsWith(currentWorktreeDir)
    
    // Check if worktree directory already exists
    // Use worktreeBackend only if the path is within the current worktree root
    // For linked worktrees outside main worktree, we need fs
    if (!this.fs && !(this._worktreeBackend && isWithinWorktree)) {
      throw new Error('Cannot create worktree: filesystem is required for linked worktrees outside main worktree. Checkout to a WorktreeBackend first.')
    }
    
    const worktreeDirExists = (this._worktreeBackend && isWithinWorktree)
      ? await this._worktreeBackend.exists(normalizedWorktreeDir.substring(currentWorktreeDir!.length + 1))
      : await this.fs!.exists(normalizedWorktreeDir)
    
    if (worktreeDirExists) {
      if (!options.force) {
        throw new Error(`Worktree directory already exists: ${normalizedWorktreeDir}`)
      }
      // Force: remove existing directory
      if (this._worktreeBackend && isWithinWorktree) {
        await this._worktreeBackend.rm(normalizedWorktreeDir.substring(currentWorktreeDir!.length + 1), { recursive: true })
      } else {
        await this.fs!.rm(normalizedWorktreeDir)
      }
    }
    
    // Create worktree directory
    // Use worktreeBackend only if the path is within the current worktree root
    // Otherwise, use fs directly (for linked worktrees outside the main worktree)
    if (this._worktreeBackend && isWithinWorktree) {
      // Path is relative to worktree root
      const relativePath = normalizedWorktreeDir.substring(currentWorktreeDir!.length + 1)
      await this._worktreeBackend.mkdir(relativePath)
    } else {
      // Path is absolute or outside worktree root - use fs directly
      await this.fs!.mkdir(normalizedWorktreeDir)
    }
    
    // Create worktree gitdir structure using GitBackend
    // This is part of the Git repository structure, so it belongs in GitBackend
    // GitBackend handles all gitdir operations, including creating the worktree gitdir
    // and writing the gitdir file. The worktree directory path is provided to GitBackend
    // so it can write the reverse mapping, but GitBackend doesn't manipulate the worktree itself.
    if (!this._gitBackend) {
      throw new Error('GitBackend is required to create worktrees')
    }
    const worktreeGitdir = await this._gitBackend.createWorktreeGitdir(worktreeName, normalizedWorktreeDir)
    
    // Get the worktree gitdir path for writing the .git file in the worktree directory
    // This is the only place we need to access the path - to write the .git file
    const worktreeGitdirPath = worktreeGitdir.getPath()
    
    // Write <worktree-dir>/.git file containing path to worktree gitdir
    // Use worktreeBackend only if the path is within the current worktree root
    // Otherwise, use fs directly (for linked worktrees outside the main worktree)
    const gitFile = join(normalizedWorktreeDir, '.git')
    const gitFileContent = UniversalBuffer.from(worktreeGitdirPath, 'utf8')
    if (this._worktreeBackend && isWithinWorktree && currentWorktreeDir) {
      // Path is relative to worktree root
      const relativePath = normalizedWorktreeDir.substring(currentWorktreeDir.length + 1) + '/.git'
      await this._worktreeBackend.write(relativePath, gitFileContent)
    } else {
      // Path is absolute or outside worktree root - use fs directly
      if (!this.fs) {
        throw new Error('Cannot create worktree: filesystem is required for linked worktrees outside main worktree. Checkout to a WorktreeBackend first.')
      }
      await this.fs.write(gitFile, gitFileContent)
    }
    
    // Resolve ref to commit OID using GitBackend
    const resolved = await this._gitBackend.readRef(ref, 5, this.cache)
    if (!resolved) {
      throw new Error(`Cannot resolve ref '${ref}'`)
    }
    const commitOid = resolved
    
    // Write HEAD in worktree gitdir using GitBackend
    await this._gitBackend.writeWorktreeHEAD(worktreeGitdir, commitOid)
    
    // Get the worktree gitdir path for Worktree constructor
    // The WorktreeGitdir interface is opaque, but we need the path for Worktree
    const worktreeGitdirPathForWorktree = worktreeGitdir.getPath()
    
    // Create WorktreeBackend for this worktree
    // If worktreeBackend is provided, use it; otherwise use factory or default to filesystem
    let worktreeBackend: GitWorktreeBackend
    if (options.worktreeBackend) {
      worktreeBackend = options.worktreeBackend
    } else if (options.worktreeBackendFactory) {
      const factoryResult = options.worktreeBackendFactory(normalizedWorktreeDir)
      worktreeBackend = await Promise.resolve(factoryResult)
    } else {
      // Default to filesystem backend
      if (!this.fs) {
        throw new Error('Cannot create worktree: filesystem is required. Checkout to a WorktreeBackend first.')
      }
      const { createGitWorktreeBackend } = await import('../git/worktree/index.ts')
      worktreeBackend = createGitWorktreeBackend({
        fs: this.fs,
        dir: normalizedWorktreeDir,
        name: worktreeName,
      })
    }
    
    // Ensure the backend has the name set (in case it was provided or created by factory)
    if (worktreeBackend && !('name' in worktreeBackend) || worktreeBackend.name !== worktreeName) {
      // If the backend doesn't support name or has a different name, we can't set it
      // This is okay for backends that don't support names, but we should log a warning
      // For now, we'll just ensure GitWorktreeFs backends have the name
      if (worktreeBackend instanceof (await import('../git/worktree/fs/GitWorktreeFs.ts')).GitWorktreeFs) {
        // The name is set in the constructor, so this should already be set
        // But we can't modify readonly properties, so we rely on the constructor
      }
    }
    
    // Set Repository reference on WorktreeBackend for submodule delegation
    if (worktreeBackend && 'setRepository' in worktreeBackend) {
      (worktreeBackend as any).setRepository(this)
    }
    
    // Create Worktree instance with its own WorktreeBackend
    // Note: worktreeGitdir is an opaque interface - Worktree doesn't need to know about it
    const worktree = new Worktree(this, normalizedWorktreeDir, worktreeGitdirPathForWorktree, worktreeName, worktreeBackend)
    
    // Store worktree in map (keyed by name)
    this._worktrees.set(worktreeName, worktree)
    
    // Checkout files to worktree directory if requested
    if (options.checkout !== false) {
      await worktree.checkout(ref, {
        force: options.force,
        noUpdateHead: true, // HEAD already set above
      })
    }
    
    return worktree
  }
  
  /**
   * Finds a worktree by the ref it's checked out to
   * Searches all worktrees (main + linked) to find which one has the specified ref checked out
   * @param ref - Branch name, tag name, or commit SHA to search for
   * @returns Worktree instance or null if no worktree is checked out to this ref
   */
  async findWorktreeByRef(ref: string): Promise<Worktree | null> {
    // Guard against empty string ref
    if (typeof ref !== 'string' || ref === '') {
      throw new Error(`findWorktreeByRef(ref) requires a non-empty string ref, got: ${ref}`)
    }
    // Normalize ref (e.g., 'main' -> 'refs/heads/main')
    const normalizedRef = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`
    
    // Import direct functions to read from specific worktree gitdirs
    const { readSymbolicRef, resolveRef } = await import('../git/refs/readRef.ts')
    
    // Check all worktrees (main + linked)
    const allWorktrees = this.listWorktrees()
    
    for (const worktree of allWorktrees) {
      const worktreeGitdir = await worktree.getGitdir()
      
      // Read HEAD from this worktree's gitdir
      // Use GitBackend if available, otherwise require fs
      try {
        if (this._gitBackend) {
          // Use GitBackend to read HEAD directly from worktree gitdir
          // Note: This requires GitBackend to support reading from worktree gitdirs
          // For now, we'll use fs if available
          if (this.fs) {
            const headRef = await readSymbolicRef({ fs: this.fs, gitdir: worktreeGitdir, ref: 'HEAD' })
            if (headRef === normalizedRef || headRef === ref) {
              return worktree
            }
            
            // If HEAD is detached, try to resolve to commit OID
            const headOid = await resolveRef({ fs: this.fs, gitdir: worktreeGitdir, ref: 'HEAD', depth: 1 })
            if (headOid && (headOid === ref || headOid.startsWith(ref))) {
              return worktree
            }
          }
        } else if (this.fs) {
          // Fallback to fs-based reading
          const headRef = await readSymbolicRef({ fs: this.fs, gitdir: worktreeGitdir, ref: 'HEAD' })
          if (headRef === normalizedRef || headRef === ref) {
            return worktree
          }
          
          // If HEAD is detached, try to resolve to commit OID
          const headOid = await resolveRef({ fs: this.fs, gitdir: worktreeGitdir, ref: 'HEAD', depth: 1 })
          if (headOid && (headOid === ref || headOid.startsWith(ref))) {
            return worktree
          }
        }
      } catch {
        // Worktree HEAD doesn't exist or can't be read - skip
        continue
      }
    }
    
    return null
  }

  /**
   * Gets a worktree by name
   * Uses the worktree backend's name property to find the worktree
   * @param name - Worktree name to search for
   * @returns Worktree instance or null if no worktree with that name exists
   */
  getWorktreeByName(name: string): Worktree | null {
    // First check the named worktrees map (linked worktrees are stored by name)
    if (this._worktrees.has(name)) {
      return this._worktrees.get(name)!
    }
    
    // Check if the main worktree backend has this name
    if (this._worktreeBackend && this._worktreeBackend.name === name) {
      return this.getWorktreeSync()
    }
    
    // Check all linked worktrees by backend name
    for (const worktree of this._worktrees.values()) {
      if (worktree.backend && worktree.backend.name === name) {
        return worktree
      }
    }
    
    return null
  }

  /**
   * Gets a worktree by its directory path
   * @param dir - Worktree directory path
   * @returns Worktree instance or null if not found
   */
  getWorktreeByPath(dir: string): Worktree | null {
    const { normalize: normalizePath } = require('./GitPath.ts')
    const normalizedDir = normalizePath(dir)
    
    // Check main worktree
    if (this._worktree) {
      const mainDir = normalizePath(this._worktree.dir)
      if (mainDir === normalizedDir) {
        return this._worktree
      }
    }
    
    // Check linked worktrees
    for (const worktree of this._worktrees.values()) {
      const worktreeDir = normalizePath(worktree.dir)
      if (worktreeDir === normalizedDir) {
        return worktree
      }
    }
    
    return null
  }
  
  /**
   * Lists all worktrees (including main worktree if present)
   * @returns Array of Worktree instances
   */
  listWorktrees(): Worktree[] {
    const worktrees: Worktree[] = []
    if (this._worktree) {
      worktrees.push(this._worktree)
    }
    for (const worktree of this._worktrees.values()) {
      if (worktree !== this._worktree) {
        worktrees.push(worktree)
      }
    }
    return worktrees
  }

  /**
   * Gets all worktrees as a property
   * @returns Array of Worktree instances
   */
  get worktrees(): Worktree[] {
    return this.listWorktrees()
  }

  /**
   * Invalidates cached data (useful after operations that modify the repo)
   * Note: Index cache is managed by this Repository instance and will be automatically
   * refreshed when stale, so we don't need to invalidate it here.
   */
  async invalidateCache(): Promise<void> {
    this._isBare = null
    // Config is now loaded on-demand, no need to reload
    // This method is kept for backward compatibility
  }

  /**
   * Performs a merge operation using this repository's context
   * This ensures all operations use the same config, cache, and error context
   */
  async merge(params: {
    ours?: string
    theirs: string
    fastForward?: boolean
    fastForwardOnly?: boolean
    dryRun?: boolean
    noUpdateBranch?: boolean
    abortOnConflict?: boolean
    message?: string
    author?: Partial<import('../models/GitCommit.ts').Author>
    committer?: Partial<import('../models/GitCommit.ts').Author>
    signingKey?: string
    onSign?: import('./Signing.ts').SignCallback
    allowUnrelatedHistories?: boolean
    mergeDriver?: import('../git/merge/types.ts').MergeDriverCallback
  }): Promise<import('../commands/merge.ts').MergeResult> {
    // Import _merge and error classes in the same context to ensure proper error recognition
    const { _merge } = await import('../commands/merge.ts')
    // Import error classes to ensure they're in the same module context
    const { MergeConflictError } = await import('../errors/MergeConflictError.ts')
    const { UnmergedPathsError } = await import('../errors/UnmergedPathsError.ts')
    try {
      return await _merge({
        ...params,
        repo: this as Repository, // Pass Repository instance for consistent context
      })
    } catch (err: any) {
      // Re-throw all errors as-is to preserve their type and code
      // The error should already have the correct code set from _merge
      throw err
    }
  }

  /**
   * Aborts a merge in progress using this repository's context
   */
  async abortMerge(params?: {
    commit?: string
  }): Promise<void> {
    const { abortMerge: _abortMerge } = await import('../commands/abortMerge.ts')
    const gitdir = await this.getGitdir()
    if (!this._dir) {
      throw new Error('Cannot abort merge in bare repository')
    }
    if (!this.fs) {
      throw new Error('Cannot abort merge: filesystem is required. Checkout to a WorktreeBackend first.')
    }
    return _abortMerge({
      ...params,
      fs: this.fs,
      dir: this._dir,
      gitdir,
      cache: this.cache,
    })
  }

  /**
   * Analyzes what changes are needed to checkout a tree to the working directory
   * This ensures all operations use the same config, cache, and error context
   */
  async analyzeCheckout(params: {
    treeOid: string
    filepaths?: string[]
    force?: boolean
    sparsePatterns?: string[]
  }): Promise<Array<['create' | 'update' | 'delete' | 'delete-index' | 'mkdir' | 'conflict' | 'keep', string, ...unknown[]]>> {
    const gitdir = await this.getGitdir()
    const { WorkdirManager } = await import('../git/worktree/WorkdirManager.ts')
    
    // Ensure index is synchronized before analysis
    // This ensures that any staged changes are visible to analyzeCheckout
    // Read index to ensure it's loaded into cache
    const index = await this.readIndexDirect(false, true, gitdir)
    const _ = index.entriesMap.size
    
    // Ensure dir is defined for analyzeCheckout
    if (!this._dir) {
      throw new Error('Repository dir is required for analyzeCheckout')
    }
    return await WorkdirManager.analyzeCheckout({
      fs: this.fs,
      dir: this._dir,
      gitdir,
      cache: this.cache, // Use Repository's cache
      index, // Pass the index object
      ...params,
    })
  }

  /**
   * Initialize this repository
   * 
   * Initializes a new Git repository. If the repository is already initialized,
   * this is a no-op.
   * 
   * @param options - Init options
   * @param options.bare - If true, create a bare repository (default: false)
   * @param options.defaultBranch - Default branch name (default: 'master')
   * @param options.objectFormat - Object format ('sha1' or 'sha256', default: 'sha1')
   */
  async init(options: {
    bare?: boolean
    defaultBranch?: string
    objectFormat?: 'sha1' | 'sha256'
  } = {}): Promise<void> {
    const { _init } = await import('../commands/init.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    
    // For non-bare repos, fs is required
    // For bare repos, we can use GitBackend directly
    if (!options.bare && !this.fs) {
      throw new Error('Cannot initialize non-bare repository: filesystem is required. Checkout to a WorktreeBackend first or provide fs.')
    }
    
    await _init({
      fs: this.fs || undefined,
      bare: options.bare ?? false,
      dir: options.bare ? undefined : (dir || undefined),
      gitdir,
      defaultBranch: options.defaultBranch || 'master',
      objectFormat: options.objectFormat || 'sha1',
      backend: this._gitBackend || undefined,
    })
    
    // After init, ensure we have a GitBackend
    if (!this._gitBackend) {
      if (!this.fs) {
        throw new Error('Cannot create FilesystemBackend: filesystem is required. Checkout to a WorktreeBackend first or provide fs.')
      }
      const { FilesystemBackend } = await import('../backends/index.ts')
      this._gitBackend = new FilesystemBackend(this.fs, gitdir)
    }
  }

  /**
   * Checkout to a WorktreeBackend, creating a clean staging area
   * 
   * This method allows you to checkout to a WorktreeBackend even if the repository
   * is empty (no commits yet). It creates a clean staging area where files can be
   * added, staged, and committed like normal Git.
   * 
   * If the repository is empty, this will:
   * 1. Set the WorktreeBackend as the main worktree
   * 2. Create an empty index (staging area)
   * 3. Set HEAD to point to the default branch (if not already set)
   * 
   * If the repository has commits, this will checkout the specified ref to the
   * WorktreeBackend.
   * 
   * @param worktreeBackend - The WorktreeBackend to checkout to
   * @param options - Checkout options
   * @param options.ref - Branch name, tag name, or commit SHA (default: 'HEAD' or default branch)
   * @param options.filepaths - Limit checkout to specific files/directories
   * @param options.force - Force checkout, overwriting local changes
   * @param options.noCheckout - If true, update HEAD but don't update working directory
   * @param options.noUpdateHead - If true, update working directory but don't update HEAD
   * @param options.dryRun - Simulate checkout without making changes
   * @param options.sparsePatterns - Sparse checkout patterns
   * @param options.onProgress - Progress callback
   * @param options.remote - Remote name for tracking branches
   * @param options.track - Set up branch tracking (default: true)
   */
  async checkout(
    worktreeBackend: GitWorktreeBackend,
    options?: {
      ref?: string
      filepaths?: string[]
      force?: boolean
      noCheckout?: boolean
      noUpdateHead?: boolean
      dryRun?: boolean
      sparsePatterns?: string[]
      onProgress?: ProgressCallback
      remote?: string
      track?: boolean
    }
  ): Promise<void>
  /**
   * Checks out a branch, tag, or commit in the current worktree
   * Delegates to worktree.checkout() to ensure proper worktree context
   * 
   * @param ref - Branch name, tag name, or commit SHA
   * @param options - Checkout options
   */
  async checkout(
    ref: string,
    options?: {
      filepaths?: string[]
      force?: boolean
      noCheckout?: boolean
      noUpdateHead?: boolean
      dryRun?: boolean
      sparsePatterns?: string[]
      onProgress?: ProgressCallback
      remote?: string
      track?: boolean
    }
  ): Promise<void>
  async checkout(
    refOrWorktree: string | GitWorktreeBackend,
    options: {
      ref?: string
      filepaths?: string[]
      force?: boolean
      noCheckout?: boolean
      noUpdateHead?: boolean
      dryRun?: boolean
      sparsePatterns?: string[]
      onProgress?: ProgressCallback
      remote?: string
      track?: boolean
    } = {}
  ): Promise<void> {
    const opts = options || {}
    // Overload: checkout(WorktreeBackend, options)
    if (typeof refOrWorktree !== 'string') {
      const worktreeBackend = refOrWorktree
      const gitdir = await this.getGitdir()
      
      // Set the WorktreeBackend as the main worktree
      this._worktreeBackend = worktreeBackend
      if (worktreeBackend.setRepository) {
        worktreeBackend.setRepository(this)
      }
      
      // Note: fs is now only available through WorktreeBackend.getFileSystem()
      // The fs getter will retrieve it from WorktreeBackend after checkout
      // This ensures fs is only available after checkout to a WorktreeBackend
      
      // Get the directory from the WorktreeBackend
      const dir = worktreeBackend.getDirectory?.() || null
      if (dir) {
        this._dir = dir
      }
      
      // Create Worktree instance
      const { Worktree } = await import('./Worktree.ts')
      this._worktree = new Worktree(this, dir || '', worktreeBackend)
      
      // Determine which ref to checkout
      // If ref is provided, use it; otherwise default to HEAD or default branch
      let targetRef: string
      if (opts.ref) {
        targetRef = opts.ref
      } else {
        // Try to get current branch from HEAD
        try {
          const headRef = await this.readSymbolicRef('HEAD')
          if (headRef && headRef.startsWith('refs/heads/')) {
            targetRef = headRef
          } else {
            // HEAD is detached or doesn't exist, use default branch
            let defaultBranch = 'master'
            try {
              const configValue = await this.getConfigValue('init.defaultBranch')
              if (configValue) {
                defaultBranch = configValue
              }
            } catch {
              // Use default
            }
            targetRef = defaultBranch
          }
        } catch {
          // HEAD doesn't exist, use default branch
          let defaultBranch = 'master'
          try {
            const configValue = await this.getConfigValue('init.defaultBranch')
            if (configValue) {
              defaultBranch = configValue
            }
          } catch {
            // Use default
          }
          targetRef = defaultBranch
        }
      }
      
      // Normalize ref (e.g., 'main' -> 'refs/heads/main')
      const normalizedRef = targetRef.startsWith('refs/') ? targetRef : `refs/heads/${targetRef}`
      
      // Check if repository is empty (no commits)
      // Try to resolve the target ref to a commit OID
      let isEmpty = false
      try {
        const refOid = await this.resolveRef(normalizedRef)
        // If ref resolves but the commit doesn't exist, it's still empty
        if (refOid) {
          const { readObject } = await import('../git/objects/readObject.ts')
          try {
            await readObject({ fs: this.fs, gitdir, oid: refOid })
            // Commit exists, repository is not empty
            isEmpty = false
          } catch {
            // Commit doesn't exist, repository is empty
            isEmpty = true
          }
        } else {
          isEmpty = true
        }
      } catch {
        // Ref doesn't resolve, repository is empty
        isEmpty = true
      }
      
      if (isEmpty) {
        // Empty repository: create clean staging area
        const { GitIndex } = await import('../git/index/GitIndex.ts')
        const emptyIndex = new GitIndex()
        await this.writeIndexDirect(emptyIndex, gitdir)
        
        // Set HEAD to point to the specified ref (or default branch)
        // For empty repositories, we just set HEAD to point to the branch ref
        // without creating the ref itself (since there's no commit to point to)
        if (normalizedRef.startsWith('refs/heads/')) {
          // Just set HEAD to point to the branch - don't create the ref yet
          await this.writeSymbolicRefDirect('HEAD', `ref: ${normalizedRef}`)
        } else {
          // For tags or other refs, just set HEAD to point to it
          await this.writeSymbolicRefDirect('HEAD', normalizedRef)
        }
      } else {
        // Repository has commits: perform normal checkout
        const { _checkout } = await import('../commands/checkout.ts')
        const dir = worktreeBackend.getDirectory?.()
        if (!dir) {
          throw new Error('WorktreeBackend must provide a directory for checkout')
        }
        
        await _checkout({
          fs: this.fs,
          cache: this.cache,
          dir,
          gitdir,
          ref: targetRef, // Use the original ref format (not normalized)
          filepaths: options.filepaths,
          force: options.force,
          noCheckout: options.noCheckout,
          noUpdateHead: options.noUpdateHead,
          dryRun: options.dryRun,
          sparsePatterns: options.sparsePatterns,
          onProgress: options.onProgress,
          remote: options.remote || 'origin',
          track: options.track !== false,
        })
      }
      
      return
    }
    
    // Overload: checkout(ref, options)
    const ref = refOrWorktree
    const worktree = this.getWorktree()
    if (!worktree) {
      throw new Error('Cannot checkout in bare repository')
    }
    await worktree.checkout(ref, opts)
  }

  /**
   * Enable worker thread support with swappable transport
   * This allows git operations to run in worker threads, keeping the main thread unblocked
   * 
   * @param transport - Transport instance or options (defaults to LocalTransport)
   * @param maxWorkers - Maximum number of worker threads (default: 4)
   * @param workerScript - Path to worker script (default: auto-detected)
   */
  enableWorkers(
    transport?: Transport | TransportOptions,
    maxWorkers: number = 4,
    workerScript?: string
  ): void {
    // Auto-detect worker script path if not provided
    const scriptPath = workerScript || (() => {
      // Try to resolve worker script relative to current module
      try {
        // In Node.js, try to find the compiled worker
        if (typeof require !== 'undefined') {
          const path = require('path')
          const url = require('url')
          // Get the directory of the current file
          const currentFile = url.fileURLToPath(import.meta.url || 'file://' + __filename)
          const currentDir = path.dirname(currentFile)
          const workerPath = path.join(currentDir, '../workers/git-worker.js')
          return workerPath
        }
      } catch {
        // Fallback - try to resolve from package
        try {
          if (typeof require !== 'undefined') {
            const path = require('path')
            // Try to resolve from node_modules
            const resolved = require.resolve('@awesome-os/universal-git-src/workers/git-worker.js')
            return resolved
          }
        } catch {
          // Final fallback
        }
      }
      return './workers/git-worker.js'
    })()
    // Use local transport by default (simple, no BroadcastChannel required)
    const defaultTransport = transport || createDefaultTransport(`git-repo-${this.instanceId}`)
    
    this._transport = typeof defaultTransport === 'object' && defaultTransport !== null && 'getType' in defaultTransport
      ? defaultTransport
      : createTransport(defaultTransport as TransportOptions)
    
    // Create worker pool with transport (transport is optional in WorkerPool constructor)
    this._workerPool = new WorkerPool(maxWorkers, workerScript || scriptPath, this._transport || undefined)
  }

  /**
   * Get the worker pool if workers are enabled
   */
  getWorkerPool(): WorkerPool | undefined {
    return this._workerPool
  }

  /**
   * Get the transport instance if workers are enabled
   */
  getTransport(): Transport | undefined {
    return this._transport
  }

  /**
   * Broadcast a message to all workers using transport
   */
  broadcastToWorkers(message: unknown): void {
    if (this._transport) {
      this._transport.send(message)
    } else if (this._workerPool) {
      this._workerPool.broadcast(message)
    }
  }

  /**
   * Check if workers are enabled
   */
  hasWorkers(): boolean {
    return this._workerPool !== undefined
  }

  /**
   * Get a proxied Repository instance for worker thread execution
   * This creates a Repository in a worker thread and returns a proxy
   */
  async getProxiedRepository(): Promise<ProxiedRepository | undefined> {
    if (!this._workerPool) {
      return undefined
    }

    if (this._proxiedRepository) {
      return this._proxiedRepository
    }

    // Acquire a worker and create Repository in it
    const worker = await this._workerPool.acquire()
    try {
      const gitdir = await this.getGitdir()
      this._proxiedRepository = await worker.call<ProxiedRepository>('createRepository', {
        fs: this._fs, // Note: fs will need to be proxied via Comlink
        dir: this._dir,
        gitdir,
        cache: this.cache,
      })
      return this._proxiedRepository
    } finally {
      this._workerPool.release(worker)
    }
  }

  /**
   * Clean up worker resources
   */
  async cleanupWorkers(): Promise<void> {
    if (this._workerPool) {
      await this._workerPool.terminateAll()
      this._workerPool = undefined
    }
    if (this._transport) {
      this._transport.close()
      this._transport = undefined
    }
    this._proxiedRepository = undefined
  }

  /**
   * Gets a remote backend for a configured remote name.
   * 
   * Repository is the central place for remote backend management.
   * Each remote configured in `.git/config` (via `remote.<name>.url`) is
   * represented as a `GitRemoteBackend` instance, cached per Repository instance.
   * 
   * **URL-Indexed Architecture**:
   * 
   * The `RemoteBackendRegistry` uses URL-indexed caching, enabling easy translation:
   * - **Config → Backend**: This method reads the URL from config (`remote.<name>.url`),
   *   then looks up or creates the backend via `RemoteBackendRegistry.getBackend(url)`
   * - **Backend → Config**: You can get the URL from a backend via `backend.getUrl()`,
   *   then find the config entry by iterating remotes and comparing URLs
   * 
   * The registry caches backends globally by normalized URL, so multiple remotes
   * with the same URL share the same backend instance. Repository caches backends
   * per remote name for quick lookup.
   * 
   * The registry drives backend creation via the remotes config file format.
   * Backends are cached per Repository instance to avoid recreating them.
   * 
   * **URL-Only Mode**:
   * 
   * When `urlOnly: true` is specified, the backend can be created without requiring
   * protocol-specific clients (http, ssh, tcp). This is useful for operations that
   * only need to read or display the remote URL, such as `listRemotes`.
   * 
   * Backends created with `urlOnly: true` can call `getUrl()` to retrieve the URL,
   * but attempting to use `discover()` or `connect()` will fail if the required
   * clients are not provided at that time.
   * 
   * **Full Mode** (default):
   * 
   * When `urlOnly` is `false` or `undefined`, protocol-specific clients must be
   * provided based on the remote URL protocol:
   * - HTTP/HTTPS URLs require `http` client
   * - SSH URLs (ssh:// or git@host:path) require `ssh` client
   * - Git daemon URLs (git://) require `tcp` client
   * 
   * @param name - Remote name (e.g., 'origin', 'upstream')
   * @param options - Optional remote backend options
   * @param options.http - HTTP client for HTTP/HTTPS remotes (required for HTTP operations, optional if `urlOnly: true`)
   * @param options.ssh - SSH client for SSH remotes (required for SSH operations, optional if `urlOnly: true`)
   * @param options.tcp - TCP client for git:// remotes (required for Git daemon operations, optional if `urlOnly: true`)
   * @param options.fs - File system provider (defaults to repository's fs)
   * @param options.auth - Authentication credentials for forge APIs (GitHub, GitLab, etc.)
   * @param options.useRestApi - Whether to use REST API backends for supported forges
   * @param options.urlOnly - If `true`, allows creating backends without clients for URL-only operations (e.g., `listRemotes`)
   * @returns GitRemoteBackend instance for the remote (cached per Repository instance)
   * @throws NotFoundError if remote is not configured in `.git/config`
   * @throws MissingParameterError if required protocol client is missing (when `urlOnly: false` or `undefined`)
   * 
   * @example
   * ```typescript
   * // URL-only mode: Get backend just to read the URL
   * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
   * const originBackend = await repo.getRemote('origin', { urlOnly: true })
   * const url = originBackend.getUrl() // 'https://github.com/user/repo.git'
   * 
   * // Full mode: Get backend with client for actual operations
   * import { http } from 'universal-git/http/web'
   * const originBackend = await repo.getRemote('origin', { http: httpClient })
   * const refs = await originBackend.discover({
   *   service: 'git-upload-pack',
   *   url: 'https://github.com/user/repo.git',
   *   http: httpClient
   * })
   * ```
   */
  async getRemote(
    name: string,
    options?: {
      http?: import('../git/remote/types.ts').HttpClient
      ssh?: import('../ssh/SshClient.ts').SshClient
      tcp?: import('../daemon/TcpClient.ts').TcpClient
      fs?: FileSystemProvider
      auth?: import('../git/forge/types.ts').ForgeAuth
      useRestApi?: boolean
      urlOnly?: boolean
    }
  ): Promise<import('../git/remote/GitRemoteBackend.ts').GitRemoteBackend> {
    // Check cache first
    if (this._remoteBackends.has(name)) {
      return this._remoteBackends.get(name)!
    }
    
    // Read remote URL from config
    const config = await this.getConfig()
    const url = await config.get(`remote.${name}.url`) as string | undefined
    if (!url) {
      const { NotFoundError } = await import('../errors/NotFoundError.ts')
      throw new NotFoundError(`Remote '${name}' not found`)
    }
    
    // Create backend using RemoteBackendRegistry
    const { RemoteBackendRegistry } = await import('../git/remote/RemoteBackendRegistry.ts')
    const backend = RemoteBackendRegistry.getBackend({
      url,
      http: options?.http,
      ssh: options?.ssh,
      tcp: options?.tcp,
      fs: options?.fs || this.fs,
      auth: options?.auth,
      useRestApi: options?.useRestApi,
      urlOnly: options?.urlOnly,
    })
    
    // Cache backend
    this._remoteBackends.set(name, backend)
    return backend
  }

  /**
   * Lists all configured remotes with their backend instances from the remote registry.
   * 
   * This method reads all remote names from `.git/config` and creates `GitRemoteBackend`
   * instances for each one using the `RemoteBackendRegistry`. The backends are created
   * in URL-only mode (`urlOnly: true`), which means they can be created without requiring
   * protocol-specific clients (http, ssh, tcp).
   * 
   * **URL-Only Mode**:
   * 
   * This method uses `urlOnly: true` when calling `getRemote()` because it only needs
   * to retrieve the remote URLs, not perform actual Git protocol operations. This allows
   * `listRemotes` to work without requiring users to provide HTTP, SSH, or TCP clients
   * just to see what remotes are configured.
   * 
   * The returned backends can:
   * - Call `getUrl()` to retrieve the remote URL
   * - Access `name` and `baseUrl` properties
   * 
   * The returned backends cannot (without providing clients):
   * - Call `discover()` or `connect()` for actual Git operations
   * 
   * To get a backend with full functionality, call `getRemote(name, { http, ssh, tcp })`
   * with the appropriate protocol clients.
   * 
   * **Backend Registry Integration**:
   * 
   * Each backend is created via `RemoteBackendRegistry.getBackend()`, which automatically
   * detects the protocol from the remote URL and creates the appropriate backend type:
   * - HTTP/HTTPS URLs → `GitRemoteHttp`
   * - SSH URLs (ssh:// or git@host:path) → `GitRemoteSSH`
   * - Git daemon URLs (git://) → `GitRemoteDaemon`
   * 
   * Backends are cached per Repository instance, so subsequent calls to `getRemote()`
   * with the same name will return the cached instance.
   * 
   * @returns Promise resolving to an array of remote objects, each containing:
   *   - `name`: The remote name (e.g., 'origin', 'upstream')
   *   - `backend`: The `GitRemoteBackend` instance for this remote (created with `urlOnly: true`)
   * 
   * @example
   * ```typescript
   * // List all remotes and get their URLs
   * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
   * const remotes = await repo.listRemotes()
   * for (const { name, backend } of remotes) {
   *   console.log(`${name}: ${backend.getUrl()}`)
   *   // Output: origin: https://github.com/user/repo.git
   *   //         upstream: git@github.com:upstream/repo.git
   * }
   * 
   * // Use with listRemotes command
   * import { listRemotes } from 'universal-git'
   * const remotes = await listRemotes({ repo })
   * // Returns: [{ remote: 'origin', url: 'https://github.com/user/repo.git' }, ...]
   * ```
   * 
   * @see {@link getRemote} For getting a single remote with full functionality
   * @see {@link invalidateRemoteCache} To clear the backend cache when remotes change
   */
  async listRemotes(): Promise<Array<{ name: string; backend: import('../git/remote/GitRemoteBackend.ts').GitRemoteBackend }>> {
    const config = await this.getConfig()
    const remoteNames = await config.getSubsections('remote')
    const remotes = await Promise.all(
      remoteNames.map(async name => ({
        name,
        backend: await this.getRemote(name, { urlOnly: true }),
      }))
    )
    return remotes
  }

  /**
   * Invalidates the remote backend cache
   * Useful when remotes are added/removed/updated via config changes
   */
  invalidateRemoteCache(): void {
    this._remoteBackends.clear()
  }

  /**
   * Gets a Repository instance for a submodule by path or name.
   * 
   * Submodules are nested Git repositories stored in `.git/modules/<path>`.
   * Each submodule should be accessed through its own Repository instance with
   * its own GitBackend, following the backend-first architecture.
   * 
   * **Submodule Repository Management**:
   * 
   * Submodule Repository instances are cached per parent Repository instance,
   * keyed by the submodule path. This ensures:
   * - Same submodule path = same Repository instance (state consistency)
   * - Submodules are accessed through their own GitBackend instances
   * - Submodule operations go through Repository methods, not direct filesystem access
   * 
   * **Submodule Git Directory**:
   * 
   * Submodules are stored in `.git/modules/<path>`, where `<path>` is the
   * submodule's path relative to the parent repository root. The submodule's
   * working directory is at `<parent-dir>/<path>`.
   * 
   * @param pathOrName - Submodule path (e.g., 'lib') or name (e.g., 'lib')
   * @returns Promise resolving to the submodule's Repository instance
   * @throws Error if submodule is not found in .gitmodules or if submodule gitdir doesn't exist
   * 
   * @example
   * ```typescript
   * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
   * const submoduleRepo = await repo.getSubmodule('lib')
   * 
   * // Use submodule Repository for operations
   * const submoduleHead = await submoduleRepo.resolveRef('HEAD')
   * const submoduleFiles = await listFiles({ repo: submoduleRepo })
   * ```
   */
  async getSubmodule(pathOrName: string): Promise<Repository> {
    // Check cache first
    if (this._submoduleRepos.has(pathOrName)) {
      return this._submoduleRepos.get(pathOrName)!
    }

    // Get submodule info from .gitmodules
    const { parseGitmodules } = await import('./filesystem/SubmoduleManager.ts')
    const submodules = await parseGitmodules({ repo: this })
    
    // Try to find submodule by name first, then by path
    let submoduleInfo: { name: string; path: string; url: string; branch?: string } | null = null
    const byName = submodules.get(pathOrName)
    if (byName) {
      submoduleInfo = { name: pathOrName, ...byName }
    } else {
      // Try by path
      for (const [name, info] of submodules.entries()) {
        if (info.path === pathOrName) {
          submoduleInfo = { name, ...info }
          break
        }
      }
    }
    
    if (!submoduleInfo) {
      throw new Error(`Submodule '${pathOrName}' not found in .gitmodules`)
    }

    // Get submodule gitdir (stored in .git/modules/<path>)
    const gitdir = await this.getGitdir()
    const { join, normalize } = await import('./GitPath.ts')
    const submoduleGitdir = normalize(join(gitdir, 'modules', submoduleInfo.path))
    
    // Check if submodule gitdir exists
    if (!(await this.fs.exists(submoduleGitdir))) {
      throw new Error(`Submodule '${pathOrName}' gitdir does not exist at ${submoduleGitdir}. Initialize the submodule first.`)
    }

    // Get submodule working directory
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Parent repository must have a working directory to access submodules')
    }
    const submoduleDir = normalize(join(dir, submoduleInfo.path))

    // Create submodule Repository instance
    // Reuse the same filesystem and cache from parent repository
    const submoduleRepo = await Repository.open({
      fs: this.fs,
      dir: submoduleDir,
      gitdir: submoduleGitdir,
      cache: this.cache,
      autoDetectConfig: true,
    })

    // Cache the submodule Repository instance
    this._submoduleRepos.set(pathOrName, submoduleRepo)
    // Also cache by path for easy lookup
    if (pathOrName !== submoduleInfo.path) {
      this._submoduleRepos.set(submoduleInfo.path, submoduleRepo)
    }

    return submoduleRepo
  }

  /**
   * Lists all submodules as Repository instances.
   * 
   * Reads `.gitmodules` and returns Repository instances for each configured submodule.
   * Only returns Repository instances for submodules that have been initialized
   * (i.e., their gitdir exists in `.git/modules/<path>`).
   * 
   * @returns Promise resolving to an array of submodule objects, each containing:
   *   - `name`: The submodule name
   *   - `path`: The submodule path
   *   - `url`: The submodule URL
   *   - `repo`: The submodule's Repository instance (only if initialized)
   * 
   * @example
   * ```typescript
   * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
   * const submodules = await repo.listSubmodules()
   * for (const { name, path, repo } of submodules) {
   *   if (repo) {
   *     const head = await repo.resolveRef('HEAD')
   *     console.log(`${name} (${path}): ${head}`)
   *   }
   * }
   * ```
   */
  async listSubmodules(): Promise<Array<{ name: string; path: string; url: string; branch?: string; repo: Repository | null }>> {
    const { parseGitmodules } = await import('./filesystem/SubmoduleManager.ts')
    const submodules = await parseGitmodules({ repo: this })
    const gitdir = await this.getGitdir()
    const { join, normalize } = await import('./GitPath.ts')
    
    const results = await Promise.all(
      Array.from(submodules.entries()).map(async ([name, info]) => {
        const submoduleGitdir = normalize(join(gitdir, 'modules', info.path))
        if (!this.fs) {
          return {
            name,
            path: info.path,
            url: info.url,
            branch: info.branch,
            repo: null,
          }
        }
        const exists = await this.fs.exists(submoduleGitdir)
        
        let repo: Repository | null = null
        if (exists) {
          try {
            repo = await this.getSubmodule(name)
          } catch {
            // Submodule gitdir exists but can't be opened, return null
            repo = null
          }
        }
        
        return {
          name,
          path: info.path,
          url: info.url,
          branch: info.branch,
          repo,
        }
      })
    )
    
    return results
  }

  /**
   * Invalidates the submodule Repository cache
   * Useful when submodules are added/removed/updated
   */
  invalidateSubmoduleCache(): void {
    this._submoduleRepos.clear()
  }

  // ============================================================================
  // Git Commands - All commands exposed on Repository for convenience
  // ============================================================================

  /**
   * Add files to the staging area
   * 
   * @param filepaths - File or directory paths to add (default: all files)
   * @param options - Add options
   */
  async add(
    filepaths?: string | string[],
    options: {
      force?: boolean
      update?: boolean
    } = {}
  ): Promise<void> {
    if (!this.fs) {
      throw new Error('Cannot add files: filesystem is required. Checkout to a WorktreeBackend first.')
    }
    const { add: _add } = await import('../commands/add.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Cannot add files in bare repository')
    }
    return _add({
      repo: this,
      fs: this.fs,
      dir,
      gitdir,
      cache: this.cache,
      filepath: filepaths || '.',
      force: options.force,
      parallel: true,
    })
  }

  /**
   * Commit staged changes
   * 
   * @param message - Commit message
   * @param options - Commit options
   */
  async commit(
    message: string,
    options: {
      author?: Partial<import('../models/GitCommit.ts').Author>
      committer?: Partial<import('../models/GitCommit.ts').Author>
      noVerify?: boolean
      amend?: boolean
      ref?: string
      parent?: string[]
      tree?: string
    } = {}
  ): Promise<string> {
    if (!this.fs) {
      throw new Error('Cannot commit: filesystem is required. Checkout to a WorktreeBackend first.')
    }
    const { commit: _commit } = await import('../commands/commit.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Cannot commit in bare repository')
    }
    return _commit({
      repo: this,
      fs: this.fs,
      dir,
      gitdir,
      cache: this.cache,
      message,
      ...options,
    })
  }

  /**
   * Get the status of files in the working directory
   * 
   * @param filepath - Specific file path to check (optional)
   * @returns File status
   */
  async status(filepath?: string): Promise<import('../commands/status.ts').FileStatus> {
    if (!this.fs) {
      throw new Error('Cannot get status: filesystem is required. Checkout to a WorktreeBackend first.')
    }
    const { status: _status } = await import('../commands/status.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Cannot get status in bare repository')
    }
    return _status({
      repo: this,
      fs: this.fs,
      dir,
      gitdir,
      cache: this.cache,
      filepath,
    })
  }

  /**
   * Get the status matrix of all files
   * 
   * @param options - Status matrix options
   * @returns Array of status rows
   */
  async statusMatrix(options: {
    filepaths?: string[]
  } = {}): Promise<import('../commands/statusMatrix.ts').StatusRow[]> {
    const { statusMatrix: _statusMatrix } = await import('../commands/statusMatrix.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Cannot get status matrix in bare repository')
    }
    return _statusMatrix({
      repo: this,
      fs: this.fs,
      dir,
      gitdir,
      cache: this.cache,
      filepaths: options.filepaths,
    })
  }

  /**
   * Remove files from the working directory and staging area
   * 
   * @param filepaths - File or directory paths to remove
   * @param options - Remove options
   */
  async remove(
    filepaths: string | string[],
    options: {
      cached?: boolean
      force?: boolean
    } = {}
  ): Promise<void> {
    if (!this.fs) {
      throw new Error('Cannot remove files: filesystem is required. Checkout to a WorktreeBackend first.')
    }
    const { remove: _remove } = await import('../commands/remove.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Cannot remove files in bare repository')
    }
    return _remove({
      repo: this,
      fs: this.fs,
      dir,
      gitdir,
      cache: this.cache,
      filepaths: Array.isArray(filepaths) ? filepaths : [filepaths],
      cached: options.cached,
      force: options.force,
    })
  }

  /**
   * Reset the index or working directory
   * 
   * @param ref - Commit to reset to (default: 'HEAD')
   * @param mode - Reset mode ('soft', 'mixed', 'hard')
   */
  async reset(
    ref: string = 'HEAD',
    mode: 'soft' | 'mixed' | 'hard' = 'mixed'
  ): Promise<void> {
    if (!this.fs) {
      throw new Error('Cannot reset: filesystem is required. Checkout to a WorktreeBackend first.')
    }
    const { reset: _reset } = await import('../commands/reset.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Cannot reset in bare repository')
    }
    return _reset({
      repo: this,
      fs: this.fs,
      dir,
      gitdir,
      cache: this.cache,
      ref,
      mode,
    })
  }

  /**
   * Create a new branch
   * 
   * @param branch - Branch name
   * @param options - Branch options
   */
  async branch(
    branch: string,
    options: {
      checkout?: boolean
      ref?: string
      force?: boolean
    } = {}
  ): Promise<void> {
    const { branch: _branch } = await import('../commands/branch.ts')
    const gitdir = await this.getGitdir()
    return _branch({
      repo: this,
      fs: this.fs,
      gitdir,
      cache: this.cache,
      ref: branch,
      checkout: options.checkout,
      startPoint: options.ref,
      force: options.force,
    })
  }

  /**
   * Get the current branch name
   * 
   * @returns Current branch name or null if detached HEAD
   */
  async currentBranch(): Promise<string | null> {
    const { currentBranch: _currentBranch } = await import('../commands/currentBranch.ts')
    const gitdir = await this.getGitdir()
    return _currentBranch({
      repo: this,
      fs: this.fs,
      gitdir,
      cache: this.cache,
    })
  }

  /**
   * List all branches
   * 
   * @param options - List branches options
   * @returns Array of branch names
   */
  async listBranches(options: {
    remote?: boolean
  } = {}): Promise<string[]> {
    const { listBranches: _listBranches } = await import('../commands/listBranches.ts')
    const gitdir = await this.getGitdir()
    return _listBranches({
      repo: this,
      fs: this.fs,
      gitdir,
      cache: this.cache,
      remote: options.remote,
    })
  }

  /**
   * Fetch from a remote
   * 
   * @param remote - Remote name (default: 'origin')
   * @param options - Fetch options
   */
  async fetch(
    remote: string = 'origin',
    options: {
      ref?: string
      depth?: number
      since?: Date
      exclude?: string[]
      relative?: boolean
      tags?: boolean
      singleBranch?: boolean
      onProgress?: ProgressCallback
      http?: import('../git/remote/types.ts').HttpClient
      ssh?: import('../ssh/SshClient.ts').SshClient
      tcp?: import('../daemon/TcpClient.ts').TcpClient
    } = {}
  ): Promise<void> {
    const { fetch: _fetch } = await import('../commands/fetch.ts')
    const gitdir = await this.getGitdir()
    return _fetch({
      repo: this,
      fs: this.fs,
      gitdir,
      cache: this.cache,
      remote,
      ...options,
    })
  }

  /**
   * Push to a remote
   * 
   * @param remote - Remote name (default: 'origin')
   * @param ref - Branch or ref to push (default: current branch)
   * @param options - Push options
   */
  async push(
    remote: string = 'origin',
    ref?: string,
    options: {
      force?: boolean
      onProgress?: ProgressCallback
      http?: import('../git/remote/types.ts').HttpClient
      ssh?: import('../ssh/SshClient.ts').SshClient
      tcp?: import('../daemon/TcpClient.ts').TcpClient
      includeSubmodules?: boolean
      submoduleRecurse?: boolean
    } = {}
  ): Promise<import('../commands/push.ts').PushResult> {
    const { push: _push } = await import('../commands/push.ts')
    const gitdir = await this.getGitdir()
    return _push({
      repo: this,
      fs: this.fs,
      gitdir,
      cache: this.cache,
      remote,
      ref,
      ...options,
    })
  }

  /**
   * Pull from a remote (fetch + merge)
   * 
   * @param remote - Remote name (default: 'origin')
   * @param ref - Branch to pull (default: current branch)
   * @param options - Pull options
   */
  async pull(
    remote: string = 'origin',
    ref?: string,
    options: {
      fastForward?: boolean
      fastForwardOnly?: boolean
      onProgress?: ProgressCallback
      http?: import('../git/remote/types.ts').HttpClient
      ssh?: import('../ssh/SshClient.ts').SshClient
      tcp?: import('../daemon/TcpClient.ts').TcpClient
    } = {}
  ): Promise<import('../commands/pull.ts').PullResult> {
    if (!this.fs) {
      throw new Error('Cannot pull: filesystem is required. Checkout to a WorktreeBackend first.')
    }
    const { pull: _pull } = await import('../commands/pull.ts')
    const gitdir = await this.getGitdir()
    const dir = await this.getDir()
    if (!dir) {
      throw new Error('Cannot pull in bare repository')
    }
    return _pull({
      repo: this,
      fs: this.fs,
      dir,
      gitdir,
      cache: this.cache,
      remote,
      ref,
      ...options,
    })
  }
}

