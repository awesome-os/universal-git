import type { GitWorktreeBackend } from '../GitWorktreeBackend.ts'
import type { Repository } from '../../../core-utils/Repository.ts'
import type { ExtendedStat } from '../../../utils/statHelpers.ts'
import type { UniversalBuffer } from '../../../utils/UniversalBuffer.ts'
import { SubmoduleCache, addSubmoduleToBackend, getSubmoduleFromBackend } from '../SubmoduleManager.ts'
import { normalize } from '../../../core-utils/GitPath.ts'

/**
 * GitWorktreeMemory - In-memory implementation of GitWorktreeBackend
 * 
 * This backend stores all working directory files in memory using Maps.
 * Useful for testing and temporary operations.
 * 
 * **Submodule Awareness**:
 * 
 * This backend is multi-worktree aware and handles submodules by delegating to
 * the submodule's WorktreeBackend. When a path is inside a submodule, operations
 * are delegated to the submodule's WorktreeBackend.
 */
export class GitWorktreeMemory implements GitWorktreeBackend {
  readonly name: string
  private readonly _files: Map<string, UniversalBuffer> = new Map()
  private readonly _dirs: Set<string> = new Set()
  private _repo: Repository | null = null
  private _submoduleCache: SubmoduleCache = new SubmoduleCache()

  constructor(name?: string | null) {
    this.name = name ?? crypto.randomUUID()
    // Root directory always exists
    this._dirs.add('.')
  }

  getFileSystem(): null {
    return null // Memory backend doesn't use filesystem
  }

  getDirectory(): null {
    return null // Memory backend doesn't have a directory path
  }

  getRepository(): Repository | null {
    return this._repo
  }

  setRepository(repo: Repository | null): void {
    this._repo = repo
    this._submoduleCache.clear()
  }

  // ============================================================================
  // Submodule Operations
  // ============================================================================

  async addSubmodule(normalizedPath: string, submoduleRepo: Repository): Promise<void> {
    await addSubmoduleToBackend(this, normalizedPath, submoduleRepo, this._submoduleCache)
  }

  async getSubmodule(submodulePath: string): Promise<GitWorktreeBackend | null> {
    return await getSubmoduleFromBackend(
      this,
      submodulePath,
      this._repo,
      this._submoduleCache,
      async (path) => {
        // Load submodule from Repository
        if (!this._repo) {
          return null
        }
        
        try {
          const submoduleRepo = await this._repo.getSubmodule(path)
          const submoduleWorktree = await submoduleRepo.getWorktree()
          return submoduleWorktree?.backend || null
        } catch {
          return null
        }
      }
    )
  }

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

    // Also include any submodules added via addSubmodule()
    for (const cachedPath of this._submoduleCache.keys()) {
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

    // Also check cached submodules
    for (const cachedPath of this._submoduleCache.keys()) {
      if (normalizedPath === cachedPath || normalizedPath.startsWith(cachedPath + '/')) {
        return cachedPath
      }
    }

    return null
  }

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

