// RefManager import removed - using Repository.resolveRef/writeRef methods instead
import { readObject } from '../git/objects/readObject.ts'
import { parse as parseCommit } from './parsers/Commit.ts'
// StagingArea removed - use Repository.readIndexDirect/writeIndexDirect directly
import type { Repository } from './Repository.ts'
import type { ProgressCallback } from '../git/remote/types.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'

/**
 * Worktree - Represents a working tree (linked worktrees support)
 * Encapsulates the working directory and its associated git directory
 * Each worktree has its own staging area (index) and cache context
 * 
 * This class is a thin wrapper that delegates to GitWorktreeBackend implementations,
 * enabling chainable operations and backend-agnostic worktree operations.
 */
export class Worktree {
  private readonly repo: Repository
  private readonly backend: GitWorktreeBackend | null
  public readonly dir: string
  private _gitdir: string | null
  private _name: string | null
  // StagingArea removed - Worktree is now stateless, delegates to Repository

  private ensureFileSystem(): FileSystemProvider {
    const fs = this.repo.fs
    if (!fs) {
      throw new Error('Filesystem unavailable. Attach a WorktreeBackend before performing this operation.')
    }
    return fs
  }

  private requireBackend(): GitWorktreeBackend {
    if (!this.backend) {
      throw new Error('Worktree backend not available. Operations require a GitWorktreeBackend.')
    }
    return this.backend
  }

  constructor(
    repo: Repository,
    dir: string,
    gitdir: string | null = null,
    name: string | null = null,
    backend: GitWorktreeBackend | null = null
  ) {
    this.repo = repo
    this.dir = dir
    this._gitdir = gitdir
    this._name = name
    this.backend = backend
  }

  /**
   * Gets the Repository instance this worktree belongs to
   */
  get repository(): Repository {
    return this.repo
  }

  /**
   * Gets the git directory for this worktree
   * For main worktree: returns main repo's .git
   * For linked worktree: returns .git/worktrees/<name>
   */
  async getGitdir(): Promise<string> {
    if (this._gitdir) {
      return this._gitdir
    }
    // Resolve from repository
    this._gitdir = await this.repo.getGitdir()
    return this._gitdir
  }

  /**
   * Gets the git directory as a property
   */
  get gitdir(): Promise<string> {
    return this.getGitdir()
  }

  /**
   * Gets the worktree name
   * Returns null for the main worktree
   */
  getName(): string | null {
    return this._name
  }

  /**
   * Checks if this is the main worktree
   */
  async isMain(): Promise<boolean> {
    const mainGitdir = await this.repo.getGitdir()
    const worktreeGitdir = await this.getGitdir()
    return worktreeGitdir === mainGitdir
  }


  // ============================================================================
  // Checkout Operations - MOVED TO GitBackend
  // Checkout is a gitdir operation and should be called via gitBackend.checkout(worktreeBackend, ...)
  // Worktree only provides filesystem operations (read/write) via the backend
  // ============================================================================

  // ============================================================================
  // Backend Delegation Methods (Phase 0A.1)
  // ============================================================================
  // These methods delegate to GitWorktreeBackend when available,
  // falling back to direct command calls for backward compatibility

  /**
   * Initialize sparse checkout
   * @param cone - Use cone mode (default: false)
   * @returns This worktree instance for chaining
   */
  async sparseCheckoutInit(cone: boolean = false): Promise<Worktree> {
    const backend = this.requireBackend()
    await this.repo.gitBackend.sparseCheckoutInit(backend, cone)
    return this // Return self for chaining
  }

