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
  private readonly _fs: FileSystemProvider
  private _dir: string | null
  private _gitdir: string | null
  public readonly cache: Record<string, unknown>
  private readonly _systemConfigPath?: string
  private readonly _globalConfigPath?: string

  // Backend instances (new API - preferred over fs/dir/gitdir)
  // Repository is a thin wrapper around:
  // 1. One GitBackend (always present - for bare repos or remote repos)
  // 2. Multiple linked worktree checkouts, each with its own WorktreeBackend
  private _gitBackend: GitBackend | null = null
  private _worktreeBackend: GitWorktreeBackend | null = null  // Main worktree backend (if any)
  private _worktrees: Map<string, Worktree> = new Map()  // Multiple linked worktrees
  
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
    if (fs) {
      this._fs = fs
    } else if (gitBackend?.getFileSystem) {
      this._fs = gitBackend.getFileSystem() || (() => {
        throw new Error("Cannot create Repository: filesystem is required. At least one backend must provide a filesystem via getFileSystem().")
      })()
    } else if (worktreeBackend?.getFileSystem) {
      this._fs = worktreeBackend.getFileSystem() || (() => {
        throw new Error("Cannot create Repository: filesystem is required. At least one backend must provide a filesystem via getFileSystem().")
      })()
    } else {
      throw new Error("Cannot create Repository: filesystem is required. Either provide 'fs' or use backends that provide filesystem via getFileSystem().")
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
  }

  /**
   * Get filesystem instance - only available when WorktreeBackend is GitWorktreeFs
   * Repository should not expose fs directly - it should only be accessible through backends
   * @returns FileSystemProvider if worktree backend provides it, otherwise throws
   */
  get fs(): FileSystemProvider {
    // Only expose fs through WorktreeBackend when it's GitWorktreeFs
    if (this._worktreeBackend?.getFileSystem) {
      const fs = this._worktreeBackend.getFileSystem()
      if (fs) {
        return fs
      }
    }
    // Fallback to internal fs for system/global config access (should be rare)
    // This is needed for system/global config which is not part of Git repository data
    return this._fs
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
      } else if (dir) {
        // When only dir is provided: gitdir = dir/.git
        // Check if dir itself is a bare repo (has config file directly)
        const configPath = join(dir, 'config')
        const isBare = await fs.exists(configPath)
        if (isBare) {
          finalGitdir = normalize(dir)
        } else {
          // Find .git directory by walking up from dir
          try {
            const root = await findRoot({ fs, filepath: dir })
            finalGitdir = normalize(join(root, '.git'))
          } catch (err) {
            if (err instanceof NotFoundError) {
              // If not found and init is true, create new repo at dir/.git
              if (init) {
                finalGitdir = normalize(join(dir, '.git'))
              } else {
                throw new NotFoundError(`Not a git repository: ${dir}`)
              }
            } else {
              throw err
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
    } else if (dir) {
      // Need to create GitWorktreeFs - require fs and dir
      if (!fs) {
        if (!inputFs) {
          throw new Error("Either 'fs' or 'worktree' is required. When 'worktree' is not provided, 'fs' is required to create GitWorktreeFs.")
        }
        fs = createFileSystem(inputFs)
      }
      
      // Create GitWorktreeFs
      resolvedWorktreeBackend = createGitWorktreeBackend({ fs, dir })
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
      } else if (dir) {
        // Derive gitdir from dir (dir/.git)
        if (fs) {
          const configPath = join(dir, 'config')
          const isBare = await fs.exists(configPath)
          if (isBare) {
            finalGitdir = normalize(dir)
          } else {
            finalGitdir = normalize(join(dir, '.git'))
          }
        } else {
          // Default to dir/.git if no fs available
          finalGitdir = normalize(join(dir, '.git'))
        }
      } else {
        throw new Error("Cannot determine gitdir: 'gitdir' or 'dir' is required when using non-filesystem gitBackend.")
      }
    }
    
    // Derive workingDir from worktree backend or dir
    if (resolvedWorktreeBackend) {
      if (resolvedWorktreeBackend.getDirectory) {
        workingDir = resolvedWorktreeBackend.getDirectory() || null
      }
      // If worktree backend doesn't have getDirectory, use dir parameter
      if (!workingDir && dir) {
        workingDir = dir
      }
    } else if (dir) {
      workingDir = dir
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
   */
  getWorktree(): Worktree | null {
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
    return this.getWorktree()
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
    const worktreeDirExists = (this._worktreeBackend && isWithinWorktree)
      ? await this._worktreeBackend.exists(normalizedWorktreeDir.substring(currentWorktreeDir!.length + 1))
      : await this.fs.exists(normalizedWorktreeDir)
    
    if (worktreeDirExists) {
      if (!options.force) {
        throw new Error(`Worktree directory already exists: ${normalizedWorktreeDir}`)
      }
      // Force: remove existing directory
      if (this._worktreeBackend && isWithinWorktree) {
        await this._worktreeBackend.rm(normalizedWorktreeDir.substring(currentWorktreeDir!.length + 1), { recursive: true })
      } else {
        await this.fs.rm(normalizedWorktreeDir)
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
      await this.fs.mkdir(normalizedWorktreeDir)
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
      const { createGitWorktreeBackend } = await import('../git/worktree/index.ts')
      worktreeBackend = createGitWorktreeBackend({
        fs: this.fs,
        dir: normalizedWorktreeDir,
      })
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
   * Gets a worktree by name
   * @param name - Worktree name
   * @returns Worktree instance or null if not found
   */
  getWorktreeByName(name: string): Worktree | null {
    return this._worktrees.get(name) || null
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
   * Checks out a branch, tag, or commit in the current worktree
   * Delegates to worktree.checkout() to ensure proper worktree context
   * 
   * @param ref - Branch name, tag name, or commit SHA
   * @param options - Checkout options
   */
  async checkout(
    ref: string,
    options: {
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
    const worktree = this.getWorktree()
    if (!worktree) {
      throw new Error('Cannot checkout in bare repository')
    }
    await worktree.checkout(ref, options)
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
}

