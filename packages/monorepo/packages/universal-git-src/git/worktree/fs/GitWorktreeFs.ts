import type { FileSystem, FileSystemProvider } from '../../../models/FileSystem.ts'
import type { ExtendedStat } from '../../../utils/statHelpers.ts'
import type { GitWorktreeBackend } from '../GitWorktreeBackend.ts'
import type { Repository } from '../../../core-utils/Repository.ts'
import { join, normalize } from '../../../core-utils/GitPath.ts'
import { UniversalBuffer } from '../../../utils/UniversalBuffer.ts'
import { createFileSystem } from '../../../utils/createFileSystem.ts'
import { SubmoduleCache, addSubmoduleToBackend, getSubmoduleFromBackend } from '../SubmoduleManager.ts'

/**
 * GitWorktreeFs - Filesystem implementation of GitWorktreeBackend
 * 
 * This backend stores all working directory files using the traditional filesystem,
 * wrapping the FileSystem class to provide the GitWorktreeBackend interface.
 * 
 * **Submodule Awareness**:
 * 
 * This backend is multi-worktree aware and handles submodules by delegating to
 * the submodule's WorktreeBackend. When a path is inside a submodule, operations
 * are delegated to the submodule's WorktreeBackend, which can then use its Repository
 * to access remote config and other submodule-specific operations.
 * 
 * This is the default implementation.
 */
export class GitWorktreeFs implements GitWorktreeBackend {
  readonly name: string
  private readonly fs: FileSystem
  private readonly dir: string
  private _repo: Repository | null = null
  private _submoduleCache: SubmoduleCache = new SubmoduleCache()

  constructor(
    fs: FileSystem | FileSystemProvider,
    dir: string,
    name?: string | null
  ) {
    // CRITICAL: Normalize filesystem using factory function
    // This ensures consistent API, proper caching, and Repository instance caching
    this.fs = createFileSystem(fs)
    this.dir = dir
    // Use provided name, or generate a UUID as default
    this.name = name ?? crypto.randomUUID()
  }

  /**
   * Sets the Repository instance for submodule detection and delegation
   * Called by Repository when creating/opening the backend
   */
  setRepository(repo: Repository | null): void {
    this._repo = repo
    // Invalidate submodule cache when repository changes
    this._submoduleCache.clear()
  }

  /**
   * Get the backend type identifier
   */
  getType(): string {
    return 'filesystem'
  }

  /**
   * Get the working directory path
   */
  getDir(): string {
    return this.dir
  }

  /**
   * Get the filesystem instance
   */
  getFs(): FileSystem {
    return this.fs
  }

  /**
   * Gets the filesystem instance (universal interface method)
   * @returns FileSystemProvider instance
   */
  getFileSystem(): FileSystemProvider {
    return this.fs
  }

  /**
   * Gets the working directory path (universal interface method)
   * @returns Directory path
   */
  getDirectory(): string {
    return this.dir
  }

  /**
   * Gets the Repository instance (universal interface method)
   * @returns Repository instance if available, null otherwise
   */
  getRepository(): Repository | null {
    return this._repo
  }

  // ============================================================================
  // Submodule Operations
  // ============================================================================

  /**
   * Add a submodule to this worktree backend
   */
  async addSubmodule(normalizedPath: string, submoduleRepo: Repository): Promise<void> {
    await addSubmoduleToBackend(this, normalizedPath, submoduleRepo, this._submoduleCache)
  }

  /**
   * Get submodule worktree backend by path
   */
  async getSubmodule(submodulePath: string): Promise<GitWorktreeBackend | null> {
    return await getSubmoduleFromBackend(
      this,
      submodulePath,
      this._repo,
      this._submoduleCache,
      (path) => this.loadSubmoduleBackend(path)
    )
  }

  /**
   * List all submodule worktrees
   */
  async listSubmodules(): Promise<Array<{ path: string; backend: GitWorktreeBackend }>> {
    if (!this._repo) {
      return []
    }

    const { parseGitmodules } = await import('../../../core-utils/filesystem/SubmoduleManager.ts')
    const submodules = await parseGitmodules({ repo: this._repo })
    const results: Array<{ path: string; backend: GitWorktreeBackend }> = []

    for (const [name, info] of submodules.entries()) {
      const backend = await this.getSubmodule(info.path)
      if (backend) {
        results.push({
          path: info.path,
          backend,
        })
      }
    }

    // Also include any submodules added via addSubmodule() that aren't in .gitmodules
    for (const cachedPath of this._submoduleCache.keys()) {
      // Check if already in results
      if (!results.some(r => normalize(r.path) === cachedPath)) {
        const backend = this._submoduleCache.get(cachedPath)
        if (backend) {
          results.push({
            path: cachedPath,
            backend,
          })
        }
      }
    }

    return results
  }