    return {
      worktree: this,
      relativePath: normalizedPath,
    }
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  async read(
    path: string,
    options?: { encoding?: string; autocrlf?: string } | string
  ): Promise<UniversalBuffer | string | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.read(submodule.relativePath, options)
    }

    const normalizedPath = normalize(path)
    const content = this._files.get(normalizedPath)
    if (!content) {
      return null
    }

    if (typeof options === 'string' || options?.encoding) {
      const encoding = typeof options === 'string' ? options : options.encoding || 'utf8'
      return content.toString(encoding)
    }

    return content
  }

  async write(
    path: string,
    data: UniversalBuffer | Uint8Array | string,
    options?: Record<string, unknown> | string
  ): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.write(submodule.relativePath, data, options)
    }

    const normalizedPath = normalize(path)
    const buffer = UniversalBuffer.isBuffer(data)
      ? data
      : data instanceof Uint8Array
      ? UniversalBuffer.from(data)
      : UniversalBuffer.from(data, 'utf8')

    this._files.set(normalizedPath, buffer)
    
    // Ensure parent directories exist
    const parts = normalizedPath.split('/')
    for (let i = 1; i < parts.length; i++) {
      this._dirs.add(parts.slice(0, i).join('/'))
    }
  }

  async exists(path: string, options?: Record<string, unknown>): Promise<boolean> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.exists(submodule.relativePath, options)
    }

    const normalizedPath = normalize(path)
    return this._files.has(normalizedPath) || this._dirs.has(normalizedPath)
  }

  // ============================================================================
  // Directory Operations
  // ============================================================================

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.mkdir(submodule.relativePath, options)
    }

    const normalizedPath = normalize(path)
    this._dirs.add(normalizedPath)
    
    // Ensure parent directories exist
    const parts = normalizedPath.split('/')
    for (let i = 1; i < parts.length; i++) {
      this._dirs.add(parts.slice(0, i).join('/'))
    }
  }

  async readdir(path: string): Promise<string[] | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.readdir(submodule.relativePath)
    }

    const normalizedPath = normalize(path)
    if (!this._dirs.has(normalizedPath)) {
      return null
    }

    const prefix = normalizedPath === '.' ? '' : normalizedPath + '/'
    const children = new Set<string>()

    for (const filePath of this._files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relative = filePath.substring(prefix.length)
        const firstSlash = relative.indexOf('/')
        if (firstSlash === -1) {
          children.add(relative)
        } else {
          children.add(relative.substring(0, firstSlash))
        }
      }
    }

    for (const dirPath of this._dirs) {
      if (dirPath.startsWith(prefix) && dirPath !== normalizedPath) {
        const relative = dirPath.substring(prefix.length)
        const firstSlash = relative.indexOf('/')
        if (firstSlash === -1) {
          children.add(relative)
        } else {
          children.add(relative.substring(0, firstSlash))
        }
      }
    }

    return Array.from(children)
  }

  async readdirDeep(path: string): Promise<string[]> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.readdirDeep(submodule.relativePath)
    }

    const normalizedPath = normalize(path)
    const prefix = normalizedPath === '.' ? '' : normalizedPath + '/'
    const files: string[] = []

    for (const filePath of this._files.keys()) {
      if (filePath.startsWith(prefix)) {
        files.push(filePath.substring(prefix.length))
      }
    }

    return files
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.rmdir(submodule.relativePath, options)
    }

    const normalizedPath = normalize(path)
    this._dirs.delete(normalizedPath)
    
    if (options?.recursive) {
      const prefix = normalizedPath + '/'
      for (const filePath of Array.from(this._files.keys())) {
        if (filePath.startsWith(prefix)) {
          this._files.delete(filePath)
        }
      }
      for (const dirPath of Array.from(this._dirs)) {
        if (dirPath.startsWith(prefix)) {
          this._dirs.delete(dirPath)
        }
      }
    }
  }

  // ============================================================================
  // File Removal
  // ============================================================================

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.rm(submodule.relativePath, options)
    }

    const normalizedPath = normalize(path)
    this._files.delete(normalizedPath)
    this._dirs.delete(normalizedPath)
    
    if (options?.recursive) {
      const prefix = normalizedPath + '/'
      for (const filePath of Array.from(this._files.keys())) {
        if (filePath.startsWith(prefix)) {
          this._files.delete(filePath)
        }
      }
      for (const dirPath of Array.from(this._dirs)) {
        if (dirPath.startsWith(prefix)) {
          this._dirs.delete(dirPath)
        }
      }
    }
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  async stat(path: string): Promise<ExtendedStat | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.stat(submodule.relativePath)
    }

    const normalizedPath = normalize(path)
    if (this._files.has(normalizedPath)) {
      const content = this._files.get(normalizedPath)!
      return {
        type: 'file',
        size: content.length,
        mode: 0o100644,
        mtime: Date.now(),
        ctime: Date.now(),
      } as ExtendedStat
    }
    if (this._dirs.has(normalizedPath)) {
      return {
        type: 'dir',
        size: 0,
        mode: 0o040000,
        mtime: Date.now(),
        ctime: Date.now(),
      } as ExtendedStat
    }
    return null
  }

  async lstat(path: string): Promise<ExtendedStat | null> {
    return this.stat(path) // Memory backend doesn't distinguish symlinks
  }

  // ============================================================================
  // Symlink Operations
  // ============================================================================

  async readlink(
    path: string,
    options?: { encoding?: string }
  ): Promise<UniversalBuffer | null> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.readlink(submodule.relativePath, options)
    }

    // Memory backend doesn't support symlinks
    return null
  }

  async writelink(path: string, target: string): Promise<void> {
    // Check if path is in a submodule and delegate if so
    const submodule = await this.resolvePath(path)
    if (submodule.worktree !== this) {
      return submodule.worktree.writelink(submodule.relativePath, target)
    }

    // Memory backend doesn't support symlinks
    throw new Error('Memory backend does not support symlinks')
  }

  // ============================================================================
  // Stub implementations for other required methods
  // ============================================================================

  async readWorktreeConfig(gitdir: string): Promise<import('../../../core-utils/ConfigParser.ts').ConfigObject | null> {
    return null // Memory backend doesn't persist config
  }

  async writeWorktreeConfig(
    gitdir: string,
    config: import('../../../core-utils/ConfigParser.ts').ConfigObject
  ): Promise<void> {
    // Memory backend doesn't persist config
  }

  async sparseCheckoutInit(gitdir: string, cone?: boolean): Promise<void> {
    // Stub - would need to delegate to commands
    throw new Error('sparseCheckoutInit not implemented for memory backend')
  }

  async sparseCheckoutSet(
    gitdir: string,
    patterns: string[],
    treeOid: string,
    cone?: boolean
  ): Promise<void> {
    throw new Error('sparseCheckoutSet not implemented for memory backend')
  }

  async sparseCheckoutList(gitdir: string): Promise<string[]> {
    return []
  }

  async add(
    gitdir: string,
    filepaths: string | string[],
    options?: { force?: boolean; update?: boolean }
  ): Promise<void> {
    throw new Error('add not implemented for memory backend')
  }

  async remove(
    gitdir: string,
    filepaths: string | string[],
    options?: { cached?: boolean; force?: boolean }
  ): Promise<void> {
    throw new Error('remove not implemented for memory backend')
  }

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
    throw new Error('commit not implemented for memory backend')
  }

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
    throw new Error('checkout not implemented for memory backend')
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
    throw new Error('switch not implemented for memory backend')
  }

  async status(
    gitdir: string,
    filepath: string
  ): Promise<import('../../../commands/status.ts').FileStatus> {
    throw new Error('status not implemented for memory backend')
  }

  async statusMatrix(
    gitdir: string,
    options?: { filepaths?: string[] }
  ): Promise<import('../../../commands/statusMatrix.ts').StatusRow[]> {
    throw new Error('statusMatrix not implemented for memory backend')
  }

  async reset(
    gitdir: string,
    ref?: string,
    mode?: 'soft' | 'mixed' | 'hard'
  ): Promise<void> {
    throw new Error('reset not implemented for memory backend')
  }

  async diff(
    gitdir: string,
    options?: {
      ref?: string
      filepaths?: string[]
      cached?: boolean
    }
  ): Promise<import('../../../commands/diff.ts').DiffResult> {
    throw new Error('diff not implemented for memory backend')
  }

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
    throw new Error('mergeTree not implemented for memory backend')
  }
}

