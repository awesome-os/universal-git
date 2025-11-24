import type { FileSystem } from '../../models/FileSystem.ts'
import type { ExtendedStat } from '../../utils/statHelpers.ts'
import type { GitWorktreeBackend } from './GitWorktreeBackend.ts'
import { join } from '../../core-utils/GitPath.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * FilesystemGitWorktreeBackend - Filesystem-based implementation of GitWorktreeBackend
 * 
 * This backend stores all working directory files using the traditional filesystem,
 * wrapping the FileSystem class to provide the GitWorktreeBackend interface.
 * 
 * This is the default implementation.
 */
export class FilesystemGitWorktreeBackend implements GitWorktreeBackend {
  private readonly fs: FileSystem
  private readonly dir: string

  constructor(
    fs: FileSystem,
    dir: string
  ) {
    this.fs = fs
    this.dir = dir
  }

  /**
   * Get the backend type identifier
   */
  getType(): string {
    return 'filesystem'
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
}


