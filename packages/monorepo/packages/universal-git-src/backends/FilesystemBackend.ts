import { join } from "../core-utils/GitPath.ts"
import type { FileSystem, FileSystemProvider } from "../models/FileSystem.ts"
import type { GitBackend } from './GitBackend.ts'
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

/**
 * FilesystemBackend - Filesystem-based implementation of GitBackend
 * 
 * This backend stores all Git data using the traditional filesystem structure,
 * compatible with standard Git repositories.
 */
export class FilesystemBackend implements GitBackend {
  private readonly fs: FileSystem
  private readonly gitdir: string

  constructor(
    fs: FileSystem,
    gitdir: string
  ) {
    this.fs = fs
    this.gitdir = gitdir
  }

  getType(): string {
    return 'filesystem'
  }

  /**
   * Get the gitdir path
   */
  getGitdir(): string {
    return this.gitdir
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

  // ============================================================================
  // Core Metadata & Current State
  // ============================================================================

  async readHEAD(): Promise<string> {
    const path = join(this.gitdir, 'HEAD')
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8').trim() : (data as string).trim()
    } catch {
      return 'ref: refs/heads/master'
    }
  }

  async writeHEAD(value: string): Promise<void> {
    const path = join(this.gitdir, 'HEAD')
    await this.fs.write(path, UniversalBuffer.from(value + '\n', 'utf8'))
  }

  async readConfig(): Promise<UniversalBuffer> {
    const path = join(this.gitdir, 'config')
    try {
      const data = await this.fs.read(path)
      return UniversalBuffer.from(data as string | Uint8Array)
    } catch {
      return UniversalBuffer.alloc(0)
    }
  }

  async writeConfig(data: UniversalBuffer): Promise<void> {
    const path = join(this.gitdir, 'config')
    await this.fs.write(path, data)
  }

  async hasConfig(): Promise<boolean> {
    const path = join(this.gitdir, 'config')
    return this.fs.exists(path)
  }

  async readIndex(): Promise<UniversalBuffer> {
    const path = join(this.gitdir, 'index')
    try {
      const data = await this.fs.read(path)
      return UniversalBuffer.from(data as string | Uint8Array)
    } catch {
      return UniversalBuffer.alloc(0)
    }
  }

  async writeIndex(data: UniversalBuffer): Promise<void> {
    const path = join(this.gitdir, 'index')
    await this.fs.write(path, data)
  }

  async hasIndex(): Promise<boolean> {
    const path = join(this.gitdir, 'index')
    return this.fs.exists(path)
  }