  /**
   * Check if a path is within a submodule
   */
  async getSubmoduleForPath(path: string): Promise<string | null> {
    if (!this._repo) {
      return null
    }

    const normalizedPath = normalize(path)
    const { parseGitmodules } = await import('../../../core-utils/filesystem/SubmoduleManager.ts')
    const submodules = await parseGitmodules({ repo: this._repo })

    for (const [name, info] of submodules.entries()) {
      const submodulePath = normalize(info.path)
      if (normalizedPath === submodulePath || normalizedPath.startsWith(submodulePath + '/')) {
        return submodulePath
      }
    }

    return null
  }

  /**
   * Resolve a path across worktree boundaries
   */
  async resolvePath(path: string): Promise<{
    worktree: GitWorktreeBackend
    relativePath: string
    submodulePath?: string
  }> {
    const normalizedPath = normalize(path)
    const submodulePath = await this.getSubmoduleForPath(normalizedPath)

    if (submodulePath) {
      const submoduleBackend = await this.getSubmodule(submodulePath)
      if (submoduleBackend) {
        const relativePath = normalizedPath === submodulePath
          ? '.'
          : normalizedPath.substring(submodulePath.length + 1)
        
        // Recursively resolve in submodule (supports nested submodules)
        if (submoduleBackend.resolvePath) {
          return submoduleBackend.resolvePath(relativePath)
        }
        
        return {
          worktree: submoduleBackend,
          relativePath,
          submodulePath,
        }
      }
    }

    // Path is in current worktree
    return {
      worktree: this,
      relativePath: normalizedPath,
    }
  }

  /**
   * Loads a submodule backend by path
   */
  private async loadSubmoduleBackend(submodulePath: string): Promise<GitWorktreeBackend | null> {
    if (!this._repo) {
      return null
    }

    try {
      // Get submodule Repository
      const submoduleRepo = await this._repo.getSubmodule(submodulePath)
      
      // Get the submodule's WorktreeBackend
      const submoduleWorktree = await submoduleRepo.getWorktree()
      if (!submoduleWorktree) {
        return null
      }
      
      const submoduleBackend = submoduleWorktree.backend
      if (!submoduleBackend) {
        return null
      }

      return submoduleBackend
    } catch {
      // Submodule not initialized or error accessing it
      return null
    }
  }

  /**
   * Resolves a path to determine if it's inside a submodule
   * If the path is inside a submodule, returns the submodule's WorktreeBackend and relative path
   * Otherwise, returns null
   * 
   * @param path - File path relative to working directory root
   * @returns Object with submodule WorktreeBackend and relative path, or null if not a submodule
   */
  private async resolveSubmodulePath(path: string): Promise<{ backend: GitWorktreeBackend; submodulePath: string } | null> {
    if (!this._repo) {
      return null
    }

    // Use the new resolvePath method for consistency
    const resolved = await this.resolvePath(path)
    
    // If resolved to a different worktree, return it
    if (resolved.worktree !== this) {
      return {
        backend: resolved.worktree,
        submodulePath: resolved.relativePath,
      }
    }
    
    return null
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  async read(
    path: string,
    options?: { encoding?: string; autocrlf?: string } | string
  ): Promise<UniversalBuffer | string | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.read(submodule.submodulePath, options)
    }
    
