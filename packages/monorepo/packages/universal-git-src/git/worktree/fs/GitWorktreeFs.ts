import type { FileSystem, FileSystemProvider } from '../../../models/FileSystem.ts'
import type { ExtendedStat } from '../../../utils/statHelpers.ts'
import type { GitWorktreeBackend } from '../GitWorktreeBackend.ts'
import type { Repository } from '../../../core-utils/Repository.ts'
import type { GitBackend } from '../../../backends/GitBackend.ts'
import type { Walker } from '../../../models/Walker.ts'
import { join, normalize } from '../../../core-utils/GitPath.ts'
import { UniversalBuffer } from '../../../utils/UniversalBuffer.ts'
import { createFileSystem } from '../../../utils/createFileSystem.ts'
import { SubmoduleCache, addSubmoduleToBackend, getSubmoduleFromBackend } from '../SubmoduleManager.ts'
import AsyncLock from 'async-lock'

// Index lock for commit operations
let indexLock: AsyncLock | undefined

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
  private _submoduleInfo: Map<string, { name: string; path: string; url: string; branch?: string }> = new Map()
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

  /**
   * Gets the working directory path if this backend has a directory
   * @returns Directory path if available, null otherwise
   */
  getDirectory(): string | null {
    return this.dir
  }

  // ============================================================================
  // Git Directory Discovery Operations
  // ============================================================================

  /**
   * Find the .git directory for this worktree
   * @returns Path to .git directory, or null if not found
   */
  async findGitBackend(): Promise<string | null> {
    try {
      const { findRoot } = await import('../../../commands/findRoot.ts')
      const root = await findRoot({ fs: this.fs, filepath: this.dir })
      const gitdir = join(root, '.git')
      // Verify it exists
      const configPath = join(gitdir, 'config')
      if (await this.fs.exists(configPath)) {
        return normalize(gitdir)
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * List all .git folders in the worktree (including submodules)
   * @returns Array of paths to .git directories
   */
  async listGitFolders(): Promise<string[]> {
    const gitdirs: string[] = []
    
    // Find main .git directory
    const mainGitdir = await this.findGitBackend()
    if (mainGitdir) {
      gitdirs.push(mainGitdir)
    }

    // Find submodule .git directories using stored submodule info
    try {
      for (const [path, info] of this._submoduleInfo.entries()) {
        const submodulePath = join(this.dir, info.path)
        const submoduleGitdir = join(submodulePath, '.git')
        if (await this.fs.exists(join(submoduleGitdir, 'config'))) {
          gitdirs.push(normalize(submoduleGitdir))
        }
      }
    } catch {
      // Ignore errors when checking submodules
    }

    return gitdirs
  }

  // ============================================================================
  // Submodule Operations
  // ============================================================================

  /**
   * Get submodule information by path
   * Called by GitBackend to query submodule info
   */
  async getSubmodule(path: string): Promise<{ name: string; path: string; url: string; branch?: string } | null> {
    return this._submoduleInfo.get(path) || null
  }

  /**
   * Set submodule information
   * Called by GitBackend to store submodule info
   */
  async setSubmodule(path: string, info: { name: string; path: string; url: string; branch?: string }): Promise<void> {
    this._submoduleInfo.set(path, info)
  }

  /**
   * Get submodule worktree backend by path
   */
  async getSubmoduleBackend(submodulePath: string): Promise<GitWorktreeBackend | null> {
    return await getSubmoduleFromBackend(
      this,
      submodulePath,
      this._submoduleCache,
      (path) => this.loadSubmoduleBackend(path)
    )
  }

  /**
   * List all submodule worktrees
   */
  async listSubmodules(): Promise<Array<{ path: string; backend: GitWorktreeBackend }>> {
    const results: Array<{ path: string; backend: GitWorktreeBackend }> = []

    // Use stored submodule info
    for (const [path, info] of this._submoduleInfo.entries()) {
      const backend = await this.getSubmoduleBackend(info.path)
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
    const normalizedPath = normalize(path)

    // Use stored submodule info
    for (const [storedPath, info] of this._submoduleInfo.entries()) {
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
      const submoduleBackend = await this.getSubmoduleBackend(submodulePath)
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
   * This method is called by getSubmoduleFromBackend when a submodule backend needs to be loaded.
   * Since we don't have access to Repository, we can only return null here.
   * The actual submodule backend loading should be handled by Repository via GitBackend.
   */
  private async loadSubmoduleBackend(submodulePath: string): Promise<GitWorktreeBackend | null> {
    // Without Repository access, we cannot load submodule backends
    // This should be handled by Repository.getSubmodule() which creates the submodule Repository
    // and then gets its worktree backend
    return null
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

  async listFiles(): Promise<string[]> {
    // List all files in the working directory recursively
    return this.readdirDeep('.')
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
  // Sparse Checkout Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.sparseCheckoutInit(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // File Operations (Staging Area) - MOVED TO GitBackend
  // These methods have been moved to GitBackend.add() and GitBackend.remove()
  // Use gitBackend.add(worktreeBackend, ...) and gitBackend.remove(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Commit Operations - MOVED TO GitBackend
  // This method has been moved to GitBackend.commit()
  // Use gitBackend.commit(worktreeBackend, ...) instead
  // ============================================================================

  // REMOVED: commit() method - now in GitBackend

  // ============================================================================
  // Branch/Checkout Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.checkout(worktreeBackend, ...) instead
  // ============================================================================

  // REMOVED: checkout() method - now in GitBackend
  // REMOVED: switch() method - now in GitBackend

  // ============================================================================
  // Status Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.status(worktreeBackend, ...) instead
  // ============================================================================

  // REMOVED: status() method - now in GitBackend
  // REMOVED: statusMatrix() method - now in GitBackend

  // ============================================================================
  // Reset Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.reset(worktreeBackend, ...) instead
  // ============================================================================

  // REMOVED: reset() method - now in GitBackend

  // ============================================================================
  // Diff Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.diff(worktreeBackend, ...) instead
  // ============================================================================

  // REMOVED: diff() method - now in GitBackend

  // ============================================================================
  // Merge Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.mergeTree(worktreeBackend, ...) instead
  // ============================================================================

  // REMOVED: mergeTree() method - now in GitBackend

  // ============================================================================
  // Worktree Config Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.readWorktreeConfig(worktreeBackend), gitBackend.getWorktreeConfig(worktreeBackend, path), etc.
  // ============================================================================

  // ============================================================================
  // Sparse Checkout Operations (Config-based) - REMOVED (duplicate)
  // These are already implemented above in the "Sparse Checkout Operations" section
  // ============================================================================

  // ============================================================================
  // Submodule Operations
  // ============================================================================
  // Note: listSubmodules() is already implemented above (line 219)

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private renderCommitHeaders(commit: any): Uint8Array {
    // This is a placeholder implementation - the actual method should be elsewhere
    throw new Error('renderCommitHeaders should not be called on GitWorktreeFs')
  }

  private async constructTree(options: any): Promise<string> {
    // This is a placeholder implementation - the actual method should be elsewhere
    throw new Error('constructTree should not be called on GitWorktreeFs')
  }

  // ============================================================================
  // Walker Creation
  // ============================================================================

  async createWorkdirWalker(gitBackend: GitBackend): Promise<import('../../../models/GitWalkerFs.ts').GitWalkerFs> {
    const { GitWalkerFs } = await import('../../../models/GitWalkerFs.ts')
    return new GitWalkerFs({ worktreeBackend: this, gitBackend })
  }
}

// ============================================================================
// Helper Functions (moved from class methods)
// ============================================================================

type AddEntriesParams = {
  dir: string
  gitdir: string
  fs: FileSystem
  repo: Repository
  filepath: string | string[]
  index: import('../../../git/index/GitIndex.ts').GitIndex
  force: boolean
  parallel: boolean
  autocrlf: string
}

// ============================================================================
// REMOVED: All methods below have been moved to GitBackend
// - checkout() -> GitBackend.checkout()
// - switch() -> GitBackend.switch()
// - status() -> GitBackend.status()
// - statusMatrix() -> GitBackend.statusMatrix()
// - reset() -> GitBackend.reset()
// - diff() -> GitBackend.diff()
// - mergeTree() -> GitBackend.mergeTree()
// ============================================================================
