import type { ExtendedStat } from '../../utils/statHelpers.ts'
import type { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileStatus } from '../../commands/status.ts'
import type { StatusRow } from '../../commands/statusMatrix.ts'
import type { DiffResult } from '../../commands/diff.ts'
import type { Author } from '../../models/GitCommit.ts'
import type { ProgressCallback } from '../remote/types.ts'
import type { MergeDriverCallback } from '../merge/types.ts'
import type { MergeConflictError } from '../../errors/MergeConflictError.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

/**
 * GitWorktreeBackend - Abstract interface for Git working directory storage backends
 * 
 * This interface abstracts all storage operations for Git working directory files,
 * allowing implementations using filesystem, blob storage, SQL, in-memory, or other storage mechanisms.
 * 
 * The working directory contains the actual project files (not Git repository data).
 * Git repository data (refs, objects, config, etc.) is handled by GitBackend.
 */
export interface GitWorktreeBackend {
  /**
   * The name of this worktree backend
   * For the main worktree, this is typically a UUID (auto-generated)
   * For linked worktrees, this is the worktree name (e.g., 'feature-worktree') or a UUID if not provided
   * This name is used to identify and retrieve worktrees
   */
  readonly name: string

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Read the contents of a file
   * @param path - File path relative to working directory root
   * @param options - Optional encoding options
   * @returns File contents as Buffer or string, or null if file doesn't exist
   */
  read(
    path: string,
    options?: { encoding?: string; autocrlf?: string } | string
  ): Promise<UniversalBuffer | string | null>

  /**
   * Write file contents (creates missing directories if needed)
   * @param path - File path relative to working directory root
   * @param data - File contents (Buffer, Uint8Array, or string)
   * @param options - Optional write options
   */
  write(
    path: string,
    data: UniversalBuffer | Uint8Array | string,
    options?: Record<string, unknown> | string
  ): Promise<void>

  /**
   * Check if a file or directory exists
   * @param path - File or directory path relative to working directory root
   * @param options - Optional options
   * @returns true if exists, false otherwise
   */
  exists(path: string, options?: Record<string, unknown>): Promise<boolean>

  // ============================================================================
  // Directory Operations
  // ============================================================================

  /**
   * Create a directory (or series of nested directories)
   * @param path - Directory path relative to working directory root
   * @param options - Optional configuration. `recursive` is always true
   */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>

  /**
   * Read directory contents
   * @param path - Directory path relative to working directory root
   * @returns Array of file/directory names, or null if not a directory
   */
  readdir(path: string): Promise<string[] | null>

  /**
   * Return a flat list of all files nested inside a directory (recursive)
   * @param path - Directory path relative to working directory root
   * @returns Array of all file paths (relative to working directory root)
   */
  readdirDeep(path: string): Promise<string[]>

  /**
   * Delete a directory
   * @param path - Directory path relative to working directory root
   * @param options - Optional configuration. `recursive` for recursive deletion
   */
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>

  // ============================================================================
  // File Removal
  // ============================================================================

  /**
   * Delete a file or directory
   * @param path - File or directory path relative to working directory root
   * @param options - Optional configuration. `recursive` for recursive deletion
   */
  rm(path: string, options?: { recursive?: boolean }): Promise<void>

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  /**
   * Get file/directory stats (follows symlinks)
   * @param path - File or directory path relative to working directory root
   * @returns ExtendedStat object or null if doesn't exist
   */
  stat(path: string): Promise<ExtendedStat | null>

  /**
   * Get file/directory stats (does not follow symlinks)
   * @param path - File or directory path relative to working directory root
   * @returns ExtendedStat object or null if doesn't exist
   */
  lstat(path: string): Promise<ExtendedStat | null>

  // ============================================================================
  // Symlink Operations
  // ============================================================================

  /**
   * Read the contents of a symlink
   * @param path - Symlink path relative to working directory root
   * @param options - Optional encoding options
   * @returns Symlink target as Buffer or null if doesn't exist
   */
  readlink(
    path: string,
    options?: { encoding?: string }
  ): Promise<UniversalBuffer | null>

  /**
   * Create a symlink
   * @param path - Symlink path relative to working directory root
   * @param target - Symlink target (string)
   */
  writelink(path: string, target: string): Promise<void>

  /**
   * Gets the filesystem instance if this backend uses a filesystem
   * @returns FileSystemProvider if available, null otherwise
   * 
   * This method allows consumers to access the filesystem without knowing
   * the backend implementation. Non-filesystem backends (e.g., blob storage, SQL)
   * should return null.
   */
  getFileSystem?(): FileSystemProvider | null