  async readDescription(): Promise<string | null> {
    const path = join(this.gitdir, 'description')
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
    } catch {
      return null
    }
  }

  async writeDescription(description: string): Promise<void> {
    const path = join(this.gitdir, 'description')
    await this.fs.write(path, UniversalBuffer.from(description, 'utf8'))
  }

  async readStateFile(name: string): Promise<string | null> {
    const path = join(this.gitdir, name)
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8').trim() : (data as string).trim()
    } catch {
      return null
    }
  }

  async writeStateFile(name: string, value: string): Promise<void> {
    const path = join(this.gitdir, name)
    await this.fs.write(path, UniversalBuffer.from(value + '\n', 'utf8'))
  }

  async deleteStateFile(name: string): Promise<void> {
    const path = join(this.gitdir, name)
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async listStateFiles(): Promise<string[]> {
    const stateFileNames = [
      'FETCH_HEAD',
      'ORIG_HEAD',
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'BISECT_LOG',
      'BISECT_START',
      'BISECT_TERMS',
      'BISECT_EXPECTED_REV',
    ]
    const files: string[] = []
    for (const name of stateFileNames) {
      const path = join(this.gitdir, name)
      if (await this.fs.exists(path)) {
        files.push(name)
      }
    }
    return files
  }

  // ============================================================================
  // Sequencer Operations
  // ============================================================================

  async readSequencerFile(name: string): Promise<string | null> {
    const path = join(this.gitdir, 'sequencer', name)
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
    } catch {
      return null
    }
  }

  async writeSequencerFile(name: string, data: string): Promise<void> {
    const sequencerDir = join(this.gitdir, 'sequencer')
    if (!(await this.fs.exists(sequencerDir))) {
      await this.fs.mkdir(sequencerDir)
    }
    const path = join(sequencerDir, name)
    await this.fs.write(path, UniversalBuffer.from(data, 'utf8'))
  }

  async deleteSequencerFile(name: string): Promise<void> {
    const path = join(this.gitdir, 'sequencer', name)
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async listSequencerFiles(): Promise<string[]> {
    const sequencerDir = join(this.gitdir, 'sequencer')
    try {
      const files = await this.fs.readdir(sequencerDir)
      if (!files) {
        return []
      }
      return files.filter((f: string) => typeof f === 'string')
    } catch {
      return []
    }
  }

  // ============================================================================
  // Object Database (ODB)
  // ============================================================================

  async readLooseObject(oid: string): Promise<UniversalBuffer | null> {
    const { dir, file } = this._oidToPath(oid)
    const path = join(this.gitdir, 'objects', dir, file)
    try {
      const data = await this.fs.read(path)
      if (data === null || data === undefined) {
        return null
      }
      const buffer = UniversalBuffer.from(data as string | Uint8Array)
      return buffer.length === 0 ? null : buffer
    } catch {
      return null
    }
  }

  async writeLooseObject(oid: string, data: UniversalBuffer): Promise<void> {
    const { dir, file } = this._oidToPath(oid)
    const objectDir = join(this.gitdir, 'objects', dir)
    if (!(await this.fs.exists(objectDir))) {
      await this.fs.mkdir(objectDir)
    }
    const path = join(objectDir, file)
    // Don't overwrite existing objects
    if (!(await this.fs.exists(path))) {
      await this.fs.write(path, data)
    }
  }

  async hasLooseObject(oid: string): Promise<boolean> {
    const { dir, file } = this._oidToPath(oid)
    const path = join(this.gitdir, 'objects', dir, file)
    return this.fs.exists(path)
  }

  async listLooseObjects(): Promise<string[]> {
    const objectsDir = join(this.gitdir, 'objects')
    const oids: string[] = []
    try {
      const dirs = await this.fs.readdir(objectsDir)
      if (!dirs) {
        return oids
      }
      for (const dir of dirs) {
        if (typeof dir === 'string' && dir.length === 2 && /^[0-9a-f]{2}$/i.test(dir)) {
          const subDir = join(objectsDir, dir)
          const files = await this.fs.readdir(subDir)
          if (!files) {
            continue
          }
          for (const file of files) {
            if (typeof file === 'string' && file.length === 38) {
              oids.push(dir + file)
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return oids
  }

  async readPackfile(name: string): Promise<UniversalBuffer | null> {
    const path = join(this.gitdir, 'objects', 'pack', name)
    try {
      const data = await this.fs.read(path)
      if (data === null || data === undefined) {
        return null
      }
      const buffer = UniversalBuffer.from(data as string | Uint8Array)
      return buffer.length === 0 ? null : buffer
    } catch {
      return null
    }
  }

  async writePackfile(name: string, data: UniversalBuffer): Promise<void> {
    const packDir = join(this.gitdir, 'objects', 'pack')
    if (!(await this.fs.exists(packDir))) {
      await this.fs.mkdir(packDir)
    }
    const path = join(packDir, name)
    await this.fs.write(path, data)
  }

  async listPackfiles(): Promise<string[]> {
    const packDir = join(this.gitdir, 'objects', 'pack')
    try {
      const files = await this.fs.readdir(packDir)
      if (!files) {
        return []
      }
      return files
        .filter((f: string) => typeof f === 'string' && f.endsWith('.pack'))
        .map((f: string) => f)
    } catch {
      return []
    }
  }

  async readPackIndex(name: string): Promise<UniversalBuffer | null> {
    const path = join(this.gitdir, 'objects', 'pack', name)
    try {
      const data = await this.fs.read(path)
      if (data === null || data === undefined) {
        return null
      }
      const buffer = UniversalBuffer.from(data as string | Uint8Array)
      return buffer.length === 0 ? null : buffer
    } catch {
      return null
    }
  }

  async writePackIndex(name: string, data: UniversalBuffer): Promise<void> {
    const packDir = join(this.gitdir, 'objects', 'pack')
    if (!(await this.fs.exists(packDir))) {
      await this.fs.mkdir(packDir)
    }
    const path = join(packDir, name)
    await this.fs.write(path, data)
  }

  async readPackBitmap(name: string): Promise<UniversalBuffer | null> {
    const path = join(this.gitdir, 'objects', 'pack', name)
    try {
      const data = await this.fs.read(path)
      if (data === null || data === undefined) {
        return null
      }
      const buffer = UniversalBuffer.from(data as string | Uint8Array)
      return buffer.length === 0 ? null : buffer
    } catch {
      return null
    }
  }

  async writePackBitmap(name: string, data: UniversalBuffer): Promise<void> {
    const packDir = join(this.gitdir, 'objects', 'pack')
    if (!(await this.fs.exists(packDir))) {
      await this.fs.mkdir(packDir)
    }
    const path = join(packDir, name)
    await this.fs.write(path, data)
  }

  async readODBInfoFile(name: string): Promise<string | null> {
    const path = join(this.gitdir, 'objects', 'info', name)
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
    } catch {
      return null
    }
  }

  async writeODBInfoFile(name: string, data: string): Promise<void> {
    const infoDir = join(this.gitdir, 'objects', 'info')
    if (!(await this.fs.exists(infoDir))) {
      await this.fs.mkdir(infoDir)
    }
    const path = join(infoDir, name)
    await this.fs.write(path, UniversalBuffer.from(data, 'utf8'))
  }

  async deleteODBInfoFile(name: string): Promise<void> {
    const path = join(this.gitdir, 'objects', 'info', name)
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async readMultiPackIndex(): Promise<UniversalBuffer | null> {
    const path = join(this.gitdir, 'objects', 'info', 'multi-pack-index')
    try {
      const data = await this.fs.read(path)
      if (data === null || data === undefined) {
        return null
      }
      const buffer = UniversalBuffer.from(data as string | Uint8Array)
      return buffer.length === 0 ? null : buffer
    } catch {
      return null
    }
  }

  async writeMultiPackIndex(data: UniversalBuffer): Promise<void> {
    const infoDir = join(this.gitdir, 'objects', 'info')
    if (!(await this.fs.exists(infoDir))) {
      await this.fs.mkdir(infoDir)
    }
    const path = join(infoDir, 'multi-pack-index')
    await this.fs.write(path, data)
  }

  async hasMultiPackIndex(): Promise<boolean> {
    const path = join(this.gitdir, 'objects', 'info', 'multi-pack-index')
    return this.fs.exists(path)
  }

  // ============================================================================
  // High-Level Object Operations
  // ============================================================================
  // These methods delegate to src/git/objects/ functions to handle both
  // loose and packed objects. Other backends (SQLite, InMemory) will implement
  // these using their own storage.

  async readObject(
    oid: string,
    format: 'deflated' | 'wrapped' | 'content' = 'content',
    cache: Record<string, unknown> = {}
  ): Promise<{
    type: string
    object: UniversalBuffer
    format: string
    source?: string
    oid?: string
  }> {
    const { readObject } = await import('../git/objects/readObject.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const objectFormat = await detectObjectFormat(this.fs, this.gitdir, cache)
    return readObject({
      fs: this.fs,
      cache,
      gitdir: this.gitdir,
      oid,
      format,
      objectFormat,
    })
  }

  async writeObject(
    type: string,
    object: UniversalBuffer | Uint8Array,
    format: 'wrapped' | 'deflated' | 'content' = 'content',
    oid?: string,
    dryRun: boolean = false,
    cache: Record<string, unknown> = {}
  ): Promise<string> {
    const { writeObject } = await import('../git/objects/writeObject.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const objectFormat = await detectObjectFormat(this.fs, this.gitdir, cache)
    return writeObject({
      fs: this.fs,
      gitdir: this.gitdir,
      type,
      object: UniversalBuffer.from(object),
      format,
      oid,
      dryRun,
      objectFormat,
    })
  }

  // ============================================================================
  // References
  // ============================================================================

  // ============================================================================
  // High-Level Ref Operations
  // ============================================================================
  // These methods delegate to src/git/refs/ functions to ensure
  // reflog, locking, validation, and state tracking work consistently.
  // Other backends (SQLite, InMemory) will implement these using their own storage.

  async readRef(ref: string, depth: number = 5, cache: Record<string, unknown> = {}): Promise<string | null> {
    const { readRef } = await import('../git/refs/readRef.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
    
    // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
    let effectiveGitdir = this.gitdir
    if (isWorktreeGitdir(this.gitdir)) {
      if (isWorktreeSpecificRef(ref)) {
        // HEAD and worktree-specific refs go to worktree gitdir
        effectiveGitdir = this.gitdir
      } else {
        // Other refs go to main gitdir
        effectiveGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: this.gitdir })
      }
    }
    
    const objectFormat = await detectObjectFormat(this.fs, effectiveGitdir, cache)
    return readRef({
      fs: this.fs,
      gitdir: effectiveGitdir,
      ref,
      depth,
      objectFormat,
      cache,
    })
  }

  async writeRef(ref: string, value: string, skipReflog: boolean = false, cache: Record<string, unknown> = {}): Promise<void> {
    const { writeRef } = await import('../git/refs/writeRef.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
    
    // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
    let effectiveGitdir = this.gitdir
    if (isWorktreeGitdir(this.gitdir)) {
      if (isWorktreeSpecificRef(ref)) {
        // HEAD and worktree-specific refs go to worktree gitdir
        effectiveGitdir = this.gitdir
      } else {
        // Other refs go to main gitdir
        effectiveGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: this.gitdir })
      }
    }
    
    const objectFormat = await detectObjectFormat(this.fs, effectiveGitdir, cache)
    return writeRef({
      fs: this.fs,
      gitdir: effectiveGitdir,
      ref,
      value,
      objectFormat,
      skipReflog,
    })
  }

  async writeSymbolicRef(ref: string, value: string, oldOid?: string, cache: Record<string, unknown> = {}): Promise<void> {
    const { writeSymbolicRef } = await import('../git/refs/writeRef.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
    
    // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
    let effectiveGitdir = this.gitdir
    if (isWorktreeGitdir(this.gitdir)) {
      if (isWorktreeSpecificRef(ref)) {
        // HEAD and worktree-specific refs go to worktree gitdir
        effectiveGitdir = this.gitdir
      } else {
        // Other refs go to main gitdir
        effectiveGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: this.gitdir })
      }
    }
    
    const objectFormat = await detectObjectFormat(this.fs, effectiveGitdir, cache)
    return writeSymbolicRef({
      fs: this.fs,
      gitdir: effectiveGitdir,
      ref,
      value,
      oldOid,
      objectFormat,
    })
  }

  async readSymbolicRef(ref: string): Promise<string | null> {
    const { readSymbolicRef } = await import('../git/refs/readRef.ts')
    const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
    
    // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
    let effectiveGitdir = this.gitdir
    if (isWorktreeGitdir(this.gitdir)) {
      if (isWorktreeSpecificRef(ref)) {
        // HEAD and worktree-specific refs go to worktree gitdir
        effectiveGitdir = this.gitdir
      } else {
        // Other refs go to main gitdir
        effectiveGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: this.gitdir })
      }
    }
    
    return readSymbolicRef({
      fs: this.fs,
      gitdir: effectiveGitdir,
      ref,
    })
  }

  async deleteRef(ref: string, cache: Record<string, unknown> = {}): Promise<void> {
    const { deleteRef } = await import('../git/refs/deleteRef.ts')
    const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../git/refs/worktreeRefs.ts')
    
    // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
    let effectiveGitdir = this.gitdir
    if (isWorktreeGitdir(this.gitdir)) {
      if (isWorktreeSpecificRef(ref)) {
        // HEAD and worktree-specific refs go to worktree gitdir
        effectiveGitdir = this.gitdir
      } else {
        // Other refs go to main gitdir
        effectiveGitdir = await getMainGitdir({ fs: this.fs, worktreeGitdir: this.gitdir })
      }
    }
    
    return deleteRef({
      fs: this.fs,
      gitdir: effectiveGitdir,
      ref,
    })
  }

  async listRefs(filepath: string): Promise<string[]> {
    const { listRefs } = await import('../git/refs/listRefs.ts')
    return listRefs({
      fs: this.fs,
      gitdir: this.gitdir,
      filepath,
    })
  }

  // ============================================================================
  // Reflogs
  // ============================================================================

  async readReflog(ref: string): Promise<string | null> {
    const path = join(this.gitdir, 'logs', ref)
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
    } catch {
      return null
    }
  }

  async writeReflog(ref: string, data: string): Promise<void> {
    const path = join(this.gitdir, 'logs', ref)
    const logDir = path.substring(0, path.lastIndexOf('/'))
    if (logDir && !(await this.fs.exists(logDir))) {
      await this.fs.mkdir(logDir)
    }
    await this.fs.write(path, UniversalBuffer.from(data, 'utf8'))
  }

  async appendReflog(ref: string, entry: string): Promise<void> {
    const path = join(this.gitdir, 'logs', ref)
    const logDir = path.substring(0, path.lastIndexOf('/'))
    if (logDir && !(await this.fs.exists(logDir))) {
      await this.fs.mkdir(logDir)
    }
    const existing = await this.readReflog(ref)
    const newContent = existing ? existing + entry : entry
    await this.writeReflog(ref, newContent)
  }

  async deleteReflog(ref: string): Promise<void> {
    const path = join(this.gitdir, 'logs', ref)
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async listReflogs(): Promise<string[]> {
    const logsDir = join(this.gitdir, 'logs')
    const refs: string[] = []
    try {
      await this._listFilesRecursive(logsDir, 'logs', refs)
    } catch {
      // Ignore errors
    }
    return refs
  }

  // ============================================================================
  // Info Files
  // ============================================================================

  async readInfoFile(name: string): Promise<string | null> {
    const path = join(this.gitdir, 'info', name)
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
    } catch {
      return null
    }
  }

  async writeInfoFile(name: string, data: string): Promise<void> {
    const infoDir = join(this.gitdir, 'info')
    if (!(await this.fs.exists(infoDir))) {
      await this.fs.mkdir(infoDir)
    }
    const path = join(infoDir, name)
    await this.fs.write(path, UniversalBuffer.from(data, 'utf8'))
  }

  async deleteInfoFile(name: string): Promise<void> {
    const path = join(this.gitdir, 'info', name)
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  // ============================================================================
  // Hooks
  // ============================================================================

  async readHook(name: string): Promise<UniversalBuffer | null> {
    const path = join(this.gitdir, 'hooks', name)
    try {
      const data = await this.fs.read(path)
      if (data === null || data === undefined) {
        return null
      }
      const buffer = UniversalBuffer.from(data as string | Uint8Array)
      return buffer.length === 0 ? null : buffer
    } catch {
      return null
    }
  }

  async writeHook(name: string, data: UniversalBuffer): Promise<void> {
    const hooksDir = join(this.gitdir, 'hooks')
    if (!(await this.fs.exists(hooksDir))) {
      await this.fs.mkdir(hooksDir)
    }
    const path = join(hooksDir, name)
    await this.fs.write(path, data)
  }

  async deleteHook(name: string): Promise<void> {
    const path = join(this.gitdir, 'hooks', name)
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async listHooks(): Promise<string[]> {
    const hooksDir = join(this.gitdir, 'hooks')
    try {
      const files = await this.fs.readdir(hooksDir)
      if (!files) {
        return []
      }
      return files.filter((f: string) => typeof f === 'string')
    } catch {
      return []
    }
  }

  async hasHook(name: string): Promise<boolean> {
    const path = join(this.gitdir, 'hooks', name)
    return this.fs.exists(path)
  }

  // ============================================================================
  // Advanced Features
  // ============================================================================

  async readSubmoduleConfig(path: string): Promise<string | null> {
    const fullPath = join(this.gitdir, 'modules', path, 'config')
    try {
      const data = await this.fs.read(fullPath)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
    } catch {
      return null
    }
  }

  async writeSubmoduleConfig(path: string, data: string): Promise<void> {
    const moduleDir = join(this.gitdir, 'modules', path)
    if (!(await this.fs.exists(moduleDir))) {
      await this.fs.mkdir(moduleDir)
    }
    const fullPath = join(moduleDir, 'config')
    await this.fs.write(fullPath, UniversalBuffer.from(data, 'utf8'))
  }

  async readWorktreeConfig(name: string): Promise<string | null> {
    const path = join(this.gitdir, 'worktrees', name, 'gitdir')
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8').trim() : (data as string).trim()
    } catch {
      return null
    }
  }

  async writeWorktreeConfig(name: string, data: string): Promise<void> {
    const worktreeDir = join(this.gitdir, 'worktrees', name)
    if (!(await this.fs.exists(worktreeDir))) {
      await this.fs.mkdir(worktreeDir)
    }
    const path = join(worktreeDir, 'gitdir')
    await this.fs.write(path, UniversalBuffer.from(data, 'utf8'))
  }

  async listWorktrees(): Promise<string[]> {
    const worktreesDir = join(this.gitdir, 'worktrees')
    try {
      const dirs = await this.fs.readdir(worktreesDir)
      if (!dirs) {
        return []
      }
      return dirs.filter((d: string) => typeof d === 'string')
    } catch {
      return []
    }
  }

  async createWorktreeGitdir(name: string, worktreeDir: string): Promise<import('./GitBackend.ts').WorktreeGitdir> {
    // Create worktree gitdir: <repo>/.git/worktrees/<name>
    const worktreeGitdir = join(this.gitdir, 'worktrees', name)
    await this.fs.mkdir(worktreeGitdir, { recursive: true })
    
    // Write .git/worktrees/<name>/gitdir file containing absolute path to worktree directory
    // This is the reverse mapping that Git uses to find worktrees
    // This is part of the gitdir structure, so it's handled by GitBackend
    const worktreeGitdirFile = join(worktreeGitdir, 'gitdir')
    await this.fs.write(worktreeGitdirFile, UniversalBuffer.from(worktreeDir, 'utf8'))
    
    // Return opaque interface - the actual path is hidden
    return {
      getPath: () => worktreeGitdir,
    }
  }

  async writeWorktreeHEAD(worktreeGitdir: import('./GitBackend.ts').WorktreeGitdir, value: string): Promise<void> {
    // Write HEAD in worktree gitdir
    const worktreeGitdirPath = worktreeGitdir.getPath()
    const { writeRef } = await import('../git/refs/writeRef.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const objectFormat = await detectObjectFormat(this.fs, worktreeGitdirPath, {})
    await writeRef({
      fs: this.fs,
      gitdir: worktreeGitdirPath,
      ref: 'HEAD',
      value: value.trim(),
      objectFormat,
    })
  }

  async readShallow(): Promise<string | null> {
    const path = join(this.gitdir, 'shallow')
    try {
      const data = await this.fs.read(path)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
    } catch {
      return null
    }
  }

  async writeShallow(data: string): Promise<void> {
    const path = join(this.gitdir, 'shallow')
    await this.fs.write(path, UniversalBuffer.from(data, 'utf8'))
  }

  async deleteShallow(): Promise<void> {
    const path = join(this.gitdir, 'shallow')
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async readLFSFile(path: string): Promise<UniversalBuffer | null> {
    const fullPath = join(this.gitdir, 'lfs', path)
    try {
      const data = await this.fs.read(fullPath)
      if (data === null || data === undefined) {
        return null
      }
      const buffer = UniversalBuffer.from(data as string | Uint8Array)
      return buffer.length === 0 ? null : buffer
    } catch {
      return null
    }
  }

  async writeLFSFile(path: string, data: UniversalBuffer): Promise<void> {
    const lfsDir = join(this.gitdir, 'lfs')
    const fileDir = join(lfsDir, path.substring(0, path.lastIndexOf('/')))
    if (fileDir !== lfsDir && !(await this.fs.exists(fileDir))) {
      await this.fs.mkdir(fileDir)
    }
    const fullPath = join(lfsDir, path)
    await this.fs.write(fullPath, data)
  }

  async listLFSFiles(prefix?: string): Promise<string[]> {
    const lfsDir = join(this.gitdir, 'lfs')
    const files: string[] = []
    try {
      await this._listFilesRecursive(lfsDir, prefix || '', files)
    } catch {
      // Ignore errors
    }
    return files
  }

  private async _listFilesRecursive(dirPath: string, prefix: string, files: string[]): Promise<void> {
    try {
      const entries = await this.fs.readdir(dirPath)
      if (!entries) {
        return
      }
      for (const entry of entries) {
        if (typeof entry === 'string') {
          const fullPath = join(dirPath, entry)
          const relPath = prefix ? join(prefix, entry) : entry
          const stats = await this.fs.lstat(fullPath)
          if (stats && stats.isDirectory()) {
            await this._listFilesRecursive(fullPath, relPath, files)
          } else {
            files.push(relPath)
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  async readGitDaemonExportOk(): Promise<boolean> {
    const path = join(this.gitdir, 'git-daemon-export-ok')
    return this.fs.exists(path)
  }

  async writeGitDaemonExportOk(): Promise<void> {
    const path = join(this.gitdir, 'git-daemon-export-ok')
    await this.fs.write(path, UniversalBuffer.alloc(0))
  }

  async deleteGitDaemonExportOk(): Promise<void> {
    const path = join(this.gitdir, 'git-daemon-export-ok')
    try {
      await this.fs.rm(path)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async initialize(): Promise<void> {
    const dirs = [
      'hooks',
      'info',
      'objects/info',
      'objects/pack',
      'refs/heads',
      'refs/tags',
      'refs/remotes',
      'refs/notes',
      'refs/replace',
      'logs/refs/heads',
      'logs/refs/remotes',
    ]
    for (const dir of dirs) {
      const path = join(this.gitdir, dir)
      if (!(await this.fs.exists(path))) {
        await this.fs.mkdir(path)
      }
    }
  }

  async isInitialized(): Promise<boolean> {
    const configPath = join(this.gitdir, 'config')
    return this.fs.exists(configPath)
  }

  async existsFile(path: string): Promise<boolean> {
    const filePath = join(this.gitdir, path)
    return this.fs.exists(filePath)
  }

  async close(): Promise<void> {
    // No cleanup needed for filesystem backend
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private _oidToPath(oid: string): { dir: string; file: string } {
    return {
      dir: oid.substring(0, 2),
      file: oid.substring(2),
    }
  }
}

