/**
 * GitBackend - Abstract interface for Git repository storage backends
 * 
 * This interface abstracts all storage operations for Git repository data
 * (objects, refs, config, hooks, etc.), allowing implementations using filesystem,
 * SQLite, or other storage mechanisms.
 * 
 * NOTE: This backend is for Git repository data only. For worktree-specific data
 * (working directory files, worktree config, etc.), use GitWorktreeBackend instead.
 */

import type { UniversalBuffer } from '../utils/UniversalBuffer.ts'
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
   * Reads the repository config file
   */
  readConfig(): Promise<UniversalBuffer>

  /**
   * Writes the repository config file
   */
  writeConfig(data: UniversalBuffer): Promise<void>

  /**
   * Checks if the repository config file exists
   * If config doesn't exist, the repository is not initialized (since init creates config)
   * @returns true if config exists, false otherwise
   */
  hasConfig(): Promise<boolean>

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
  // NOTE: Ref operations (read, write, delete, list) have been removed from
  // the backend interface. All ref operations must go through src/git/refs/
  // functions to ensure reflog, locking, validation, and state tracking work
  // consistently.
  //
  // IMPORTANT: This GitBackend interface is for Git repository data only
  // (objects, refs, config, etc.). For worktree-specific data (working directory
  // files, worktree config, etc.), use GitWorktreeBackend instead.
  //
  // Use these functions instead:
  // - src/git/refs/readRef.ts - readRef()
  // - src/git/refs/writeRef.ts - writeRef(), writeSymbolicRef()
  // - src/git/refs/deleteRef.ts - deleteRef()
  // - src/git/refs/listRefs.ts - listRefs()

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

  // ============================================================================
  // Advanced Features
  // ============================================================================

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
   * Closes the backend (for cleanup, e.g., closing database connections)
   */
  close(): Promise<void>

  /**
   * Gets the backend type identifier
   */
  getType(): string

  /**
   * Gets the filesystem instance if this backend uses a filesystem
   * @returns FileSystemProvider if available, null otherwise
   * 
   * This method allows consumers to access the filesystem without knowing
   * the backend implementation. Non-filesystem backends (e.g., SQLite, in-memory)
   * should return null.
   */
  getFileSystem?(): FileSystemProvider | null

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
}

