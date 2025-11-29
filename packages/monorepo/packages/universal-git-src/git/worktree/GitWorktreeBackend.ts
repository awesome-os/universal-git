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
import type { GitBackend } from '../../backends/GitBackend.ts'
import type { Walker } from '../../models/Walker.ts'

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
   * List all files in the working directory (recursive)
   * @returns Array of all file paths (relative to working directory root)
   */
  listFiles(): Promise<string[]>

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
   * Gets the working directory path if this backend has a directory
   * @returns Directory path if available, null otherwise
   * 
   * This method allows consumers to access the directory path without knowing
   * the backend implementation. Backends that don't have a concept of a directory
   * (e.g., some blob storage backends) should return null.
   * 
   * @deprecated - This encourages reliance on filesystem paths. 
   * Future versions will remove this in favor of passing GitWorktreeBackend directly.
   */
  getDirectory?(): string | null

  // ============================================================================
  // Submodule Operations
  // ============================================================================

  /**
   * Get submodule information by path
   * @param path - Submodule path (e.g., 'libs/submodule-name')
   * @returns Submodule info (name, path, url, branch) or null if not found
   * 
   * This method allows GitBackend to query submodule information from the worktree backend.
   * The worktree backend stores submodule info that was set via setSubmodule().
   * 
   * GitBackend calls this method when it needs submodule information for operations.
   */
  getSubmodule?(path: string): Promise<{ name: string; path: string; url: string; branch?: string } | null>

  /**
   * Set submodule information
   * @param path - Submodule path (e.g., 'libs/submodule-name')
   * @param info - Submodule info (name, path, url, branch)
   * 
   * This method allows GitBackend to store submodule information in the worktree backend.
   * The worktree backend caches this info for efficient access via getSubmodule().
   * 
   * GitBackend calls this method when it discovers submodule information (e.g., from .gitmodules).
   */
  setSubmodule?(path: string, info: { name: string; path: string; url: string; branch?: string }): Promise<void>

  /**
   * Get submodule worktree backend by path
   * @param submodulePath - Path to submodule (e.g., 'libs/submodule-name')
   * @returns WorktreeBackend for the submodule, or null if not found
   * 
   * This method enables multi-worktree awareness by allowing access to nested
   * submodule worktrees. The submodule's WorktreeBackend can then be used for
   * submodule-specific operations.
   */
  getSubmoduleBackend?(submodulePath: string): Promise<GitWorktreeBackend | null>

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

  // ============================================================================
  // Worktree Config Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.readWorktreeConfig(worktreeBackend), gitBackend.getWorktreeConfig(worktreeBackend, path), etc.
  // ============================================================================

  // ============================================================================
  // Sparse Checkout Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.sparseCheckoutInit(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // File Operations (Staging Area) - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.add(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Commit Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.commit(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Branch/Checkout Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.checkout(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Status Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.status(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Reset Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.reset(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Diff Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.diff(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Merge Operations - MOVED TO GitBackend
  // These operations require gitdir access and have been moved to GitBackend
  // Use gitBackend.mergeTree(worktreeBackend, ...) instead
  // ============================================================================

  // ============================================================================
  // Walker Creation
  // ============================================================================

  /**
   * Creates a WORKDIR walker for walking the working directory
   * @param gitBackend - GitBackend instance (needed for index/config access)
   * @returns Walker instance (GitWalkerFs)
   */
  createWorkdirWalker(gitBackend: GitBackend): Promise<unknown>
}