    const fullPath = join(this.dir, path)
    return this.fs.read(fullPath, options)
  }

  async write(
    path: string,
    data: UniversalBuffer | Uint8Array | string,
    options?: Record<string, unknown> | string
  ): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.write(submodule.submodulePath, data, options)
    }
    
    const fullPath = join(this.dir, path)
    await this.fs.write(fullPath, data, options)
  }

  async exists(path: string, options?: Record<string, unknown>): Promise<boolean> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.exists(submodule.submodulePath, options)
    }
    
    const fullPath = join(this.dir, path)
    return this.fs.exists(fullPath, options)
  }

  // ============================================================================
  // Directory Operations
  // ============================================================================

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.mkdir(submodule.submodulePath, options)
    }
    
    const fullPath = join(this.dir, path)
    await this.fs.mkdir(fullPath, options)
  }

  async readdir(path: string): Promise<string[] | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.readdir(submodule.submodulePath)
    }
    
    const fullPath = join(this.dir, path)
    return this.fs.readdir(fullPath)
  }

  async readdirDeep(path: string): Promise<string[]> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.readdirDeep(submodule.submodulePath)
    }
    
    const fullPath = join(this.dir, path)
    return this.fs.readdirDeep(fullPath)
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.rmdir(submodule.submodulePath, options)
    }
    
    const fullPath = join(this.dir, path)
    await this.fs.rmdir(fullPath, options)
  }

  // ============================================================================
  // File Removal
  // ============================================================================

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.rm(submodule.submodulePath, options)
    }
    
    const fullPath = join(this.dir, path)
    await this.fs.rm(fullPath, options)
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  async stat(path: string): Promise<ExtendedStat | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.stat(submodule.submodulePath)
    }
    
    const fullPath = join(this.dir, path)
    return this.fs.stat(fullPath)
  }

  async lstat(path: string): Promise<ExtendedStat | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.lstat(submodule.submodulePath)
    }
    
    const fullPath = join(this.dir, path)
    return this.fs.lstat(fullPath)
  }

  // ============================================================================
  // Symlink Operations
  // ============================================================================

  async readlink(
    path: string,
    options?: { encoding?: string }
  ): Promise<UniversalBuffer | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.readlink(submodule.submodulePath, options)
    }
    
    const fullPath = join(this.dir, path)
    return this.fs.readlink(fullPath, options)
  }

  async writelink(path: string, target: string): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolveSubmodulePath(path)
    if (submodule) {
      return submodule.backend.writelink(submodule.submodulePath, target)
    }
    
    const fullPath = join(this.dir, path)
    // FileSystem.writelink expects a Buffer, but we accept string for convenience
    await this.fs.writelink(fullPath, UniversalBuffer.from(target, 'utf8'))
  }

  // ============================================================================
  // Sparse Checkout Operations
  // ============================================================================

  async sparseCheckoutInit(gitdir: string, cone?: boolean): Promise<void> {
    const { sparseCheckout } = await import('../../../commands/sparseCheckout.ts')
    await sparseCheckout({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      init: true,
      cone: cone ?? false,
    })
  }

  async sparseCheckoutSet(
    gitdir: string,
    patterns: string[],
    treeOid: string,
    cone?: boolean
  ): Promise<void> {
    const { sparseCheckout } = await import('../../../commands/sparseCheckout.ts')
    await sparseCheckout({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      set: patterns,
      treeOid,
      cone,
    })
  }

  async sparseCheckoutList(gitdir: string): Promise<string[]> {
    const { sparseCheckout } = await import('../../../commands/sparseCheckout.ts')
    return await sparseCheckout({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      list: true,
    })
  }

  // ============================================================================
  // File Operations (Staging Area)
  // ============================================================================

  async add(
    gitdir: string,
    filepaths: string | string[],
    options?: { force?: boolean; update?: boolean }
  ): Promise<void> {
    const { add } = await import('../../../commands/add.ts')
    await add({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      filepath: filepaths,
      force: options?.force,
      update: options?.update,
    })
  }

  async remove(
    gitdir: string,
    filepaths: string | string[],
    options?: { cached?: boolean; force?: boolean }
  ): Promise<void> {
    const { remove } = await import('../../../commands/remove.ts')
    await remove({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      filepath: filepaths,
      cached: options?.cached,
      force: options?.force,
    })
  }

  // ============================================================================
  // Commit Operations
  // ============================================================================

  async commit(
    gitdir: string,
    message: string,
    options?: {
      author?: Partial<import('../../../models/GitCommit.ts').Author>
      committer?: Partial<import('../../../models/GitCommit.ts').Author>
      noVerify?: boolean
      amend?: boolean
      ref?: string
      parent?: string[]
      tree?: string
    }
  ): Promise<string> {
    const { commit } = await import('../../../commands/commit.ts')
    return await commit({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      message,
      author: options?.author,
      committer: options?.committer,
      noVerify: options?.noVerify,
      amend: options?.amend,
      ref: options?.ref,
      parent: options?.parent,
      tree: options?.tree,
    })
  }

  // ============================================================================
  // Branch/Checkout Operations
  // ============================================================================

  async checkout(
    gitdir: string,
    ref: string,
    options?: {
      filepaths?: string[]
      force?: boolean
      noCheckout?: boolean
      noUpdateHead?: boolean
      dryRun?: boolean
      sparsePatterns?: string[]
      onProgress?: import('../../remote/types.ts').ProgressCallback
      remote?: string
      track?: boolean
    }
  ): Promise<void> {
    const { checkout } = await import('../../../commands/checkout.ts')
    await checkout({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      ref,
      filepaths: options?.filepaths,
      force: options?.force,
      noCheckout: options?.noCheckout,
      noUpdateHead: options?.noUpdateHead,
      dryRun: options?.dryRun,
      sparsePatterns: options?.sparsePatterns,
      onProgress: options?.onProgress,
      remote: options?.remote,
      track: options?.track,
    })
  }

  async switch(
    gitdir: string,
    branch: string,
    options?: {
      create?: boolean
      force?: boolean
      track?: boolean
      remote?: string
    }
  ): Promise<void> {
    // Switch is essentially checkout with branch switching
    // For now, delegate to checkout - a proper switch command can be added later
    await this.checkout(gitdir, branch, {
      force: options?.force,
      track: options?.track,
      remote: options?.remote,
    })
  }

  // ============================================================================
  // Status Operations
  // ============================================================================

  async status(
    gitdir: string,
    filepath: string
  ): Promise<import('../../../commands/status.ts').FileStatus> {
    const { status } = await import('../../../commands/status.ts')
    return await status({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      filepath,
    })
  }

  async statusMatrix(
    gitdir: string,
    options?: { filepaths?: string[] }
  ): Promise<import('../../../commands/statusMatrix.ts').StatusRow[]> {
    const { statusMatrix } = await import('../../../commands/statusMatrix.ts')
    return await statusMatrix({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      filepaths: options?.filepaths,
    })
  }

  // ============================================================================
  // Reset Operations
  // ============================================================================

  async reset(
    gitdir: string,
    ref?: string,
    mode?: 'soft' | 'mixed' | 'hard'
  ): Promise<void> {
    const { reset } = await import('../../../commands/reset.ts')
    await reset({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      ref: ref || 'HEAD',
      mode: mode || 'mixed',
    })
  }

  // ============================================================================
  // Diff Operations
  // ============================================================================

  async diff(
    gitdir: string,
    options?: {
      ref?: string
      filepaths?: string[]
      cached?: boolean
    }
  ): Promise<import('../../../commands/diff.ts').DiffResult> {
    const { diff } = await import('../../../commands/diff.ts')
    return await diff({
      fs: this.fs,
      gitdir,
      dir: this.dir,
      ref: options?.ref,
      filepaths: options?.filepaths,
      cached: options?.cached,
    })
  }

  // ============================================================================
  // Merge Operations
  // ============================================================================

  async mergeTree(
    gitdir: string,
    ourOid: string,
    baseOid: string,
    theirOid: string,
    options?: {
      ourName?: string
      baseName?: string
      theirName?: string
      dryRun?: boolean
      abortOnConflict?: boolean
      mergeDriver?: import('../../merge/types.ts').MergeDriverCallback
    }
  ): Promise<string | import('../../../errors/MergeConflictError.ts').MergeConflictError> {
    const { mergeTree } = await import('../../../git/merge/mergeTree.ts')
    // Read index for mergeTree
    const { Repository } = await import('../../../core-utils/Repository.ts')
    const repo = await Repository.open({
      fs: this.fs,
      dir: this.dir,
      gitdir,
      cache: {},
      autoDetectConfig: true,
    })
    const index = await repo.readIndexDirect(false, true, gitdir)
    
    return await mergeTree({
      repo,
      index,
      ourOid,
      baseOid,
      theirOid,
      ourName: options?.ourName,
      baseName: options?.baseName,
      theirName: options?.theirName,
      dryRun: options?.dryRun,
      abortOnConflict: options?.abortOnConflict,
      mergeDriver: options?.mergeDriver,
    })
  }

  // ============================================================================
  // Worktree Config Operations
  // ============================================================================

  async readWorktreeConfig(gitdir: string): Promise<import('../../../core-utils/ConfigParser.ts').ConfigObject | null> {
    const { readWorktreeConfig } = await import('../../config/worktreeConfig.ts')
    return readWorktreeConfig({ fs: this.fs, gitdir })
  }

  async writeWorktreeConfig(
    gitdir: string,
    config: import('../../../core-utils/ConfigParser.ts').ConfigObject
  ): Promise<void> {
    const { writeWorktreeConfig } = await import('../../config/worktreeConfig.ts')
    return writeWorktreeConfig({ fs: this.fs, gitdir, config })
  }
}