  /**
   * Set sparse checkout patterns
   * @param patterns - Array of patterns to include/exclude
   * @param cone - Use cone mode (optional, uses config if not provided)
   * @returns This worktree instance for chaining
   */
  async sparseCheckoutSet(patterns: string[], cone?: boolean): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    const repoFs = this.ensureFileSystem()
    const backend = this.requireBackend()
    const headOid = await this.repo.resolveRef('HEAD')
    const { object: commitObject } = await readObject({
      fs: repoFs,
      cache: this.repo.cache,
      gitdir,
      oid: headOid,
    })
    const commit = parseCommit(commitObject)
    await this.repo.gitBackend.sparseCheckoutSet(backend, patterns, commit.tree, cone)
    return this // Return self for chaining
  }

  /**
   * List current sparse checkout patterns
   * @returns Array of patterns
   */
  async sparseCheckoutList(): Promise<string[]> {
    const backend = this.requireBackend()
    return await this.repo.gitBackend.sparseCheckoutList(backend)
  }

  /**
   * Add files to the staging area
   * @param filepaths - Files or directories to add
   * @param options - Add options (force, update, etc.)
   * @returns This worktree instance for chaining
   */
  async add(
    filepaths: string | string[],
    options?: { force?: boolean; update?: boolean }
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    await backend.add(gitdir, filepaths, options)
    return this // Return self for chaining
  }

  /**
   * Remove files from the staging area and working directory
   * @param filepaths - Files to remove
   * @param options - Remove options (cached, force, etc.)
   * @returns This worktree instance for chaining
   */
  async remove(
    filepaths: string | string[],
    options?: { cached?: boolean; force?: boolean }
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    await backend.remove(gitdir, filepaths, options)
    return this // Return self for chaining
  }

  /**
   * Create a commit from the current staging area
   * @param message - Commit message
   * @param options - Commit options (author, committer, noVerify, etc.)
   * @returns Commit OID
   */
  async commit(
    message: string,
    options?: {
      author?: Partial<import('../models/GitCommit.ts').Author>
      committer?: Partial<import('../models/GitCommit.ts').Author>
      noVerify?: boolean
      amend?: boolean
      ref?: string
      parent?: string[]
      tree?: string
    }
  ): Promise<string> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    return await backend.commit(gitdir, message, options)
  }

  /**
   * Switch to a different branch (alias for checkout with branch switching)
   * @param branch - Branch name to switch to
   * @param options - Switch options (create, force, etc.)
   * @returns This worktree instance for chaining
   */
  async switch(
    branch: string,
    options?: {
      create?: boolean
      force?: boolean
      track?: boolean
      remote?: string
    }
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    await backend.switch(gitdir, branch, options)
    return this // Return self for chaining
  }

  /**
   * Get the status of a single file in the working directory
   * @param filepath - File path relative to working directory root
   * @returns File status
   */
  async status(filepath: string): Promise<import('../commands/status.ts').FileStatus> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    return await backend.status(gitdir, filepath)
  }

  /**
   * Get status matrix (more detailed than status) for multiple files
   * @param options - Status matrix options (filepaths, etc.)
   * @returns Status matrix array
   */
  async statusMatrix(
    options?: { filepaths?: string[] }
  ): Promise<import('../commands/statusMatrix.ts').StatusRow[]> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    return await backend.statusMatrix(gitdir, options)
  }

  /**
   * Reset the working directory and/or index to a specific commit
   * @param ref - Commit to reset to (default: HEAD)
   * @param mode - Reset mode: 'soft', 'mixed', 'hard' (default: 'mixed')
   * @returns This worktree instance for chaining
   */
  async reset(
    ref: string = 'HEAD',
    mode: 'soft' | 'mixed' | 'hard' = 'mixed'
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    await backend.reset(gitdir, ref, mode)
    return this // Return self for chaining
  }

  /**
   * Show changes between commits, commit and working tree, etc.
   * @param options - Diff options
   * @returns Diff result
   */
  async diff(
    options?: {
      ref?: string
      filepaths?: string[]
      cached?: boolean
    }
  ): Promise<import('../commands/diff.ts').DiffResult> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    return await backend.diff(gitdir, options)
  }

  /**
   * Merge trees with index management and worktree file writing
   * @param ourOid - Our tree OID
   * @param baseOid - Base tree OID
   * @param theirOid - Their tree OID
   * @param options - Merge options
   * @returns Merged tree OID or MergeConflictError
   */
  async mergeTree(
    ourOid: string,
    baseOid: string,
    theirOid: string,
    options?: {
      ourName?: string
      baseName?: string
      theirName?: string
      dryRun?: boolean
      abortOnConflict?: boolean
      mergeDriver?: import('../git/merge/types.ts').MergeDriverCallback
    }
  ): Promise<string | import('../errors/MergeConflictError.ts').MergeConflictError> {
    const gitdir = await this.getGitdir()
    const backend = this.requireBackend()
    return await backend.mergeTree(gitdir, ourOid, baseOid, theirOid, options)
  }
}

