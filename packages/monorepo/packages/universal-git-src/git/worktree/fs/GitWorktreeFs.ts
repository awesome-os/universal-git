import type { FileSystem, FileSystemProvider } from '../../../models/FileSystem.ts'
import type { ExtendedStat } from '../../../utils/statHelpers.ts'
import type { GitWorktreeBackend } from '../GitWorktreeBackend.ts'
import { join } from '../../../core-utils/GitPath.ts'
import { UniversalBuffer } from '../../../utils/UniversalBuffer.ts'
import { createFileSystem } from '../../../utils/createFileSystem.ts'

/**
 * GitWorktreeFs - Filesystem implementation of GitWorktreeBackend
 * 
 * This backend stores all working directory files using the traditional filesystem,
 * wrapping the FileSystem class to provide the GitWorktreeBackend interface.
 * 
 * This is the default implementation.
 */
export class GitWorktreeFs implements GitWorktreeBackend {
  private readonly fs: FileSystem
  private readonly dir: string

  constructor(
    fs: FileSystem | FileSystemProvider,
    dir: string
  ) {
    // CRITICAL: Normalize filesystem using factory function
    // This ensures consistent API, proper caching, and Repository instance caching
    this.fs = createFileSystem(fs)
    this.dir = dir
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

  // ============================================================================
  // File Operations
  // ============================================================================

  async read(
    path: string,
    options?: { encoding?: string; autocrlf?: string } | string
  ): Promise<UniversalBuffer | string | null> {
    const fullPath = join(this.dir, path)
    return this.fs.read(fullPath, options)
  }

  async write(
    path: string,
    data: UniversalBuffer | Uint8Array | string,
    options?: Record<string, unknown> | string
  ): Promise<void> {
    const fullPath = join(this.dir, path)
    await this.fs.write(fullPath, data, options)
  }

  async exists(path: string, options?: Record<string, unknown>): Promise<boolean> {
    const fullPath = join(this.dir, path)
    return this.fs.exists(fullPath, options)
  }

  // ============================================================================
  // Directory Operations
  // ============================================================================

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const fullPath = join(this.dir, path)
    await this.fs.mkdir(fullPath, options)
  }

  async readdir(path: string): Promise<string[] | null> {
    const fullPath = join(this.dir, path)
    return this.fs.readdir(fullPath)
  }

  async readdirDeep(path: string): Promise<string[]> {
    const fullPath = join(this.dir, path)
    return this.fs.readdirDeep(fullPath)
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const fullPath = join(this.dir, path)
    await this.fs.rmdir(fullPath, options)
  }

  // ============================================================================
  // File Removal
  // ============================================================================

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    const fullPath = join(this.dir, path)
    await this.fs.rm(fullPath, options)
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  async stat(path: string): Promise<ExtendedStat | null> {
    const fullPath = join(this.dir, path)
    return this.fs.stat(fullPath)
  }

  async lstat(path: string): Promise<ExtendedStat | null> {
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
    const fullPath = join(this.dir, path)
    return this.fs.readlink(fullPath, options)
  }

  async writelink(path: string, target: string): Promise<void> {
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