  /**
   * Gets the working directory path if this backend has a directory
   * @returns Directory path if available, null otherwise
   * 
   * This method allows consumers to access the directory path without knowing
   * the backend implementation. Backends that don't have a concept of a directory
   * (e.g., some blob storage backends) should return null.
   */
  getDirectory?(): string | null

  /**
   * Gets the Repository instance associated with this worktree backend
   * @returns Repository instance if available, null otherwise
   * 
   * This method allows the backend to access the Repository for submodule detection
   * and delegation. When a path is a submodule, the backend can delegate to the
   * submodule's WorktreeBackend.
   * 
   * The Repository reference is set by Repository when creating/opening the backend.
   */
  getRepository?(): import('../../core-utils/Repository.ts').Repository | null

  // ============================================================================
  // Submodule Operations
  // ============================================================================

  /**
   * Add a submodule to this worktree backend
   * @param normalizedPath - Normalized path to submodule (e.g., 'libs/submodule-name')
   * @param submoduleRepo - Repository instance for the submodule
   * @returns Promise resolving when submodule is added
   * 
   * This method registers a submodule Repository with this WorktreeBackend,
   * allowing it to delegate operations to the submodule's WorktreeBackend.
   * The submodule is cached for efficient future access.
   * 
   * @example
   * ```typescript
   * const submoduleRepo = await Repository.open({ fs, dir: '/path/to/submodule' })
   * await worktreeBackend.addSubmodule('libs/my-module', submoduleRepo)
   * ```
   */
  addSubmodule?(normalizedPath: string, submoduleRepo: import('../../core-utils/Repository.ts').Repository): Promise<void>

  /**
   * Get submodule worktree backend by path
   * @param submodulePath - Path to submodule (e.g., 'libs/submodule-name')
   * @returns WorktreeBackend for the submodule, or null if not found
   * 
   * This method enables multi-worktree awareness by allowing access to nested
   * submodule worktrees. The submodule's WorktreeBackend can then use its Repository
   * to access remote config and perform submodule-specific operations.
   */
  getSubmodule?(submodulePath: string): Promise<GitWorktreeBackend | null>

  /**
   * List all submodule worktrees
   * @returns Array of { path: string, backend: GitWorktreeBackend } for each submodule
   * 
   * Returns all initialized submodules as WorktreeBackend instances, enabling
   * efficient traversal and operations across multiple worktrees.
   */
  listSubmodules?(): Promise<Array<{ path: string; backend: GitWorktreeBackend }>>

  /**
   * Check if a path is within a submodule
   * @param path - File path to check
   * @returns Submodule path if within submodule, null otherwise
   * 
   * This method determines if a given path belongs to a submodule, enabling
   * proper delegation to submodule WorktreeBackends.
   */
  getSubmoduleForPath?(path: string): Promise<string | null>

  /**
   * Resolve a path across worktree boundaries
   * @param path - Path to resolve (e.g., 'libs/submodule/file.txt')
   * @returns Resolved path information with target worktree and relative path
   * 
   * This method provides unified path resolution across nested worktrees,
   * automatically delegating to the appropriate submodule WorktreeBackend
   * when needed.
   */
  resolvePath?(path: string): Promise<{
    worktree: GitWorktreeBackend
    relativePath: string
    submodulePath?: string
  }>

  // ============================================================================
  // Worktree Config Operations
  // ============================================================================

  /**
   * Read worktree config (worktree-specific config that overrides repository config)
   * @param gitdir - Git directory path (can be worktree gitdir or main gitdir)
   * @returns ConfigObject if worktree config exists, null otherwise
   */
  readWorktreeConfig(gitdir: string): Promise<import('../../core-utils/ConfigParser.ts').ConfigObject | null>

  /**
   * Write worktree config (worktree-specific config that overrides repository config)
   * @param gitdir - Git directory path (can be worktree gitdir or main gitdir)
   * @param config - Config object to write
   */
  writeWorktreeConfig(
    gitdir: string,
    config: import('../../core-utils/ConfigParser.ts').ConfigObject
  ): Promise<void>

  // ============================================================================
  // Sparse Checkout Operations
  // ============================================================================

  /**
   * Initialize sparse checkout
   * @param gitdir - Git directory path
   * @param cone - Use cone mode (default: false)
   */
  sparseCheckoutInit(gitdir: string, cone?: boolean): Promise<void>

  /**
   * Set sparse checkout patterns
   * @param gitdir - Git directory path
   * @param patterns - Array of patterns to include/exclude
   * @param treeOid - Tree OID to checkout (from HEAD or specified ref)
   * @param cone - Use cone mode (optional, uses config if not provided)
   */
  sparseCheckoutSet(
    gitdir: string,
    patterns: string[],
    treeOid: string,
    cone?: boolean
  ): Promise<void>

