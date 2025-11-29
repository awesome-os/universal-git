/**
 * GitBackend - Abstract interface for Git repository storage backends
 * 
 * This interface abstracts all storage operations for Git repository data
 * (objects, refs, config, hooks, etc.), allowing implementations using filesystem,
 * SQLite, or other storage mechanisms.
 * 
 * ARCHITECTURAL PRINCIPLE: GitBackend does NOT access GitWorktreeBackend directly.
 * Both backends are black boxes that only communicate through Repository.
 * Repository coordinates between GitBackend and GitWorktreeBackend for operations
 * that require both (e.g., merged config access).
 * 
 * NOTE: This backend is for Git repository data only. For worktree-specific data
 * (working directory files, worktree config, etc.), use GitWorktreeBackend instead.
 */

import type { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'
import type { Walker } from '../models/Walker.ts'

/**
 * Worktree gitdir interface - opaque handle to worktree gitdir structure
 * The actual gitdir path/structure is hidden from consumers
 */
export interface WorktreeGitdir {
  /**
   * Gets the worktree gitdir path (for internal use only)
   * This should only be used by GitBackend implementations
   */
  getPath(): string
}

export type GitBackend = {
  // ============================================================================
  // Core Metadata & Current State
  // ============================================================================

  /**
   * Reads the HEAD pointer (ref or SHA)
   */
  readHEAD(): Promise<string>

  /**
   * Writes the HEAD pointer
   */
  writeHEAD(value: string): Promise<void>

  /**
   * Reads the repository config file (raw buffer)
   */
  readConfig(): Promise<UniversalBuffer>

  /**
   * Writes the repository config file (raw buffer)
   */
  writeConfig(data: UniversalBuffer): Promise<void>

  /**
   * Checks if the repository config file exists
   * If config doesn't exist, the repository is not initialized (since init creates config)
   * @returns true if config exists, false otherwise
   */
  hasConfig(): Promise<boolean>

  // ============================================================================
  // High-Level Config Operations (local config only, with defaults)
  // ============================================================================

  /**
   * Get a config value (from local config, with defaults)
   * GitBackend only handles local config - worktree config is handled by WorktreeBackend
   * @param path - Config path (e.g., 'core.filemode', 'user.name')
   * @returns Config value or default value if not found
   */
  getConfig(path: string): Promise<unknown>

  /**
   * Set a config value (only local config is supported)
   * @param path - Config path (e.g., 'core.filemode')
   * @param value - Config value
   * @param scope - Must be 'local' or undefined (other scopes are ignored for backward compatibility)
   * @param append - Whether to append to existing values (default: false)
   */
  setConfig(
    path: string,
    value: unknown,
    scope?: 'local' | 'global' | 'system',
    append?: boolean
  ): Promise<void>

  /**
   * Get all values for a config path (only from local config)
   * @param path - Config path (e.g., 'user.name')
   * @returns Array of values with scope 'local'
   */
  getAllConfig(path: string): Promise<Array<{ value: unknown; scope: 'local' }>>

  /**
   * Get all subsections for a section
   * @param section - Section name (e.g., 'remote')
   * @returns Array of subsection names
   */
  getConfigSubsections(section: string): Promise<(string | null)[]>

  /**
   * Get all section names
   * @returns Array of section names
   */
  getConfigSections(): Promise<string[]>

  /**
   * Reload config (re-reads from filesystem/storage)
   */
  reloadConfig(): Promise<void>

  // ============================================================================
  // Worktree Config Operations (require worktreeBackend to determine worktree gitdir)
  // ============================================================================

  /**
   * Read worktree config (worktree-specific config that overrides repository config)
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   * @returns ConfigObject if worktree config exists, null otherwise
   */
  readWorktreeConfigObject(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<import('../core-utils/ConfigParser.ts').ConfigObject | null>

  /**
   * Write worktree config (worktree-specific config that overrides repository config)
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   * @param config - Config object to write
   */
  writeWorktreeConfigObject(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    config: import('../core-utils/ConfigParser.ts').ConfigObject
  ): Promise<void>

  /**
   * Get a worktree config value
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   * @param path - Config path (e.g., 'core.filemode', 'user.name')
   * @returns Config value or undefined if not found
   */
  getWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    path: string
  ): Promise<unknown>

  /**
   * Set a worktree config value
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   * @param path - Config path (e.g., 'core.filemode')
   * @param value - Config value
   * @param append - Whether to append to existing values (default: false)
   */
  setWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    path: string,
    value: unknown,
    append?: boolean
  ): Promise<void>

  /**
   * Get all values for a config path from worktree config
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   * @param path - Config path (e.g., 'user.name')
   * @returns Array of values (worktree config only, so typically one value)
   */
  getAllWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    path: string
  ): Promise<Array<{ value: unknown; scope: 'worktree' }>>

  /**
   * Get all subsections for a section in worktree config
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   * @param section - Section name (e.g., 'remote')
   * @returns Array of subsection names
   */
  getWorktreeConfigSubsections(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    section: string
  ): Promise<(string | null)[]>

  /**
   * Get all section names in worktree config
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   * @returns Array of section names
   */
  getWorktreeConfigSections(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<string[]>

  /**
   * Reload worktree config (re-reads from filesystem/storage)
   * @param worktreeBackend - Worktree backend to determine worktree gitdir
   */
  reloadWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<void>

  // ============================================================================
  // Sparse Checkout Operations (require worktreeBackend for directory access)
  // ============================================================================

  /**
   * Initialize sparse checkout
   * @param worktreeBackend - Worktree backend for directory access
   * @param cone - Use cone mode (default: false)
   */
  sparseCheckoutInit(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    cone?: boolean
  ): Promise<void>

  /**
   * Set sparse checkout patterns
   * @param worktreeBackend - Worktree backend for directory access
   * @param patterns - Array of patterns to include/exclude
   * @param treeOid - Tree OID to checkout (from HEAD or specified ref)
   * @param cone - Use cone mode (optional, uses config if not provided)
   */
  sparseCheckoutSet(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    patterns: string[],
    treeOid: string,
    cone?: boolean
  ): Promise<void>

  /**
   * List current sparse checkout patterns
   * @param worktreeBackend - Worktree backend for directory access
   */
  sparseCheckoutList(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<string[]>

  /**
   * Reads the index (staging area)
   */
  readIndex(): Promise<UniversalBuffer>

  /**
   * Writes the index (staging area)
   */
  writeIndex(data: UniversalBuffer): Promise<void>

  /**
   * Checks if the repository index file exists
   * If index doesn't exist, the repository is not instantiated (since init creates index)
   * @returns true if index exists, false otherwise
   */
  hasIndex(): Promise<boolean>

  /**
   * Reads the description file
   */
  readDescription(): Promise<string | null>

  /**
   * Writes the description file
   */
  writeDescription(description: string): Promise<void>

  /**
   * Reads a temporary state file (FETCH_HEAD, ORIG_HEAD, MERGE_HEAD, etc.)
   */
  readStateFile(name: string): Promise<string | null>

  /**
   * Writes a temporary state file
   */
  writeStateFile(name: string, value: string): Promise<void>

  /**
   * Deletes a temporary state file
   */
  deleteStateFile(name: string): Promise<void>

  /**
   * Lists all state files
   */
  listStateFiles(): Promise<string[]>

  // ============================================================================
  // Sequencer Operations
  // ============================================================================

  /**
   * Reads a sequencer file (for rebase/cherry-pick operations)
   */
  readSequencerFile(name: string): Promise<string | null>

  /**
   * Writes a sequencer file
   */
  writeSequencerFile(name: string, data: string): Promise<void>

  /**
   * Deletes a sequencer file
   */
  deleteSequencerFile(name: string): Promise<void>

  /**
   * Lists all sequencer files
   */
  listSequencerFiles(): Promise<string[]>

  // ============================================================================
  // Object Database (ODB)
  // ============================================================================

  /**
   * Reads a loose object from the ODB
   * @param oid - The object ID (SHA-1)
   * @returns The deflated object data, or null if not found
   */
  readLooseObject(oid: string): Promise<UniversalBuffer | null>

  /**
   * Writes a loose object to the ODB
   * @param oid - The object ID (SHA-1)
   * @param data - The deflated object data
   */
  writeLooseObject(oid: string, data: UniversalBuffer): Promise<void>

  /**
   * Checks if a loose object exists
   */
  hasLooseObject(oid: string): Promise<boolean>

  // ============================================================================
  // High-Level Object Operations
  // ============================================================================
  // High-level object operations that handle both loose and packed objects.
  // GitBackendFs delegates to src/git/objects/ functions.
  // Other backends (SQLite, InMemory) implement these using their own storage.

  /**
   * Reads an object from the ODB (loose or packed)
   * @param oid - Object ID (SHA-1 or SHA-256)
   * @param format - Format to return object in ('deflated', 'wrapped', or 'content')
   * @param cache - Optional cache for packfile indices
   * @returns Object read result with type, object data, and format
   */
  readObject(
    oid: string,
    format?: 'deflated' | 'wrapped' | 'content',
    cache?: Record<string, unknown>
  ): Promise<{
    type: string
    object: UniversalBuffer
    format: string
    source?: string
    oid?: string
  }>

  /**
   * Writes an object to the ODB
   * @param type - Object type ('blob', 'tree', 'commit', 'tag')
   * @param object - Object data (content format)
   * @param format - Format of input data ('wrapped', 'deflated', or 'content')
   * @param oid - Optional OID (required if format is 'deflated')
   * @param dryRun - If true, don't actually write to storage
   * @param cache - Optional cache for packfile indices
   * @returns The OID of the written object
   */
  writeObject(
    type: string,
    object: UniversalBuffer | Uint8Array,
    format?: 'wrapped' | 'deflated' | 'content',
    oid?: string,
    dryRun?: boolean,
    cache?: Record<string, unknown>
  ): Promise<string>

  /**
   * Lists all loose object OIDs (for garbage collection)
   */
  listLooseObjects(): Promise<string[]>

  /**
   * Reads a packfile
   */
  readPackfile(name: string): Promise<UniversalBuffer | null>

  /**
   * Writes a packfile
   */
  writePackfile(name: string, data: UniversalBuffer): Promise<void>

  /**
   * Lists all packfiles
   */
  listPackfiles(): Promise<string[]>

  /**
   * Reads a packfile index (.idx)
   */
  readPackIndex(name: string): Promise<UniversalBuffer | null>

  /**
   * Writes a packfile index
   */
  writePackIndex(name: string, data: UniversalBuffer): Promise<void>

  /**
   * Reads a packfile bitmap (.bitmap)
   */
  readPackBitmap(name: string): Promise<UniversalBuffer | null>

  /**
   * Writes a packfile bitmap
   */
  writePackBitmap(name: string, data: UniversalBuffer): Promise<void>

  /**
   * Reads an ODB info file (alternates, commit-graph, packs)
   */
  readODBInfoFile(name: string): Promise<string | null>

  /**
   * Writes an ODB info file
   */
  writeODBInfoFile(name: string, data: string): Promise<void>

  /**
   * Deletes an ODB info file
   */
  deleteODBInfoFile(name: string): Promise<void>

  /**
   * Reads the multi-pack-index file
   */
  readMultiPackIndex(): Promise<UniversalBuffer | null>

  /**
   * Writes the multi-pack-index file
   */
  writeMultiPackIndex(data: UniversalBuffer): Promise<void>

  /**
   * Checks if multi-pack-index exists
   */
  hasMultiPackIndex(): Promise<boolean>

  // ============================================================================
  // References
  // ============================================================================
  // High-level ref operations that handle reflog, locking, validation, and state tracking.
  // GitBackendFs delegates to src/git/refs/ functions.
  // Other backends (SQLite, InMemory) implement these using their own storage.

  /**
   * Reads a Git reference and resolves it to an OID
   * Handles both direct refs and symbolic refs (like HEAD -> refs/heads/main)
   * @param ref - Reference name (e.g., 'HEAD', 'refs/heads/main', 'main')
   * @param depth - Maximum depth for symbolic ref resolution (default: 5)
   * @param cache - Optional cache for packfile indices
   * @returns The resolved OID or null if ref doesn't exist
   */
  readRef(ref: string, depth?: number, cache?: Record<string, unknown>): Promise<string | null>

  /**
   * Writes a direct ref (OID) to a ref file
   * Handles reflog, locking, and validation
   * @param ref - Reference name (e.g., 'refs/heads/main')
   * @param value - OID to write
   * @param skipReflog - Whether to skip reflog update (default: false)
   * @param cache - Optional cache for packfile indices
   */
  writeRef(ref: string, value: string, skipReflog?: boolean, cache?: Record<string, unknown>): Promise<void>

  /**
   * Writes a symbolic ref (ref pointer)
   * @param ref - Reference name (e.g., 'HEAD')
   * @param value - Target ref (e.g., 'refs/heads/main')
   * @param oldOid - Optional old OID for atomic updates
   * @param cache - Optional cache for packfile indices
   */
  writeSymbolicRef(ref: string, value: string, oldOid?: string, cache?: Record<string, unknown>): Promise<void>

  /**
   * Reads a symbolic ref without resolving to OID
   * @param ref - Reference name (e.g., 'HEAD')
   * @returns The target ref or null if not found or not symbolic
   */
  readSymbolicRef(ref: string): Promise<string | null>

  /**
   * Deletes a ref
   * @param ref - Reference name to delete
   * @param cache - Optional cache for packfile indices
   */
  deleteRef(ref: string, cache?: Record<string, unknown>): Promise<void>

  /**
   * Lists refs matching a prefix
   * @param filepath - Ref path prefix (e.g., 'refs/heads/')
   * @returns Array of ref names
   */
  listRefs(filepath: string): Promise<string[]>

  // ============================================================================
  // Reflogs
  // ============================================================================

  /**
   * Reads a reflog file
   * @param ref - The reference path
   * @returns The reflog content, or null if not found
   */
  readReflog(ref: string): Promise<string | null>

  /**
   * Writes a reflog file
   */
  writeReflog(ref: string, data: string): Promise<void>

  /**
   * Appends to a reflog file
   */
  appendReflog(ref: string, entry: string): Promise<void>

  /**
   * Deletes a reflog file
   */
  deleteReflog(ref: string): Promise<void>

  /**
   * Lists all reflog files
   */
  listReflogs(): Promise<string[]>

  // ============================================================================
  // Info Files
  // ============================================================================

  /**
   * Reads an info file (exclude, attributes, grafts)
   */
  readInfoFile(name: string): Promise<string | null>

  /**
   * Writes an info file
   */
  writeInfoFile(name: string, data: string): Promise<void>

  /**
   * Deletes an info file
   */
  deleteInfoFile(name: string): Promise<void>

  // ============================================================================
  // Hooks
  // ============================================================================

  /**
   * Reads a hook file
   */
  readHook(name: string): Promise<UniversalBuffer | null>

  /**
   * Writes a hook file
   */
  writeHook(name: string, data: UniversalBuffer): Promise<void>

  /**
   * Deletes a hook file
   */
  deleteHook(name: string): Promise<void>

  /**
   * Lists all hook files
   */
  listHooks(): Promise<string[]>

  /**
   * Checks if a hook exists
   */
  hasHook(name: string): Promise<boolean>

  /**
   * Runs a Git hook
   * 
   * @param hookName - Name of the hook (e.g., 'pre-commit', 'post-commit')
   * @param context - Hook execution context (environment variables, etc.)
   * @param executor - Optional custom hook executor (defaults to environment-appropriate executor)
   * @param stdin - Optional standard input for the hook
   * @param args - Optional command-line arguments for the hook
   * @returns Promise resolving to hook execution result
   * @throws Error if hook exists and returns non-zero exit code
   */
  runHook(
    hookName: string,
    context?: import('../git/hooks/runHook.ts').HookContext,
    executor?: import('../git/hooks/runHook.ts').HookExecutor,
    stdin?: string | UniversalBuffer,
    args?: string[]
  ): Promise<import('../git/hooks/runHook.ts').HookResult>

  // ============================================================================
  // Advanced Features
  // ============================================================================

  /**
   * Reads the .gitmodules file (submodule configuration)
   * @param worktreeBackend - Worktree backend to read .gitmodules from working directory
   * @returns .gitmodules file content as string, or null if file doesn't exist
   */
  readGitmodules(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend): Promise<string | null>

  /**
   * Writes the .gitmodules file (submodule configuration)
   * @param worktreeBackend - Worktree backend to write .gitmodules to working directory
   * @param data - .gitmodules file content
   */
  writeGitmodules(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, data: string): Promise<void>

  /**
   * Parses .gitmodules file and returns submodule definitions
   * @param worktreeBackend - Worktree backend to read .gitmodules from
   * @returns Map of submodule name to submodule info (path, url, branch)
   */
  parseGitmodules(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend): Promise<Map<string, { path: string; url: string; branch?: string }>>

  /**
   * Gets submodule information by name
   * @param worktreeBackend - Worktree backend to read .gitmodules from
   * @param name - Submodule name
   * @returns Submodule info with name, or null if not found
   */
  getSubmoduleByName(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, name: string): Promise<{ name: string; path: string; url: string; branch?: string } | null>

  /**
   * Gets submodule information by path
   * @param worktreeBackend - Worktree backend to read .gitmodules from
   * @param path - Submodule path
   * @returns Submodule info with name, or null if not found
   */
  getSubmoduleByPath(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, path: string): Promise<{ name: string; path: string; url: string; branch?: string } | null>

  /**
   * Reads a submodule config file
   */
  readSubmoduleConfig(path: string): Promise<string | null>

  /**
   * Writes a submodule config file
   */
  writeSubmoduleConfig(path: string, data: string): Promise<void>

  /**
   * Reads a worktree config file
   */
  readWorktreeConfig(name: string): Promise<string | null>

  /**
   * Writes a worktree config file
   */
  writeWorktreeConfig(name: string, data: string): Promise<void>

  /**
   * Lists all worktrees
   */
  listWorktrees(): Promise<string[]>

  /**
   * Creates a worktree gitdir structure
   * Creates the directory .git/worktrees/<name> and writes the gitdir file
   * @param name - Worktree name
   * @param worktreeDir - Absolute path to the worktree directory (for gitdir file)
   * @returns Opaque WorktreeGitdir interface
   */
  createWorktreeGitdir(name: string, worktreeDir: string): Promise<WorktreeGitdir>

  /**
   * Writes HEAD in a worktree gitdir
   * @param worktreeGitdir - Worktree gitdir interface
   * @param value - Commit OID or ref to write
   */
  writeWorktreeHEAD(worktreeGitdir: WorktreeGitdir, value: string): Promise<void>

  /**
   * Reads the shallow file
   */
  readShallow(): Promise<string | null>

  /**
   * Writes the shallow file
   */
  writeShallow(data: string): Promise<void>

  /**
   * Deletes the shallow file
   */
  deleteShallow(): Promise<void>

  /**
   * Reads an LFS file
   */
  readLFSFile(path: string): Promise<UniversalBuffer | null>

  /**
   * Writes an LFS file
   */
  writeLFSFile(path: string, data: UniversalBuffer): Promise<void>

  /**
   * Lists LFS files
   */
  listLFSFiles(prefix?: string): Promise<string[]>

  /**
   * Reads the git-daemon-export-ok file
   */
  readGitDaemonExportOk(): Promise<boolean>

  /**
   * Writes the git-daemon-export-ok file
   */
  writeGitDaemonExportOk(): Promise<void>

  /**
   * Deletes the git-daemon-export-ok file
   */
  deleteGitDaemonExportOk(): Promise<void>

  // ============================================================================
  // File Operations (Staging Area) - Require worktreeBackend for file access
  // ============================================================================

  /**
   * Add files to the staging area
   * @param worktreeBackend - Worktree backend for file access
   * @param filepaths - Files or directories to add
   * @param options - Add options (force, update, etc.)
   */
  add(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepaths: string | string[],
    options?: { force?: boolean; update?: boolean; parallel?: boolean }
  ): Promise<void>

  /**
   * Remove files from the staging area and working directory
   * @param worktreeBackend - Worktree backend for file access
   * @param filepaths - Files to remove
   * @param options - Remove options (cached, force, etc.)
   */
  remove(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepaths: string | string[],
    options?: { cached?: boolean; force?: boolean }
  ): Promise<void>

  /**
   * Update the Git index with a file entry
   * @param worktreeBackend - Worktree backend for reading files
   * @param filepath - Path to the file to update in the index
   * @param options - Update options
   * @returns OID of the blob written, or void if file was removed
   */
  updateIndex(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepath: string,
    options?: {
      oid?: string
      mode?: number
      add?: boolean
      remove?: boolean
      force?: boolean
    }
  ): Promise<string | void>

  // ============================================================================
  // Commit Operations - Require worktreeBackend for file access
  // ============================================================================

  /**
   * Create a commit from the current staging area
   * @param worktreeBackend - Worktree backend for file access
   * @param message - Commit message
   * @param options - Commit options (author, committer, noVerify, etc.)
   * @returns Commit OID
   */
  commit(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    message: string,
    options?: {
      author?: Partial<import('../models/GitCommit.ts').Author>
      committer?: Partial<import('../models/GitCommit.ts').Author>
      noVerify?: boolean
      amend?: boolean
      dryRun?: boolean
      noUpdateBranch?: boolean
      ref?: string
      parent?: string[]
      tree?: string
      signingKey?: string
      onSign?: import('../core-utils/Signing.ts').SignCallback
    }
  ): Promise<string>

  // ============================================================================
  // Branch/Checkout Operations - Require worktreeBackend for file access
  // ============================================================================

  /**
   * Checkout a branch, tag, or commit
   * @param worktreeBackend - Worktree backend for file access
   * @param ref - Branch name, tag name, or commit SHA
   * @param options - Checkout options
   */
  checkout(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    ref: string,
    options?: {
      filepaths?: string[]
      force?: boolean
      noCheckout?: boolean
      noUpdateHead?: boolean
      dryRun?: boolean
      sparsePatterns?: string[]
      onProgress?: import('../git/remote/types.ts').ProgressCallback
      remote?: string
      track?: boolean
      oldOid?: string
    }
  ): Promise<void>

  /**
   * Switch to a different branch (alias for checkout with branch switching)
   * @param worktreeBackend - Worktree backend for file access
   * @param branch - Branch name to switch to
   * @param options - Switch options (create, force, etc.)
   */
  switch(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    branch: string,
    options?: {
      create?: boolean
      force?: boolean
      track?: boolean
      remote?: string
    }
  ): Promise<void>

  // ============================================================================
  // Status Operations - Require worktreeBackend for file access
  // ============================================================================

  /**
   * Get the status of a single file in the working directory
   * @param worktreeBackend - Worktree backend for file access
   * @param filepath - File path relative to working directory root
   * @returns File status
   */
  status(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepath: string
  ): Promise<import('../commands/status.ts').FileStatus>

  /**
   * Get status matrix (more detailed than status) for multiple files
   * @param worktreeBackend - Worktree backend for file access
   * @param options - Status matrix options (filepaths, etc.)
   * @returns Status matrix array
   */
  statusMatrix(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    options?: { filepaths?: string[] }
  ): Promise<import('../commands/statusMatrix.ts').StatusRow[]>

  // ============================================================================
  // Reset Operations - Require worktreeBackend for file access
  // ============================================================================

  /**
   * Reset the working directory and/or index to a specific commit
   * @param worktreeBackend - Worktree backend for file access
   * @param ref - Commit to reset to (default: HEAD)
   * @param mode - Reset mode: 'soft', 'mixed', 'hard' (default: 'mixed')
   */
  reset(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    ref?: string,
    mode?: 'soft' | 'mixed' | 'hard'
  ): Promise<void>

  // ============================================================================
  // Diff Operations - Require worktreeBackend for file access
  // ============================================================================

  /**
   * Show changes between commits, commit and working tree, etc.
   * @param worktreeBackend - Worktree backend for file access
   * @param options - Diff options
   * @returns Diff result
   */
  diff(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    options?: {
      ref?: string
      filepaths?: string[]
      cached?: boolean
    }
  ): Promise<import('../commands/diff.ts').DiffResult>

  // ============================================================================
  // Merge Operations - Require worktreeBackend for file access
  // ============================================================================

  /**
   * Merge trees with index management and worktree file writing
   * This is a gitdir-level operation because it:
   * - Manages the gitdir index (stages conflicts, updates index)
   * - Writes conflicted files to the worktree
   * - Uses the worktree's directory for file operations
   * 
   * @param worktreeBackend - Worktree backend for file access
   * @param ourOid - Our tree OID
   * @param baseOid - Base tree OID
   * @param theirOid - Their tree OID
   * @param options - Merge options (ourName, baseName, theirName, dryRun, abortOnConflict, mergeDriver)
   * @returns Merged tree OID or MergeConflictError
   */
  mergeTree(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
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
  ): Promise<string | import('../errors/MergeConflictError.ts').MergeConflictError>

  // ============================================================================
  // Remote Info Operations
  // ============================================================================

  /**
   * Get remote server capabilities and info
   * 
   * This method queries a remote Git server to determine what protocol version,
   * commands, and features it supports. It doesn't require a local repository.
   * 
   * @param url - Remote repository URL
   * @param options - Protocol-specific options
   * @returns Remote server info (protocol version, capabilities, refs for v1)
   */
  getRemoteInfo(
    url: string,
    options?: {
      http?: import('../git/remote/types.ts').HttpClient
      ssh?: import('../ssh/SshClient.ts').SshClient
      tcp?: import('../daemon/TcpClient.ts').TcpClient
      fs?: import('../models/FileSystem.ts').FileSystemProvider
      onAuth?: import('../git/remote/types.ts').AuthCallback
      onAuthSuccess?: import('../git/remote/types.ts').AuthSuccessCallback
      onAuthFailure?: import('../git/remote/types.ts').AuthFailureCallback
      onProgress?: import('../git/remote/types.ts').ProgressCallback | import('../ssh/SshClient.ts').SshProgressCallback | import('../daemon/TcpClient.ts').TcpProgressCallback
      corsProxy?: string
      headers?: Record<string, string>
      forPush?: boolean
      protocolVersion?: 1 | 2
    }
  ): Promise<import('../commands/getRemoteInfo.ts').GetRemoteInfoResult>

  /**
   * List refs from a remote server
   * 
   * This method fetches a list of refs (branches, tags, etc.) from a remote Git server.
   * It doesn't require a local repository.
   * 
   * @param url - Remote repository URL
   * @param options - Protocol-specific options
   * @returns Array of server refs
   */
  listServerRefs(
    url: string,
    options?: {
      http?: import('../git/remote/types.ts').HttpClient
      ssh?: import('../ssh/SshClient.ts').SshClient
      tcp?: import('../daemon/TcpClient.ts').TcpClient
      fs?: import('../models/FileSystem.ts').FileSystemProvider
      onAuth?: import('../git/remote/types.ts').AuthCallback
      onAuthSuccess?: import('../git/remote/types.ts').AuthSuccessCallback
      onAuthFailure?: import('../git/remote/types.ts').AuthFailureCallback
      onProgress?: import('../git/remote/types.ts').ProgressCallback | import('../ssh/SshClient.ts').SshProgressCallback | import('../daemon/TcpClient.ts').TcpProgressCallback
      corsProxy?: string
      headers?: Record<string, string>
      forPush?: boolean
      protocolVersion?: 1 | 2
      prefix?: string
      symrefs?: boolean
      peelTags?: boolean
    }
  ): Promise<import('../git/refs/types.ts').ServerRef[]>

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Initializes the backend (creates necessary structure)
   */
  initialize(): Promise<void>

  /**
   * Checks if the backend is initialized
   */
  isInitialized(): Promise<boolean>

  /**
   * Initializes a new Git repository (always creates a bare repository)
   * This is the main entry point for repository initialization.
   * Backend-specific implementations will:
   * - Create necessary directory structure (GitBackendFs)
   * - Create database tables (SQL backend)
   * - Set initial config values (core.bare = true)
   * - Set HEAD to default branch
   * 
   * Note: init() always creates a bare repository. To make it non-bare,
   * use Repository constructor with both gitBackend and worktreeBackend.
   * @param options - Initialization options
   */
  init(options?: {
    defaultBranch?: string
    objectFormat?: 'sha1' | 'sha256'
  }): Promise<void>

  /**
   * Closes the backend (for cleanup, e.g., closing database connections)
   */
  close(): Promise<void>

  /**
   * Gets the backend type identifier
   */
  getType(): string

  /**
   * Checks if a Git repository file exists
   * @param path - File path relative to gitdir (e.g., 'index', 'config', 'HEAD')
   * @returns true if the file exists, false otherwise
   * 
   * This is a generic method that works across all backend types.
   * For filesystem backends, it checks file existence.
   * For other backends, it checks if the data exists in the storage.
   */
  existsFile(path: string): Promise<boolean>

  /**
   * Reads the packed-refs file
   * @returns The content of packed-refs file as a string, or null if it doesn't exist
   */
  readPackedRefs(): Promise<string | null>

  /**
   * Writes the packed-refs file
   * @param data - The content to write to packed-refs file
   */
  writePackedRefs(data: string): Promise<void>

  /**
   * Expand an abbreviated ref to its full name
   * @param ref - The ref to expand (like "v1.0.0" or "main")
   * @param cache - Optional cache for packfile indices
   * @returns The full ref name (e.g., "refs/tags/v1.0.0" or "refs/heads/main")
   * @throws NotFoundError if the ref cannot be found
   */
  expandRef(ref: string, cache?: Record<string, unknown>): Promise<string>

  // ============================================================================
  // Merge Operations
  // ============================================================================

  /**
   * Merges two branches (pure Git operation - works with bare repositories)
   * 
   * This is a pure GitBackend operation that:
   * - Operates on Git objects (commits, trees, refs)
   * - Works with bare repositories (no WorktreeBackend needed)
   * - Stages conflicts in the index (index is stored in GitBackend)
   * - Creates merge commit
   * - Updates the target ref
   * 
   * **Note:** This does NOT write conflict markers to worktree files.
   * For that, use WorktreeBackend.mergeTree() which calls this method
   * and then writes conflict files to the worktree.
   * 
   * @param ours - The ref to merge into (e.g., 'refs/heads/main')
   * @param theirs - The ref to merge from (e.g., 'refs/heads/feature')
   * @param options - Merge options
   * @param options.message - Merge commit message
   * @param options.author - Author for merge commit
   * @param options.committer - Committer for merge commit
   * @param options.fastForward - Allow fast-forward merge (default: true)
   * @param options.fastForwardOnly - Only allow fast-forward merge (default: false)
   * @param options.abortOnConflict - Throw error on conflict instead of returning MergeConflictError (default: true)
   * @param options.dryRun - Don't actually create commit or update ref (default: false)
   * @param options.noUpdateBranch - Don't update the branch ref (default: false)
   * @param options.allowUnrelatedHistories - Allow merging unrelated histories (default: false)
   * @param options.cache - Optional cache for packfile indices
   * @returns Merge result with commit OID, or MergeConflictError if conflicts occur
   */
  merge(
    ours: string,
    theirs: string,
    options?: {
      message?: string
      author?: Partial<import('../models/GitCommit.ts').Author>
      committer?: Partial<import('../models/GitCommit.ts').Author>
      fastForward?: boolean
      fastForwardOnly?: boolean
      abortOnConflict?: boolean
      dryRun?: boolean
      noUpdateBranch?: boolean
      allowUnrelatedHistories?: boolean
      cache?: Record<string, unknown>
    }
  ): Promise<
    | { oid: string; tree: string; mergeCommit: boolean; fastForward?: boolean; alreadyMerged?: boolean }
    | import('../errors/MergeConflictError.ts').MergeConflictError
  >

  // ============================================================================
  // Walker Creation
  // ============================================================================

  /**
   * Creates a TREE walker for walking Git tree objects
   * @param ref - Git reference (default: 'HEAD')
   * @param cache - Optional cache for packfile indices
   * @returns Walker instance (GitWalkerRepo)
   */
  createTreeWalker(ref?: string, cache?: Record<string, unknown>): Promise<unknown>

  /**
   * Creates a STAGE walker for walking the Git index (staging area)
   * @param cache - Optional cache for packfile indices
   * @returns Walker instance (GitWalkerIndex)
   */
  createIndexWalker(cache?: Record<string, unknown>): Promise<unknown>

  // ============================================================================
  // Blob Operations
  // ============================================================================

  /**
   * Reads a blob object by OID
   * @param oid - Object ID (can be blob, commit, tree, or tag - will be peeled)
   * @param filepath - Optional filepath to resolve within a tree/commit
   * @returns Blob result with oid and blob content
   */
  readBlob(oid: string, filepath?: string): Promise<{ oid: string; blob: Uint8Array }>
}

