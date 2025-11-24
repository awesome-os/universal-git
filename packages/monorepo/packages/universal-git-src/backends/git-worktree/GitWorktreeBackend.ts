import type { ExtendedStat } from '../../utils/statHelpers.ts'
import type { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

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
}