  /**
   * List current sparse checkout patterns
   * @param gitdir - Git directory path
   */
  sparseCheckoutList(gitdir: string): Promise<string[]>

  // ============================================================================
  // File Operations (Staging Area)
  // ============================================================================

  /**
   * Add files to the staging area
   * @param gitdir - Git directory path
   * @param filepaths - Files or directories to add
   * @param options - Add options (force, update, etc.)
   */
  add(
    gitdir: string,
    filepaths: string | string[],
    options?: { force?: boolean; update?: boolean }
  ): Promise<void>

  /**
   * Remove files from the staging area and working directory
   * @param gitdir - Git directory path
   * @param filepaths - Files to remove
   * @param options - Remove options (cached, force, etc.)
   */
  remove(
    gitdir: string,
    filepaths: string | string[],
    options?: { cached?: boolean; force?: boolean }
  ): Promise<void>

  // ============================================================================
  // Commit Operations
  // ============================================================================

  /**
   * Create a commit from the current staging area
   * @param gitdir - Git directory path
   * @param message - Commit message
   * @param options - Commit options (author, committer, noVerify, etc.)
   * @returns Commit OID
   */
  commit(
    gitdir: string,
    message: string,
    options?: {
      author?: Partial<Author>
      committer?: Partial<Author>
      noVerify?: boolean
      amend?: boolean
      ref?: string
      parent?: string[]
      tree?: string
    }
  ): Promise<string>

  // ============================================================================
  // Branch/Checkout Operations
  // ============================================================================

  /**
   * Checkout a branch, tag, or commit
   * @param gitdir - Git directory path
   * @param ref - Branch name, tag name, or commit SHA
   * @param options - Checkout options
   */
  checkout(
    gitdir: string,
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

  /**
   * Switch to a different branch (alias for checkout with branch switching)
   * @param gitdir - Git directory path
   * @param branch - Branch name to switch to
   * @param options - Switch options (create, force, etc.)
   */
  switch(
    gitdir: string,
    branch: string,
    options?: {
      create?: boolean
      force?: boolean
      track?: boolean
      remote?: string
    }
  ): Promise<void>

  // ============================================================================
  // Status Operations
  // ============================================================================

  /**
   * Get the status of a single file in the working directory
   * @param gitdir - Git directory path
   * @param filepath - File path relative to working directory root
   * @returns File status
   */
  status(gitdir: string, filepath: string): Promise<FileStatus>

  /**
   * Get status matrix (more detailed than status) for multiple files
   * @param gitdir - Git directory path
   * @param options - Status matrix options (filepaths, etc.)
   * @returns Status matrix array
   */
  statusMatrix(
    gitdir: string,
    options?: { filepaths?: string[] }
  ): Promise<StatusRow[]>

  // ============================================================================
  // Reset Operations
  // ============================================================================

  /**
   * Reset the working directory and/or index to a specific commit
   * @param gitdir - Git directory path
   * @param ref - Commit to reset to (default: HEAD)
   * @param mode - Reset mode: 'soft', 'mixed', 'hard' (default: 'mixed')
   */
  reset(
    gitdir: string,
    ref?: string,
    mode?: 'soft' | 'mixed' | 'hard'
  ): Promise<void>

  // ============================================================================
  // Diff Operations
  // ============================================================================

  /**
   * Show changes between commits, commit and working tree, etc.
   * @param gitdir - Git directory path
   * @param options - Diff options
   * @returns Diff result
   */
  diff(
    gitdir: string,
    options?: {
      ref?: string
      filepaths?: string[]
      cached?: boolean
    }
  ): Promise<DiffResult>

  // ============================================================================
  // Merge Operations
  // ============================================================================

  /**
   * Merge trees with index management and worktree file writing
   * This is a worktree-level operation because it:
   * - Manages the worktree index (stages conflicts, updates index)
   * - Writes conflicted files to the worktree
   * - Uses the worktree's directory for file operations
   * 
   * @param gitdir - Git directory path
   * @param ourOid - Our tree OID
   * @param baseOid - Base tree OID
   * @param theirOid - Their tree OID
   * @param options - Merge options (ourName, baseName, theirName, dryRun, abortOnConflict, mergeDriver)
   * @returns Merged tree OID or MergeConflictError
   */
  mergeTree(
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
      mergeDriver?: MergeDriverCallback
    }
  ): Promise<string | MergeConflictError>
}


