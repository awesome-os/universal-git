import { NotFoundError } from '../errors/NotFoundError.ts'
import { findRoot } from "../commands/findRoot.ts"
import { join } from './GitPath.ts'
import { UnifiedConfigService } from './UnifiedConfigService.ts'
// Using src/git/ functions directly for state, refs, and index operations
import { Worktree } from './Worktree.ts'
import { GitIndex } from '../git/index/GitIndex.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { detectObjectFormat, type ObjectFormat } from '../utils/detectObjectFormat.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { Transport, TransportOptions } from '../transport/index.ts'
import { createTransport, createDefaultTransport } from '../transport/index.ts'
import { WorkerPool } from '../workers/WorkerPool.ts'
import type { ProxiedRepository } from '../workers/Proxies.ts'

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
 * Repository Context Object - Central representation of a Git repository
 * Provides lazy-loaded access to all low-level managers
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

  public readonly fs: FileSystemProvider
  private _dir: string | null
  private _gitdir: string | null
  public readonly cache: Record<string, unknown>
  private readonly _systemConfigPath?: string
  private readonly _globalConfigPath?: string

  private _config: UnifiedConfigService | null = null
  // StateManager removed - use src/git/state/ functions directly
  private _objectReader: ObjectReaderWrapper | null = null
  private _objectWriter: ObjectWriterWrapper | null = null
  private _isBare: boolean | null = null
  private _worktree: Worktree | null = null
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
    fs: FileSystemProvider,
    dir: string | null,
    gitdir: string | null,
    cache: Record<string, unknown> = {},
    systemConfigPath?: string,
    globalConfigPath?: string
  ) {
    this.fs = fs
    this._dir = dir
    this._gitdir = gitdir
    this.cache = cache
    this._systemConfigPath = systemConfigPath
    this._globalConfigPath = globalConfigPath
  }

  /**
   * Detects system and global git config paths
   * Follows git's config file precedence rules
   */
  static async detectConfigPaths(
    fs: FileSystemProvider,
    env?: Record<string, string>
  ): Promise<{ systemConfigPath?: string; globalConfigPath?: string }> {
    const result: { systemConfigPath?: string; globalConfigPath?: string } = {}
    const envVars = env || (typeof process !== 'undefined' && process.env ? process.env : {})

    // System config path
    // 1. Check GIT_CONFIG_SYSTEM environment variable
    if (envVars.GIT_CONFIG_SYSTEM) {
      const systemPath = envVars.GIT_CONFIG_SYSTEM
      if (await fs.exists(systemPath)) {
        result.systemConfigPath = systemPath
      }
    } else {
      // 2. Platform-specific defaults
      // On Windows: C:\ProgramData\Git\config
      // On Unix: /etc/gitconfig
      const isWindows = typeof process !== 'undefined' && process.platform === 'win32'
      const defaultSystemPath = isWindows
        ? 'C:\\ProgramData\\Git\\config'
        : '/etc/gitconfig'
      
      if (await fs.exists(defaultSystemPath)) {
        result.systemConfigPath = defaultSystemPath
      }
    }

    // Global config path
    // 1. Check GIT_CONFIG_GLOBAL environment variable
    if (envVars.GIT_CONFIG_GLOBAL) {
      const globalPath = envVars.GIT_CONFIG_GLOBAL
      if (await fs.exists(globalPath)) {
        result.globalConfigPath = globalPath
      }
    } else {
      // 2. Check XDG_CONFIG_HOME/git/config (if XDG_CONFIG_HOME is set)
      if (envVars.XDG_CONFIG_HOME) {
        const xdgPath = join(envVars.XDG_CONFIG_HOME, 'git', 'config')
        if (await fs.exists(xdgPath)) {
          result.globalConfigPath = xdgPath
        }
      }
      
      // 3. Check HOME/.gitconfig (or USERPROFILE\.gitconfig on Windows)
      if (!result.globalConfigPath) {
        const homeDir = envVars.HOME || envVars.USERPROFILE
        if (homeDir) {
          const homeConfigPath = join(homeDir, '.gitconfig')
          if (await fs.exists(homeConfigPath)) {
            result.globalConfigPath = homeConfigPath
          }
        }
      }
    }

    return result
  }

  /**
   * Opens a repository from a directory
   * 
   * CRITICAL: Reuses Repository instances from cache to ensure index state consistency.
   * When multiple operations (add, status, etc.) use the same cache and gitdir, they
   * get the same Repository instance, which owns the index state.
   */
  static async open({
    fs,
    dir,
    gitdir: providedGitdir,
    cache = {},
    systemConfigPath,
    globalConfigPath,
    autoDetectConfig = true,
  }: {
    fs: FileSystemProvider
    dir?: string
    gitdir?: string
    cache?: Record<string, unknown>
    systemConfigPath?: string
    globalConfigPath?: string
    autoDetectConfig?: boolean
  }): Promise<Repository> {
    const { normalize } = await import('./GitPath.ts')
    
    // 1. Determine the canonical gitdir path. This will be our unique key.
    let finalGitdir: string
    let workingDir: string | null = dir || null

    if (providedGitdir) {
      // If gitdir is explicitly provided, use it directly
      finalGitdir = normalize(providedGitdir)
      // If gitdir is provided but dir is not, try to infer working dir
      if (!dir) {
        // Check if gitdir is a bare repo (has config file directly)
        const configPath = join(providedGitdir, 'config')
        const isBare = await fs.exists(configPath)
        if (!isBare) {
          // gitdir is .git subdirectory, working dir is parent
          const { dirname } = await import('../utils/dirname.ts')
          workingDir = dirname(providedGitdir)
        } else {
          workingDir = null
        }
      }
      // If both dir and gitdir are provided, use dir as working directory
      // (workingDir is already set to dir at line 173)
    } else if (dir) {
      // Find .git directory by walking up from dir
      try {
        // Check if dir itself is a bare repo (has config file directly)
        const configPath = join(dir, 'config')
        const isBare = await fs.exists(configPath)
        if (isBare) {
          finalGitdir = normalize(dir)
          workingDir = null
        } else {
          // Find .git directory by walking up
          const root = await findRoot({ fs, filepath: dir })
          finalGitdir = normalize(join(root, '.git'))
          workingDir = root
        }
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new NotFoundError(`Not a git repository: ${dir}`)
        }
        throw err
      }
    } else {
      throw new Error("Either 'dir' or 'gitdir' is required.")
    }

    // 2. Get or create the fs-specific cache
    // CRITICAL: We use a two-level cache to ensure that:
    // - Different filesystem instances get different Repository instances (test isolation)
    // - Same filesystem + same gitdir = same Repository instance (state consistency)
    if (!Repository._instanceCache.has(fs)) {
      Repository._instanceCache.set(fs, new Map<string, Repository>())
    }
    const fsCache = Repository._instanceCache.get(fs)!

    // 3. Check the fs-specific cache for the instance
    // CRITICAL: If dir is provided and cached instance has dir=null, don't use cached instance
    // This ensures that non-bare repositories created via clone() work correctly
    if (fsCache.has(finalGitdir)) {
      const cachedRepo = fsCache.get(finalGitdir)!
      // If we're opening with a dir but cached instance has no dir, create a new instance
      // This handles the case where a bare repo was cached, but we're now opening it as non-bare
      if (dir && !cachedRepo._dir) {
        // Don't use cached instance - will create new one below
      } else {
        return cachedRepo
      }
    }

    // 4. Auto-detect config paths if not provided and auto-detection is enabled
    let finalSystemPath = systemConfigPath
    let finalGlobalPath = globalConfigPath

    if (autoDetectConfig && (!finalSystemPath || !finalGlobalPath)) {
      const detected = await Repository.detectConfigPaths(fs)
      finalSystemPath = finalSystemPath || detected.systemConfigPath
      finalGlobalPath = finalGlobalPath || detected.globalConfigPath
    }

    // 5. Create new Repository instance and cache it in fs-specific cache
    // CRITICAL: When both dir and gitdir are provided, workingDir should be dir (not null)
    // This ensures non-bare repositories created via clone() work correctly
    // IMPORTANT: If dir was provided, always use it as workingDir (don't let it be null)
    if (dir && !workingDir) {
      workingDir = dir
    }
    const repo = new Repository(fs, workingDir, finalGitdir, cache, finalSystemPath, finalGlobalPath)
    fsCache.set(finalGitdir, repo)
    
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
    if (this._dir) {
      // Find .git directory
      const root = await findRoot({ fs: this.fs, filepath: this._dir })
      this._gitdir = join(root, '.git')
      return this._gitdir
    }
    throw new Error('Cannot determine gitdir: neither dir nor gitdir provided')
  }

  /**
   * Gets the git directory as a property (async getter)
   */
  get gitdir(): Promise<string> {
    return this.getGitdir()
  }

  /**
   * Checks if repository is bare
   */
  async isBare(): Promise<boolean> {
    if (this._isBare === null) {
      const gitdir = await this.getGitdir()
      // Check if config exists directly in gitdir (bare) or in gitdir/.git (non-bare)
      const configPath = join(gitdir, 'config')
      const configExists = await this.fs.exists(configPath)
      if (configExists) {
        // Read config to check bare setting
        try {
          // CRITICAL: Use this repository's config service to ensure state consistency
          const config = await this.getConfig()
          const bare = await config.get('core.bare')
          this._isBare = bare === 'true' || bare === true
        } catch {
          // Default to non-bare if can't read config
          this._isBare = false
        }
      } else {
        this._isBare = false
      }
    }
    return this._isBare
  }

  /**
   * Gets the unified configuration service
   */
  async getConfig(): Promise<UnifiedConfigService> {
    if (!this._config) {
      const gitdir = await this.getGitdir()
      this._config = new UnifiedConfigService(
        this.fs,
        gitdir,
        this._systemConfigPath,
        this._globalConfigPath
      )
      await this._config.load()
    } else {
      // Reload config to ensure we have the latest values from disk
      // This is important because ConfigAccess.setConfigValue() writes to disk
      // but doesn't invalidate the Repository's cached config instance
      await this._config.reload()
    }
    return this._config
  }

  /**
   * Gets the object format (SHA-1 or SHA-256) used by this repository
   * Caches the result for performance
   */
  async getObjectFormat(): Promise<ObjectFormat> {
    if (!this._objectFormat) {
      const gitdir = await this.getGitdir()
      this._objectFormat = await detectObjectFormat(this.fs, gitdir)
    }
    return this._objectFormat
  }

  /**
   * Gets the unified configuration service as a property (async getter)
   */
  get config(): Promise<UnifiedConfigService> {
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
  async getRefManager(): Promise<typeof RefManager> {
    // RefManager is static, but we return it for consistency
    const { RefManager } = await import('./refs/RefManager.ts')
    return RefManager
  }

  /**
   * Gets the object reader
   */
  async getObjectReader(): Promise<ObjectReaderWrapper> {
    if (!this._objectReader) {
      const gitdir = await this.getGitdir()
      const { readObject } = await import('../git/objects/readObject.ts')
      // Use new readObject function from src/git/objects/
      this._objectReader = {
        read: async (params) => {
          // Handle 'parsed' format separately - readObject doesn't support it
          if (params.format === 'parsed') {
            const result = await readObject({
              oid: params.oid,
              fs: this.fs,
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
            fs: this.fs,
            gitdir,
            cache: this.cache,
            format: validFormat as 'content' | 'deflated' | 'wrapped' | undefined,
          })
        },
      }
    }
    return this._objectReader
  }

  /**
   * Gets the object writer
   */
  async getObjectWriter(): Promise<ObjectWriterWrapper> {
    if (!this._objectWriter) {
      const gitdir = await this.getGitdir()
      const { writeObject } = await import('../git/objects/writeObject.ts')
      // Use new writeObject function from src/git/objects/
      this._objectWriter = {
        write: async (params) => {
          return writeObject({
            ...params,
            fs: this.fs,
            gitdir,
          })
        },
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
    const normalizedFs = createFileSystem(this.fs)
    const { join } = await import('./GitPath.ts')
    const indexPath = join(gitdir, 'index')
    
    
    // If force is true, clear the owned instance to force a fresh read from disk
    if (force) {
      this._index = null
      this._indexMtime = null
    }
    
    // If we have an in-memory index, check if it's stale
    if (this._index) {
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
          const { readIndex } = await import('../git/index/readIndex.ts')
          const diskIndex = await readIndex({
            fs: this.fs,
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
    const { readIndex } = await import('../git/index/readIndex.ts')
    const index = await readIndex({
      fs: this.fs,
      gitdir,
    })
    
    // Only update the owned instance and its mtime if readIndex() succeeded
    // If readIndex() threw an error, we should not update the cache
    this._index = index
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
    const normalizedFs = createFileSystem(this.fs)
    const { join } = await import('./GitPath.ts')
    const { writeIndex } = await import('../git/index/writeIndex.ts')
    
    
    // Write to disk
    // Use the stateless writeIndex helper - no cache parameter needed
    await writeIndex({
      fs: this.fs,
      gitdir,
      index,
    })
    
    // CRITICAL: Update the repository's owned instance and its mtime
    // This ensures that subsequent readIndexDirect() calls return this exact
    // modified instance, solving the race condition where add() modifies the
    // index but status() reads a stale cached version
    this._index = index
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
    const gitdir = await this.getGitdir()
    const { resolveRef } = await import('../git/refs/index.ts')
    
    // Use worktree-aware resolution if we're in a worktree
    const { isWorktreeGitdir } = await import('../git/refs/worktreeRefs.ts')
    if (isWorktreeGitdir(gitdir)) {
      // For worktrees, we need to handle HEAD specially (it's in worktree gitdir)
      // but other refs are in main gitdir. Use resolveRef which handles this correctly
      // by checking worktree context internally
      const { getMainGitdir } = await import('../git/refs/worktreeRefs.ts')
      const mainGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: gitdir })
      
      // HEAD is in worktree gitdir, other refs are in main gitdir
      const effectiveGitdir = (ref === 'HEAD' || ref === 'refs/HEAD') ? gitdir : mainGitdir
      return resolveRef({ fs: this.fs, gitdir: effectiveGitdir, ref, depth })
    }
    
    // Main worktree - use standard resolution
    return resolveRef({ fs: this.fs, gitdir, ref, depth })
  }

  /**
   * Lists refs matching a prefix
   * Uses src/git/refs/listRefs directly
   */
  async listRefs(filepath: string): Promise<string[]> {
    return this.listRefsDirect(filepath)
  }

  /**
   * Lists refs directly using src/git/refs/listRefs
   * This is the single source of truth for listing refs
   * Handles worktree context correctly (refs are in main gitdir, not worktree gitdir)
   */
  async listRefsDirect(filepath: string): Promise<string[]> {
    const gitdir = await this.getGitdir()
    const { listRefs } = await import('../git/refs/listRefs.ts')
    
    // Refs are always in the main repository gitdir, even in worktrees
    const { isWorktreeGitdir, getMainGitdir } = await import('../git/refs/worktreeRefs.ts')
    const effectiveGitdir = isWorktreeGitdir(gitdir)
      ? await getMainGitdir({ fs: this.fs, worktreeGitdir: gitdir })
      : gitdir
    
    return listRefs({ fs: this.fs, gitdir: effectiveGitdir, filepath })
  }

  /**
   * Writes a ref
   * Uses src/git/refs/writeRef directly
   */
  async writeRef(ref: string, value: string, skipReflog = false): Promise<void> {
    return this.writeRefDirect(ref, value, skipReflog)
  }

  /**
   * Writes a ref directly using src/git/refs/writeRef
   * This is the single source of truth for writing refs
   * Handles worktree context correctly (HEAD in worktree gitdir, other refs in main gitdir)
   */
  async writeRefDirect(ref: string, value: string, skipReflog = false): Promise<void> {
    const gitdir = await this.getGitdir()
    const objectFormat = await this.getObjectFormat()
    // CRITICAL: Validate OID format - use dynamic length based on object format
    // Trim whitespace first to handle any accidental whitespace
    const trimmedValue = value.trim()
    
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
    
    // Use worktree-aware writing if we're in a worktree
    const { isWorktreeGitdir, writeRefInWorktree } = await import('../git/refs/worktreeRefs.ts')
    if (isWorktreeGitdir(gitdir)) {
      // writeRefInWorktree handles the gitdir routing internally
      // but we need to pass objectFormat - let's use the standard writeRef with correct gitdir
      const { getMainGitdir } = await import('../git/refs/worktreeRefs.ts')
      const { isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
      const { writeRef } = await import('../git/refs/writeRef.ts')
      
      // HEAD goes to worktree gitdir, other refs go to main gitdir
      if (isWorktreeSpecificRef(ref)) {
        return writeRef({ fs: this.fs, gitdir, ref, value: trimmedValue, objectFormat, skipReflog })
      } else {
        const mainGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: gitdir })
        return writeRef({ fs: this.fs, gitdir: mainGitdir, ref, value: trimmedValue, objectFormat, skipReflog })
      }
    }
    
    // Main worktree - use standard writing
    const { writeRef } = await import('../git/refs/writeRef.ts')
    return writeRef({ fs: this.fs, gitdir, ref, value: trimmedValue, objectFormat, skipReflog })
  }

  /**
   * Writes a symbolic ref directly using src/git/refs/writeSymbolicRef
   * This bypasses RefManager for direct file operations
   * Handles worktree context correctly (HEAD in worktree gitdir, other refs in main gitdir)
   */
  async writeSymbolicRefDirect(ref: string, value: string, oldOid?: string): Promise<void> {
    const gitdir = await this.getGitdir()
    const objectFormat = await this.getObjectFormat()
    
    // Use worktree-aware writing if we're in a worktree
    const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
    if (isWorktreeGitdir(gitdir)) {
      const { writeSymbolicRef } = await import('../git/refs/writeRef.ts')
      
      // HEAD goes to worktree gitdir, other refs go to main gitdir
      if (isWorktreeSpecificRef(ref)) {
        return writeSymbolicRef({ fs: this.fs, gitdir, ref, value, oldOid, objectFormat })
      } else {
        const mainGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: gitdir })
        return writeSymbolicRef({ fs: this.fs, gitdir: mainGitdir, ref, value, oldOid, objectFormat })
      }
    }
    
    // Main worktree - use standard writing
    const { writeSymbolicRef } = await import('../git/refs/writeRef.ts')
    return writeSymbolicRef({ fs: this.fs, gitdir, ref, value, oldOid, objectFormat })
  }

  /**
   * Deletes a ref directly using src/git/refs/deleteRef
   * This bypasses RefManager for direct file operations
   * Handles worktree context correctly (HEAD in worktree gitdir, other refs in main gitdir)
   */
  async deleteRefDirect(ref: string): Promise<void> {
    const gitdir = await this.getGitdir()
    const { deleteRef } = await import('../git/refs/deleteRef.ts')
    
    // Use worktree-aware deletion if we're in a worktree
    const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
    if (isWorktreeGitdir(gitdir)) {
      // HEAD goes to worktree gitdir, other refs go to main gitdir
      if (isWorktreeSpecificRef(ref)) {
        return deleteRef({ fs: this.fs, gitdir, ref })
      } else {
        const mainGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: gitdir })
        return deleteRef({ fs: this.fs, gitdir: mainGitdir, ref })
      }
    }
    
    // Main worktree - use standard deletion
    return deleteRef({ fs: this.fs, gitdir, ref })
  }

  /**
   * Gets the current worktree
   * Returns null for bare repositories
   */
  getWorktree(): Worktree | null {
    if (!this._dir) {
      return null // Bare repository has no worktree
    }
    if (!this._worktree) {
      // Create worktree with current dir and gitdir
      // Note: gitdir will be resolved when needed
      this._worktree = new Worktree(this, this._dir, this._gitdir)
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
   */
  async createWorktree(
    worktreeDir: string,
    ref: string = 'HEAD',
    name?: string,
    options: {
      force?: boolean
      detach?: boolean
      checkout?: boolean
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
    
    // Check if worktree directory already exists
    if (await this.fs.exists(normalizedWorktreeDir)) {
      if (!options.force) {
        throw new Error(`Worktree directory already exists: ${normalizedWorktreeDir}`)
      }
      // Force: remove existing directory
      await this.fs.rm(normalizedWorktreeDir)
    }
    
    // Create worktree directory
    await this.fs.mkdir(normalizedWorktreeDir)
    
    // Create worktree gitdir: <repo>/.git/worktrees/<name>
    const worktreeGitdir = join(gitdir, 'worktrees', worktreeName)
    await this.fs.mkdir(worktreeGitdir)
    
    // Write <worktree-dir>/.git file containing path to worktree gitdir
    const gitFile = join(normalizedWorktreeDir, '.git')
    await this.fs.write(gitFile, UniversalBuffer.from(worktreeGitdir, 'utf8'))
    
    // Write .git/worktrees/<name>/gitdir file containing absolute path to worktree directory
    // This is the reverse mapping that Git uses to find worktrees
    const worktreeGitdirFile = join(worktreeGitdir, 'gitdir')
    await this.fs.write(worktreeGitdirFile, UniversalBuffer.from(normalizedWorktreeDir, 'utf8'))
    
    // Resolve ref to commit OID using direct ref functions
    const { resolveRef } = await import('../git/refs/readRef.ts')
    let commitOid: string
    try {
      commitOid = await resolveRef({ fs: this.fs, gitdir, ref })
    } catch (err) {
      throw new Error(`Cannot resolve ref '${ref}': ${err}`)
    }
    
    // Write HEAD in worktree gitdir using direct ref functions
    const { writeRef } = await import('../git/refs/writeRef.ts')
    await writeRef({
      fs: this.fs,
      gitdir: worktreeGitdir,
      ref: 'HEAD',
      value: commitOid,
    })
    
    // Create empty index file for worktree
    const indexPath = join(worktreeGitdir, 'index')
    // Index will be created on first access by readIndexDirect
    
    // Create Worktree instance
    const worktree = new Worktree(this, normalizedWorktreeDir, worktreeGitdir, worktreeName)
    
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
   * Invalidates cached data (useful after operations that modify the repo)
   * Note: Index cache is managed by this Repository instance and will be automatically
   * refreshed when stale, so we don't need to invalidate it here.
   */
  async invalidateCache(): Promise<void> {
    this._isBare = null
    if (this._config) {
      await this._config.reload()
    }
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
    mergeDriver?: import('./algorithms/MergeManager.ts').MergeDriverCallback
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
    const { WorkdirManager } = await import('./filesystem/WorkdirManager.ts')
    
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
      onProgress?: import('../git/remote/GitRemoteHTTP.ts').ProgressCallback
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
        fs: this.fs, // Note: fs will need to be proxied via Comlink
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

