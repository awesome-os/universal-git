import { join } from "../core-utils/GitPath.ts"
import type { FileSystem, FileSystemProvider } from "../models/FileSystem.ts"
import type { GitBackend } from './GitBackend.ts'
import type { Walker } from '../models/Walker.ts'
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
    // Use gitBackend parameter for detectObjectFormat (this is the FilesystemBackend instance)
    const objectFormat = await detectObjectFormat(undefined, undefined, cache, this)
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
    // In a normal repository (not a worktree gitdir), HEAD is in the main gitdir (this.gitdir)
    
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

  async runHook(
    hookName: string,
    context?: import('../git/hooks/runHook.ts').HookContext,
    executor?: import('../git/hooks/runHook.ts').HookExecutor,
    stdin?: string | import('../utils/UniversalBuffer.ts').UniversalBuffer,
    args?: string[]
  ): Promise<import('../git/hooks/runHook.ts').HookResult> {
    // Check if hook should run
    const shouldRun = await this.hasHook(hookName)
    if (!shouldRun) {
      // Hook doesn't exist or isn't executable - return success
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      }
    }

    // Get hook path - respect core.hooksPath config
    const { getHooksPath } = await import('../git/hooks/shouldRunHook.ts')
    const hooksPath = await getHooksPath({ fs: this.fs, gitdir: this.gitdir })
    const hookPath = join(hooksPath, hookName)

    // Get executor
    const { getDefaultExecutor } = await import('../git/hooks/runHook.ts')
    const hookExecutor = executor || getDefaultExecutor()

    // Build environment variables
    const env: Record<string, string> = {
      ...context?.env,
    }

    // Set Git environment variables
    if (context?.gitdir) {
      env.GIT_DIR = context.gitdir
    }
    if (context?.workTree) {
      env.GIT_WORK_TREE = context.workTree
    }
    if (context?.indexFile) {
      env.GIT_INDEX_FILE = context.indexFile
    }
    if (context?.branch) {
      env.GIT_BRANCH = context.branch
    }
    if (context?.previousHead) {
      env.GIT_PREVIOUS_HEAD = context.previousHead
    }
    if (context?.newHead) {
      env.GIT_HEAD = context.newHead
    }
    if (context?.commitOid) {
      env.GIT_COMMIT = context.commitOid
    }
    if (context?.remote) {
      env.GIT_REMOTE = context.remote
    }
    if (context?.remoteUrl) {
      env.GIT_REMOTE_URL = context.remoteUrl
    }

    // Get additional Git config values that hooks might need
    try {
      const configBuffer = await this.readConfig()
      const { parse } = await import('../core-utils/ConfigParser.ts')
      const config = parse(configBuffer)
      const authorName = config.get('user.name') as string | undefined
      const authorEmail = config.get('user.email') as string | undefined
      if (authorName) {
        env.GIT_AUTHOR_NAME = authorName
      }
      if (authorEmail) {
        env.GIT_AUTHOR_EMAIL = authorEmail
      }
    } catch {
      // Config not available, that's okay
    }

    // Build command-line arguments (use provided args or build from context)
    const hookArgs: string[] = args && args.length > 0 ? args : []

    // If args weren't provided, build them from context
    if (hookArgs.length === 0 && context) {
      // Some hooks receive arguments
      if (hookName === 'post-checkout' && context.previousHead && context.newHead) {
        hookArgs.push(context.previousHead, context.newHead, context.branch ? '1' : '0')
      } else if (hookName === 'post-merge' && context.newHead) {
        hookArgs.push(context.newHead ? '1' : '0')
      } else if (hookName === 'pre-push' && context.remote && context.pushedRefs) {
        // Pre-push hook receives: <remote_name> <remote_url>
        hookArgs.push(context.remote, context.remoteUrl || '')
      } else if (hookName === 'prepare-commit-msg' && context.commitMessage) {
        // Prepare-commit-msg receives: <file> <source> [<sha1>]
        // We'll pass the commit message file path
        hookArgs.push(context.commitMessage, 'message')
      } else if (hookName === 'commit-msg' && context.commitMessage) {
        // Commit-msg receives: <file>
        hookArgs.push(context.commitMessage)
      }
    }

    // Execute the hook
    const result = await hookExecutor.execute(hookPath, hookArgs, env, stdin)

    // If hook failed (non-zero exit code), throw an error
    if (result.exitCode !== 0) {
      const error = new Error(`Hook '${hookName}' failed with exit code ${result.exitCode}`)
      ;(error as any).exitCode = result.exitCode
      ;(error as any).stdout = result.stdout
      ;(error as any).stderr = result.stderr
      throw error
    }

    return result
  }

  // ============================================================================
  // Advanced Features
  // ============================================================================

  async readGitmodules(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend): Promise<string | null> {
    // .gitmodules is in the working directory root
    // Use worktreeBackend to read it (worktreeBackend is a black box)
    try {
      const content = await worktreeBackend.read('.gitmodules')
      if (content === null || content === undefined) {
        return null
      }
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.isBuffer(content) ? content.toString('utf8') : (content as string)
    } catch {
      return null
    }
  }

  async writeGitmodules(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, data: string): Promise<void> {
    // .gitmodules is in the working directory root
    // Use worktreeBackend to write it (worktreeBackend is a black box)
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    await worktreeBackend.write('.gitmodules', UniversalBuffer.from(data, 'utf8'))
  }

  async parseGitmodules(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend): Promise<Map<string, { path: string; url: string; branch?: string }>> {
    // Read .gitmodules from worktree backend
    const content = await this.readGitmodules(worktreeBackend)
    const submodules = new Map<string, { path: string; url: string; branch?: string }>()

    if (content === null || content === undefined) {
      return submodules
    }

    // Parse .gitmodules using ConfigParser (FilesystemBackend implementation detail)
    const { parse: parseConfig } = await import('../core-utils/ConfigParser.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    const buffer = UniversalBuffer.from(content, 'utf8')
    const config = parseConfig(buffer)

    // Extract submodule sections
    const subsections = config.getSubsections('submodule')
    for (const name of subsections) {
      if (name) {
        const path = config.get(`submodule.${name}.path`) as string | undefined
        const url = config.get(`submodule.${name}.url`) as string | undefined
        const branch = config.get(`submodule.${name}.branch`) as string | undefined

        if (path && url) {
          const info = {
            path,
            url,
            branch: branch || undefined,
          }
          submodules.set(name, info)
          
          // Store submodule info in worktree backend via setSubmodule
          if (worktreeBackend.setSubmodule) {
            await worktreeBackend.setSubmodule(path, { name, ...info })
          }
        }
      }
    }

    return submodules
  }

  async getSubmoduleByName(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, name: string): Promise<{ name: string; path: string; url: string; branch?: string } | null> {
    // First, parse all submodules to ensure worktree backend has the info
    const submodules = await this.parseGitmodules(worktreeBackend)
    
    // Find submodule by name
    for (const [submoduleName, info] of submodules.entries()) {
      if (submoduleName === name) {
        return { name: submoduleName, ...info }
      }
    }
    
    return null
  }

  async getSubmoduleByPath(worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, path: string): Promise<{ name: string; path: string; url: string; branch?: string } | null> {
    // Try to get from worktree backend first
    if (worktreeBackend.getSubmodule) {
      const info = await worktreeBackend.getSubmodule(path)
      if (info) {
        return info
      }
    }
    
    // Fallback: parse all submodules and find by path
    const submodules = await this.parseGitmodules(worktreeBackend)
    for (const [name, info] of submodules.entries()) {
      if (info.path === path) {
        return { name, ...info }
      }
    }
    
    return null
  }

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

  async init(options: {
    defaultBranch?: string
    objectFormat?: 'sha1' | 'sha256'
  } = {}): Promise<void> {
    const { ConfigAccess } = await import('../utils/configAccess.ts')
    
    // Check if already initialized
    if (await this.isInitialized()) {
      return
    }

    // Initialize backend structure (create directories)
    await this.initialize()

    // Use ConfigAccess to set initial config values
    const configAccess = new ConfigAccess(this.fs, this.gitdir)
    
    const defaultBranch = options.defaultBranch || 'master'
    const objectFormat = options.objectFormat || 'sha1'
    
    // Set repository format version and object format
    if (objectFormat === 'sha256') {
      // SHA-256 requires repository format version 1 (for extensions)
      await configAccess.setConfigValue('core.repositoryformatversion', '1', 'local')
      await configAccess.setConfigValue('extensions.objectformat', 'sha256', 'local')
    } else {
      // SHA-1 uses repository format version 0
      await configAccess.setConfigValue('core.repositoryformatversion', '0', 'local')
    }
    
    // init() always creates a bare repository
    await configAccess.setConfigValue('core.filemode', 'false', 'local')
    await configAccess.setConfigValue('core.bare', 'true', 'local')
    await configAccess.setConfigValue('core.symlinks', 'false', 'local')
    await configAccess.setConfigValue('core.ignorecase', 'true', 'local')

    // Set HEAD to default branch
    await this.writeHEAD(`ref: refs/heads/${defaultBranch}`)
  }

  async existsFile(path: string): Promise<boolean> {
    const filePath = join(this.gitdir, path)
    return this.fs.exists(filePath)
  }

  async readPackedRefs(): Promise<string | null> {
    const { join } = await import('../core-utils/GitPath.ts')
    const { createFileSystem } = await import('../utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(this.fs)
    const packedRefsPath = join(this.gitdir, 'packed-refs')
    try {
      const content = await normalizedFs.read(packedRefsPath, 'utf8')
      if (typeof content === 'string') {
        return content
      }
      return content ? content.toString('utf8') : null
    } catch {
      return null
    }
  }

  async writePackedRefs(data: string): Promise<void> {
    const { join } = await import('../core-utils/GitPath.ts')
    const { createFileSystem } = await import('../utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(this.fs)
    const packedRefsPath = join(this.gitdir, 'packed-refs')
    await normalizedFs.write(packedRefsPath, data, 'utf8')
  }

  async expandRef(ref: string, cache: Record<string, unknown> = {}): Promise<string> {
    const { NotFoundError } = await import('../errors/NotFoundError.ts')
    const { parsePackedRefs } = await import('../git/refs/packedRefs.ts')
    const { join } = await import('../core-utils/GitPath.ts')
    
    // Is it a complete and valid SHA?
    if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
      return ref
    }
    
    // Read packed refs
    let packedMap = new Map<string, string>()
    try {
      const content = await this.readPackedRefs()
      if (content) {
        packedMap = parsePackedRefs(content)
      }
    } catch {
      // packed-refs doesn't exist, that's okay
    }
    
    // Define refpaths in the same order as the command
    const refpaths = [
      `${ref}`,
      `refs/${ref}`,
      `refs/tags/${ref}`,
      `refs/heads/${ref}`,
      `refs/remotes/${ref}`,
      `refs/remotes/${ref}/HEAD`,
    ]
    
    // Look in all the proper paths, in this order
    // We need to check each path directly (not using readRef which expands internally)
    for (const refPath of refpaths) {
      // Check if ref file exists at this specific path
      const refFilePath = join(this.gitdir, refPath)
      try {
        const exists = await this.fs.exists(refFilePath)
        if (exists) {
          // File exists, verify it's a valid ref by reading it
          try {
            const content = await this.fs.read(refFilePath, 'utf8')
            if (content) {
              const contentStr = typeof content === 'string' ? content : content.toString('utf8')
              if (contentStr.trim().length > 0) {
                // Valid ref file exists at this path
                return refPath
              }
            }
          } catch {
            // Error reading file, continue to next path
          }
        }
      } catch {
        // File doesn't exist, continue to next path
      }
      // Also check packed refs
      if (packedMap.has(refPath)) return refPath
    }
    
    // Do we give up?
    throw new NotFoundError(ref)
  }

  async close(): Promise<void> {
    // No cleanup needed for filesystem backend
  }

  // ============================================================================
  // Remote Info Operations
  // ============================================================================

  async getRemoteInfo(
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
  ): Promise<import('../commands/getRemoteInfo.ts').GetRemoteInfoResult> {
    const { RemoteBackendRegistry } = await import('../git/remote/RemoteBackendRegistry.ts')
    const { formatInfoRefs } = await import('../utils/formatInfoRefs.ts')
    
    // Get remote backend from registry
    const backend = RemoteBackendRegistry.getBackend({
      url,
      http: options?.http,
      ssh: options?.ssh,
      tcp: options?.tcp,
      fs: options?.fs || this.fs,
      useRestApi: false, // getRemoteInfo only uses Git protocol, not REST API
    })
    
    // Call backend.discover() with protocol-agnostic options
    const remote = await backend.discover({
      service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      protocolVersion: options?.protocolVersion || 2,
      onProgress: options?.onProgress,
      // HTTP-specific options
      http: options?.http,
      headers: options?.headers,
      corsProxy: options?.corsProxy,
      onAuth: options?.onAuth,
      onAuthSuccess: options?.onAuthSuccess,
      onAuthFailure: options?.onAuthFailure,
      // SSH-specific options
      ssh: options?.ssh,
      // TCP/Daemon-specific options
      tcp: options?.tcp,
    })
    
    // Convert RemoteDiscoverResult to GetRemoteInfoResult format
    if (remote.protocolVersion === 2) {
      return {
        protocolVersion: 2,
        capabilities: remote.capabilities2,
      }
    }
    
    // Protocol version 1: convert Set to object and format refs
    const capabilities: Record<string, string | true> = {}
    for (const cap of remote.capabilities) {
      const [key, value] = cap.split('=')
      if (value) {
        capabilities[key] = value
      } else {
        capabilities[key] = true
      }
    }
    
    return {
      protocolVersion: 1,
      capabilities,
      refs: formatInfoRefs({ refs: remote.refs, symrefs: remote.symrefs }, '', true, true),
    }
  }

  async listServerRefs(
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
  ): Promise<import('../git/refs/types.ts').ServerRef[]> {
    const { RemoteBackendRegistry } = await import('../git/remote/RemoteBackendRegistry.ts')
    const { formatInfoRefs } = await import('../utils/formatInfoRefs.ts')
    const { writeListRefsRequest } = await import('../wire/writeListRefsRequest.ts')
    const { parseListRefsResponse } = await import('../wire/parseListRefsResponse.ts')
    
    // Get remote backend from registry
    const backend = RemoteBackendRegistry.getBackend({
      url,
      http: options?.http,
      ssh: options?.ssh,
      tcp: options?.tcp,
      fs: options?.fs || this.fs,
      useRestApi: false, // listServerRefs only uses Git protocol, not REST API
    })
    
    // Step 1: Discover capabilities and refs (for protocol v1)
    const remote = await backend.discover({
      service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      protocolVersion: options?.protocolVersion || 2,
      onProgress: options?.onProgress,
      // HTTP-specific options
      http: options?.http,
      headers: options?.headers,
      corsProxy: options?.corsProxy,
      onAuth: options?.onAuth,
      onAuthSuccess: options?.onAuthSuccess,
      onAuthFailure: options?.onAuthFailure,
      // SSH-specific options
      ssh: options?.ssh,
      // TCP/Daemon-specific options
      tcp: options?.tcp,
    })
    
    // For protocol v1, refs are in the discovery response
    if (remote.protocolVersion === 1) {
      return formatInfoRefs(
        { refs: remote.refs, symrefs: remote.symrefs },
        options?.prefix || '',
        options?.symrefs || false,
        options?.peelTags || false
      )
    }
    
    // Protocol Version 2 - use ls-refs command via connect()
    const body = await writeListRefsRequest({
      prefix: options?.prefix,
      symrefs: options?.symrefs,
      peelTags: options?.peelTags,
    })
    
    // Create an async iterator that yields individual buffers as Uint8Array
    const bodyIterator = (async function* () {
      for (const buf of body) {
        yield new Uint8Array(buf)
      }
    })()
    
    // Step 2: Connect and send ls-refs command
    const res = await backend.connect({
      service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      protocolVersion: 2,
      command: 'ls-refs',
      body: bodyIterator,
      onProgress: options?.onProgress,
      // HTTP-specific options
      http: options?.http,
      headers: options?.headers,
      auth: remote.auth, // Use auth from discover response
      corsProxy: options?.corsProxy,
      // SSH-specific options
      ssh: options?.ssh,
      // TCP/Daemon-specific options
      tcp: options?.tcp,
    })
    
    if (!res.body) {
      throw new Error('No response body from server')
    }
    return parseListRefsResponse(res.body)
  }

  // ============================================================================
  // Merge Operations
  // ============================================================================

  async merge(
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
  > {
    const cache = options?.cache || {}
    const fastForward = options?.fastForward !== false
    const fastForwardOnly = options?.fastForwardOnly || false
    const dryRun = options?.dryRun || false
    const noUpdateBranch = options?.noUpdateBranch || false
    const abortOnConflict = options?.abortOnConflict !== false
    const allowUnrelatedHistories = options?.allowUnrelatedHistories || false
    const message = options?.message
    const author = options?.author
    const committer = options?.committer

    // Import required functions
    const { expandRef } = await import('../git/refs/expandRef.ts')
    const { abbreviateRef } = await import('../utils/abbreviateRef.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { FastForwardError } = await import('../errors/FastForwardError.ts')
    const { MergeNotSupportedError } = await import('../errors/MergeNotSupportedError.ts')
    const { MergeConflictError } = await import('../errors/MergeConflictError.ts')
    const { UnmergedPathsError } = await import('../errors/UnmergedPathsError.ts')

    // Expand refs to full ref names
    const ourRef = await expandRef({ fs: this.fs, gitdir: this.gitdir, ref: ours })
    const theirRef = await expandRef({ fs: this.fs, gitdir: this.gitdir, ref: theirs })

    // Resolve refs to OIDs
    const ourOid = await this.readRef(ourRef, 5, cache)
    const theirOid = await this.readRef(theirRef, 5, cache)
    
    if (!ourOid || !theirOid) {
      throw new Error(`Cannot merge: refs not found (ours: ${ours}, theirs: ${theirs})`)
    }

    // Find merge base using the internal algorithm
    const objectFormat = await detectObjectFormat(this.fs, this.gitdir, cache)
    const { findMergeBase: findMergeBaseInternal } = await import('../core-utils/algorithms/CommitGraphWalker.ts')
    const { parse: parseCommitInternal } = await import('../core-utils/parsers/Commit.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    // Create readCommit function that uses GitBackend
    const readCommit = async (oid: string) => {
      const result = await this.readObject(oid, 'content', cache)
      return parseCommitInternal(UniversalBuffer.from(result.object))
    }
    
    const baseOids = await findMergeBaseInternal({
      fs: this.fs,
      cache,
      gitdir: this.gitdir,
      commits: [ourOid, theirOid],
      readCommit,
    })

    if (baseOids.length !== 1) {
      if (baseOids.length === 0 && allowUnrelatedHistories) {
        // Empty tree for unrelated histories
        baseOids.push('4b825dc642cb6eb9a060e54bf8d69288fbee4904')
      } else {
        throw new MergeNotSupportedError()
      }
    }
    const baseOid = baseOids[0]

    // Handle fast-forward cases
    if (baseOid === theirOid) {
      // Already merged
      const ourCommitResult = await this.readObject(ourOid, 'content', cache)
      if (ourCommitResult.type !== 'commit') {
        throw new Error('Expected commit object')
      }
      const { parse: parseCommit } = await import('../core-utils/parsers/Commit.ts')
      const ourCommit = parseCommit(ourCommitResult.object)
      const ourTreeOid = ourCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
      return {
        oid: ourOid,
        tree: ourTreeOid,
        alreadyMerged: true,
      }
    }

    if (fastForward && baseOid === ourOid) {
      // Fast-forward merge
      if (!dryRun && !noUpdateBranch) {
        await this.writeRef(ourRef, theirOid, false, cache)
        
        // Add reflog entry
        const oldOid = await this.readRef(ourRef, 5, cache)
        if (oldOid && oldOid !== theirOid) {
          const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
          const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
          await logRefUpdate({
            fs: this.fs,
            gitdir: this.gitdir,
            ref: ourRef,
            oldOid,
            newOid: theirOid,
            message: REFLOG_MESSAGES.MERGE_FF(abbreviateRef(theirRef)),
          }).catch(() => {
            // Silently ignore reflog errors
          })
        }
      }
      
      const theirCommitResult = await this.readObject(theirOid, 'content', cache)
      if (theirCommitResult.type !== 'commit') {
        throw new Error('Expected commit object')
      }
      const theirCommit = parseCommit(theirCommitResult.object)
      const theirTreeOid = theirCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
      return {
        oid: theirOid,
        tree: theirTreeOid,
        fastForward: true,
      }
    }

    // Not a fast-forward merge
    if (fastForwardOnly) {
      throw new FastForwardError()
    }

    // Write merge state files
    if (!dryRun) {
      const { writeMergeHead } = await import('../git/merge/writeMergeHead.ts')
      const { writeMergeMode } = await import('../git/merge/writeMergeMode.ts')
      const { writeMergeMsg } = await import('../git/merge/writeMergeMsg.ts')
      
      await writeMergeHead({ fs: this.fs, gitdir: this.gitdir, oid: theirOid })
      const mergeMode = fastForward ? '' : 'no-ff'
      await writeMergeMode({ fs: this.fs, gitdir: this.gitdir, mode: mergeMode })
      const mergeMessage = message || `Merge branch '${abbreviateRef(theirRef)}' into ${abbreviateRef(ourRef)}`
      await writeMergeMsg({ fs: this.fs, gitdir: this.gitdir, message: mergeMessage })
    }

    // Get tree OIDs from commits
    const ourCommitResult = await this.readObject(ourOid, 'content', cache)
    const theirCommitResult = await this.readObject(theirOid, 'content', cache)
    const baseCommitResult = await this.readObject(baseOid, 'content', cache)

    if (ourCommitResult.type !== 'commit' || theirCommitResult.type !== 'commit' || baseCommitResult.type !== 'commit') {
      throw new Error('Expected commit objects')
    }

    const ourCommit = parseCommit(ourCommitResult.object)
    const theirCommit = parseCommit(theirCommitResult.object)
    const baseCommit = parseCommit(baseCommitResult.object)

    const ourTreeOid = ourCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    const theirTreeOid = theirCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    const baseTreeOid = baseCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

    // Read index
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const indexBuffer = await this.readIndex()
    const index = indexBuffer.length > 0 
      ? await GitIndex.fromBuffer(indexBuffer, objectFormat)
      : new GitIndex(null, undefined, 2)

    // Check for unmerged paths
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(Array.from(index.unmergedPaths))
    }

    // Create a minimal Repository wrapper for MergeStream
    // MergeStream needs repo for reading objects during merge
    const { Repository } = await import('../core-utils/Repository.ts')
    const repo = await Repository.open({
      gitBackend: this,
      cache,
      autoDetectConfig: true,
    })

    // Perform tree merge using MergeStream
    const { MergeStream } = await import('../core-utils/MergeStream.ts')
    const mergeResult = await MergeStream.execute({
      gitBackend: this,
      index,
      ourOid: ourTreeOid,
      baseOid: baseTreeOid,
      theirOid: theirTreeOid,
      abortOnConflict,
      dryRun,
      cache,
      gitdir: this.gitdir,
    })

    // Write index if merge succeeded or conflicts are allowed
    if (typeof mergeResult === 'string' || !abortOnConflict) {
      const updatedIndexBuffer = await index.toObject()
      await this.writeIndex(updatedIndexBuffer)
    }

    // Check for conflicts
    // CRITICAL: Always throw MergeConflictError when conflicts are detected, even if abortOnConflict=false
    // When abortOnConflict=false, the index is written with conflicts, but the error should still be thrown
    if (typeof mergeResult !== 'string') {
      const conflictError = mergeResult as any
      const filepaths = conflictError?.data?.filepaths || []
      const bothModified = conflictError?.data?.bothModified || []
      const deleteByUs = conflictError?.data?.deleteByUs || []
      const deleteByTheirs = conflictError?.data?.deleteByTheirs || []
      
      const error = new MergeConflictError(filepaths, bothModified, deleteByUs, deleteByTheirs)
      // Always throw the error - abortOnConflict only affects whether we write the index
      throw error
    }

    // Create merge commit
    const mergeMessage = message || `Merge branch '${abbreviateRef(theirRef)}' into ${abbreviateRef(ourRef)}`
    
    const { writeCommit: _writeCommit } = await import('../commands/writeCommit.ts')
    const { normalizeCommitterObject } = await import('../utils/normalizeCommitterObject.ts')
    const { normalizeAuthorObject } = await import('../utils/normalizeAuthorObject.ts')
    
    const normalizedAuthor = author ? await normalizeAuthorObject({ repo, author }) : undefined
    const normalizedCommitter = committer 
      ? await normalizeCommitterObject({ repo, author: normalizedAuthor, committer })
      : normalizedAuthor

    if (!normalizedAuthor || !normalizedCommitter) {
      throw new Error('Author and committer are required for merge commit')
    }

    const oid = await _writeCommit({
      repo,
      fs: this.fs,
      gitdir: this.gitdir,
      message: mergeMessage,
      tree: mergeResult,
      parent: [ourOid, theirOid],
      author: normalizedAuthor,
      committer: normalizedCommitter,
      ref: ourRef,
      dryRun,
      noUpdateBranch,
    })

    // Clean up merge state files
    if (!dryRun) {
      const { deleteMergeHead } = await import('../git/merge/deleteMergeHead.ts')
      const { deleteMergeMode } = await import('../git/merge/deleteMergeMode.ts')
      const { deleteMergeMsg } = await import('../git/merge/deleteMergeMsg.ts')
      
      await Promise.all([
        deleteMergeHead({ fs: this.fs, gitdir: this.gitdir }),
        deleteMergeMode({ fs: this.fs, gitdir: this.gitdir }),
        deleteMergeMsg({ fs: this.fs, gitdir: this.gitdir }),
      ])
    }

    return {
      oid,
      tree: mergeResult,
      mergeCommit: true,
    }
  }

  // ============================================================================
  // High-Level Config Operations (merged from system/global/local/worktree)
  // ============================================================================

  /**
   * Get a config value (merged from system, global, and local config)
   * GitBackend only handles system/global/local config - worktree config is handled by WorktreeBackend
   */
  private _configProvider: import('../git/config/LocalConfigProvider.ts').LocalConfigProvider | null = null

  /**
   * Get or create LocalConfigProvider (lazy initialization)
   */
  private async _getConfigProvider(): Promise<import('../git/config/LocalConfigProvider.ts').LocalConfigProvider> {
    if (!this._configProvider) {
      const { LocalConfigProvider } = await import('../git/config/LocalConfigProvider.ts')
      this._configProvider = new LocalConfigProvider(this)
    }
    return this._configProvider
  }

  async getConfig(path: string): Promise<unknown> {
    const configProvider = await this._getConfigProvider()
    return configProvider.get(path)
  }

  /**
   * Set a config value (only local config is supported)
   * Note: 'worktree' scope is handled by WorktreeBackend, not GitBackend
   */
  async setConfig(
    path: string,
    value: unknown,
    scope?: 'local' | 'global' | 'system',
    append?: boolean
  ): Promise<void> {
    const configProvider = await this._getConfigProvider()
    return configProvider.set(path, value, scope, append)
  }

  /**
   * Get all values for a config path (only from local config)
   */
  async getAllConfig(path: string): Promise<Array<{ value: unknown; scope: 'local' }>> {
    const configProvider = await this._getConfigProvider()
    return configProvider.getAll(path)
  }

  /**
   * Get all subsections for a section
   */
  async getConfigSubsections(section: string): Promise<(string | null)[]> {
    const configProvider = await this._getConfigProvider()
    return configProvider.getSubsections(section)
  }

  /**
   * Get all section names
   */
  async getConfigSections(): Promise<string[]> {
    const configProvider = await this._getConfigProvider()
    return configProvider.getSections()
  }

  /**
   * Reload config (re-reads from filesystem/storage)
   */
  async reloadConfig(): Promise<void> {
    const configProvider = await this._getConfigProvider()
    return configProvider.reload()
  }

  // ============================================================================
  // Worktree Config Operations (require worktreeBackend to determine worktree gitdir)
  // ============================================================================

  /**
   * Helper to determine worktree gitdir from worktreeBackend
   */
  private async _getWorktreeGitdir(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<string> {
    const dir = worktreeBackend.getDirectory?.()
    if (!dir) {
      // No directory means it's the main worktree
      return this.gitdir
    }

    const { normalize } = await import('../core-utils/GitPath.ts')
    const normalizedDir = normalize(dir)
    const mainDir = normalize(join(this.gitdir, '..'))

    // Check if it's the main worktree
    if (normalizedDir === mainDir) {
      return this.gitdir
    }

    // Search for linked worktree
    const worktreesDir = join(this.gitdir, 'worktrees')
    try {
      if (await this.fs.exists(worktreesDir)) {
        const entries = await this.fs.readdir(worktreesDir)
        if (entries) {
          for (const entry of entries) {
            const candidateGitdir = join(worktreesDir, entry)
            const gitdirFile = join(candidateGitdir, 'gitdir')
            if (await this.fs.exists(gitdirFile)) {
              const content = await this.fs.read(gitdirFile, 'utf8')
              if (typeof content === 'string') {
                const candidatePath = normalize(content.trim())
                if (candidatePath === normalizedDir) {
                  return candidateGitdir
                }
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }

    // Default to main gitdir if not found
    return this.gitdir
  }

  async readWorktreeConfigObject(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<import('../core-utils/ConfigParser.ts').ConfigObject | null> {
    const worktreeGitdir = await this._getWorktreeGitdir(worktreeBackend)
    const { readWorktreeConfig } = await import('../git/config/worktreeConfig.ts')
    return readWorktreeConfig({ fs: this.fs, gitdir: worktreeGitdir })
  }

  async writeWorktreeConfigObject(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    config: import('../core-utils/ConfigParser.ts').ConfigObject
  ): Promise<void> {
    const worktreeGitdir = await this._getWorktreeGitdir(worktreeBackend)
    const { writeWorktreeConfig } = await import('../git/config/worktreeConfig.ts')
    return writeWorktreeConfig({ fs: this.fs, gitdir: worktreeGitdir, config })
  }

  async getWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    path: string
  ): Promise<unknown> {
    const config = await this.readWorktreeConfigObject(worktreeBackend)
    if (!config) return undefined
    
    return config.get(path)
  }

  async setWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    path: string,
    value: unknown,
    append = false
  ): Promise<void> {
    const { parse: parseConfig } = await import('../core-utils/ConfigParser.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    const existingConfig = await this.readWorktreeConfigObject(worktreeBackend)
    const config = existingConfig || parseConfig(UniversalBuffer.alloc(0))
    config.set(path, value, append)
    await this.writeWorktreeConfigObject(worktreeBackend, config)
  }

  async getAllWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    path: string
  ): Promise<Array<{ value: unknown; scope: 'worktree' }>> {
    const config = await this.readWorktreeConfigObject(worktreeBackend)
    if (!config) {
      return []
    }
    const values = config.getall(path) || []
    return values.map(value => ({ value, scope: 'worktree' as const }))
  }

  async getWorktreeConfigSubsections(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    section: string
  ): Promise<(string | null)[]> {
    const config = await this.readWorktreeConfigObject(worktreeBackend)
    if (!config) {
      return []
    }
    return config.getSubsections(section)
  }

  async getWorktreeConfigSections(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<string[]> {
    const config = await this.readWorktreeConfigObject(worktreeBackend)
    if (!config) {
      return []
    }
    const sections = new Set<string>()
    if (config.parsedConfig) {
      for (const entry of config.parsedConfig) {
        if (entry.isSection && entry.section) {
          sections.add(entry.section)
        }
      }
    }
    return Array.from(sections)
  }

  async reloadWorktreeConfig(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<void> {
    // Configs are loaded fresh on each call, so no-op
  }

  // ============================================================================
  // Sparse Checkout Operations (require worktreeBackend for directory access)
  // ============================================================================

  async sparseCheckoutInit(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    cone?: boolean
  ): Promise<void> {
    const dir = worktreeBackend.getDirectory?.()
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory for sparse checkout')
    }
    const worktreeGitdir = await this._getWorktreeGitdir(worktreeBackend)
    const { sparseCheckout } = await import('../commands/sparseCheckout.ts')
    await sparseCheckout({
      fs: this.fs,
      gitdir: worktreeGitdir,
      dir,
      init: true,
      cone: cone ?? false,
    })
  }

  async sparseCheckoutSet(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    patterns: string[],
    treeOid: string,
    cone?: boolean
  ): Promise<void> {
    const dir = worktreeBackend.getDirectory?.()
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory for sparse checkout')
    }
    const worktreeGitdir = await this._getWorktreeGitdir(worktreeBackend)
    const { sparseCheckout } = await import('../commands/sparseCheckout.ts')
    await sparseCheckout({
      fs: this.fs,
      gitdir: worktreeGitdir,
      dir,
      set: patterns,
      cone,
    })
  }

  async sparseCheckoutList(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  ): Promise<string[]> {
    const dir = worktreeBackend.getDirectory?.()
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory for sparse checkout')
    }
    const worktreeGitdir = await this._getWorktreeGitdir(worktreeBackend)
    const { sparseCheckout } = await import('../commands/sparseCheckout.ts')
    const result = await sparseCheckout({
      fs: this.fs,
      gitdir: worktreeGitdir,
      dir,
      list: true,
    })
    return result || []
  }

  // ============================================================================
  // File Operations (Staging Area) - Require worktreeBackend for file access
  // ============================================================================

  async add(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepaths: string | string[],
    options?: { force?: boolean; update?: boolean; parallel?: boolean }
  ): Promise<void> {
    const { MissingParameterError } = await import('../errors/MissingParameterError.ts')
    const { UnmergedPathsError } = await import('../errors/UnmergedPathsError.ts')
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { writeObject } = await import('../git/objects/writeObject.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    const { join } = await import('../utils/join.ts')
    const { basename } = await import('../utils/basename.ts')
    
    if (filepaths == null || (Array.isArray(filepaths) && filepaths.length === 0)) {
      throw new MissingParameterError('filepath')
    }

    // Read index directly using backend
    let indexBuffer: UniversalBuffer
    try {
      indexBuffer = await this.readIndex()
    } catch {
      // Index doesn't exist - create empty index
      indexBuffer = UniversalBuffer.alloc(0)
    }

    // Parse index
    let index: InstanceType<typeof GitIndex>
    const objectFormat = await detectObjectFormat(this.fs, this.gitdir)
    if (indexBuffer.length === 0) {
      index = new GitIndex(null, undefined, 2)
    } else {
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }

    // Check for unmerged paths
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }

    // Normalize filepaths to array
    const filepathArray = Array.isArray(filepaths) ? filepaths : [filepaths]
    
    // Recursively find all files matching the filepath patterns
    const filesToAdd: string[] = []
    const requestedFiles = new Set<string>(filepathArray)
    
    const collectFiles = async (basePath: string): Promise<void> => {
      try {
        const entries = await worktreeBackend.readdir(basePath || '.')
        if (!entries) return

        for (const entry of entries) {
          // Skip .git directories
          if (basename(entry) === '.git') continue
          
          const fullPath = basePath ? join(basePath, entry) : entry
          
          // Check if this path matches any of the filepath patterns
          const matches = filepathArray.some(pattern => {
            if (pattern === '.') return true
            if (fullPath === pattern) return true
            if (fullPath.startsWith(pattern + '/')) return true
            return false
          })

          if (!matches) continue

          const stat = await worktreeBackend.lstat(fullPath)
          if (!stat) continue

          if (stat.isDirectory()) {
            // Recursively collect files from directory
            await collectFiles(fullPath)
          } else {
            // Add file to list
            filesToAdd.push(fullPath)
            // Mark this file as found if it was explicitly requested
            requestedFiles.delete(fullPath)
          }
        }
      } catch {
        // Ignore errors (e.g., permission denied)
      }
    }

    // Collect files for each pattern
    for (const filepath of filepathArray) {
      const stat = await worktreeBackend.lstat(filepath).catch(() => null)
      if (stat && stat.isDirectory()) {
        await collectFiles(filepath)
        // Directory was found, remove from requested files
        requestedFiles.delete(filepath)
      } else if (stat) {
        // Single file
        filesToAdd.push(filepath)
        // Mark this file as found
        requestedFiles.delete(filepath)
      }
      // If stat is null, the file doesn't exist - leave it in requestedFiles
    }

    // Check for missing files - if any explicitly requested files weren't found, throw error
    if (requestedFiles.size > 0) {
      const missingFiles = Array.from(requestedFiles)
      if (missingFiles.length === 1) {
        const { NotFoundError } = await import('../errors/NotFoundError.ts')
        const err = new NotFoundError(`file at "${missingFiles[0]}" on disk and "remove" not set`)
        err.caller = 'git.add'
        throw err
      } else {
        // Multiple missing files - throw MultipleGitError
        const { MultipleGitError } = await import('../errors/MultipleGitError.ts')
        const { NotFoundError } = await import('../errors/NotFoundError.ts')
        const errors = missingFiles.map(file => 
          new NotFoundError(`file at "${file}" on disk and "remove" not set`)
        )
        const err = new MultipleGitError(errors)
        err.caller = 'git.add'
        throw err
      }
    }

    // Remove duplicates
    const uniqueFiles = Array.from(new Set(filesToAdd))

    // Process files - check ignore rules and add to index
    const processFile = async (filepath: string) => {
      // For ignore checking, we'd need dir which worktreeBackend doesn't expose
      // Skip ignore checking for now - the add command should handle this
      // TODO: Implement ignore checking using worktreeBackend.read() for .gitignore files

      // Read file stats from worktreeBackend
      const stat = await worktreeBackend.lstat(filepath)
      if (!stat) {
        const { NotFoundError } = await import('../errors/NotFoundError.ts')
        const err = new NotFoundError(`file at "${filepath}" on disk and "remove" not set`)
        err.caller = 'git.add'
        throw err
      }

      if (stat.isDirectory()) {
        return // Skip directories (they're handled by collectFiles)
      }

      // Read file content from worktreeBackend
      let content: Uint8Array | string | null = null
      if (stat.isSymbolicLink()) {
        content = await worktreeBackend.readlink(filepath)
      } else {
        content = await worktreeBackend.read(filepath)
      }

      if (content === null || content === undefined) {
        return // Skip empty files
      }

      // Convert to UniversalBuffer
      const objectBuffer = typeof content === 'string' 
        ? UniversalBuffer.from(content, 'utf8')
        : UniversalBuffer.isBuffer(content) 
          ? content 
          : UniversalBuffer.from(content)

      // Write blob to object database
      const oid = await writeObject({
        fs: this.fs,
        gitdir: this.gitdir,
        type: 'blob',
        format: 'content',
        object: objectBuffer,
      })

      // Update index with the file
      // Convert stat to the format expected by GitIndex
      const { normalizeStats } = await import('../utils/normalizeStats.ts')
      const normalizedStats = normalizeStats(stat)

      index.insert({
        filepath,
        oid,
        stats: normalizedStats,
      })
    }

    // Process files in parallel or sequentially
    if (options?.parallel !== false) {
      await Promise.all(uniqueFiles.map(processFile))
    } else {
      for (const filepath of uniqueFiles) {
        await processFile(filepath)
      }
    }

    // Write index back using backend
    const updatedIndexBuffer = await index.toBuffer(objectFormat)
    await this.writeIndex(updatedIndexBuffer)
  }

  async remove(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepaths: string | string[],
    options?: { cached?: boolean; force?: boolean }
  ): Promise<void> {
    const { remove } = await import('../commands/remove.ts')
    const filepathArray = Array.isArray(filepaths) ? filepaths : [filepaths]
    
    // Get dir from worktreeBackend
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    // Use remove command with backends - it will use fs, dir, gitdir directly
    for (const filepath of filepathArray) {
      await remove({
        fs: this.fs,
        dir,
        gitdir: this.gitdir,
        filepath,
        cached: options?.cached,
        force: options?.force,
      })
    }
  }

  async updateIndex(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepath: string,
    options?: {
      oid?: string
      mode?: number
      add?: boolean
      remove?: boolean
      force?: boolean
    }
  ): Promise<string | void> {
    const { MissingParameterError } = await import('../errors/MissingParameterError.ts')
    const { InvalidFilepathError } = await import('../errors/InvalidFilepathError.ts')
    const { NotFoundError } = await import('../errors/NotFoundError.ts')
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { writeObject } = await import('../git/objects/writeObject.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { normalizeStats } = await import('../utils/normalizeStats.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    // Read index directly using backend
    let indexBuffer: UniversalBuffer
    try {
      indexBuffer = await this.readIndex()
    } catch {
      indexBuffer = UniversalBuffer.alloc(0)
    }

    // Parse index
    let index: InstanceType<typeof GitIndex>
    const objectFormat = await detectObjectFormat(this.fs, this.gitdir)
    if (indexBuffer.length === 0) {
      index = new GitIndex(null, undefined, 2)
    } else {
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }

    if (options?.remove) {
      if (!options.force) {
        // Check if the file is still present in the working directory
        const stat = await worktreeBackend.lstat(filepath)
        if (stat) {
          if (stat.isDirectory()) {
            throw new InvalidFilepathError('directory')
          }
          // Do nothing if we don't force and the file still exists in the workdir
          return
        }
      }

      // Directories are not allowed, so we make sure the provided filepath exists in the index
      if (index.has({ filepath })) {
        index.delete({ filepath })
        const updatedIndexBuffer = await index.toBuffer(objectFormat)
        await this.writeIndex(updatedIndexBuffer)
      }
      return
    }

    // Test if it is a file and exists on disk if `remove` is not provided, only if no oid is provided
    let fileStats: any

    if (!options?.oid) {
      const stat = await worktreeBackend.lstat(filepath)
      if (!stat) {
        throw new NotFoundError(`file at "${filepath}" on disk and "remove" not set`)
      }
      if (stat.isDirectory()) {
        throw new InvalidFilepathError('directory')
      }
      fileStats = stat
    }

    if (!options?.add && !index.has({ filepath })) {
      // If the index does not contain the filepath yet and `add` is not set, we should throw
      throw new NotFoundError(`file at "${filepath}" in index and "add" not set`)
    }

    let stats: any
    let oid: string | undefined = options?.oid

    if (!oid) {
      stats = fileStats

      // Read file content from worktreeBackend
      let content: Uint8Array | string | null = null
      if (stats.isSymbolicLink()) {
        content = await worktreeBackend.readlink(filepath)
      } else {
        content = await worktreeBackend.read(filepath)
      }

      // Convert string to UniversalBuffer if needed, skip if null
      if (content) {
        const objectBuffer = typeof content === 'string' 
          ? UniversalBuffer.from(content, 'utf8')
          : UniversalBuffer.isBuffer(content) 
            ? content 
            : UniversalBuffer.from(content)
        
        oid = await writeObject({
          fs: this.fs,
          gitdir: this.gitdir,
          type: 'blob',
          format: 'content',
          object: objectBuffer,
        })
      }
    } else {
      // By default we use 0 for the stats of the index file
      stats = {
        ctime: new Date(0),
        mtime: new Date(0),
        dev: 0,
        ino: 0,
        mode: options?.mode || 0o100644,
        uid: 0,
        gid: 0,
        size: 0,
      }
    }

    // Ensure oid is defined before inserting
    if (!oid) {
      throw new Error('oid is required for index.insert')
    }

    // Convert stat to the format expected by GitIndex
    const normalizedStats = normalizeStats(stats)

    index.insert({
      filepath,
      oid,
      stats: normalizedStats,
    })

    // Write index back using backend
    const updatedIndexBuffer = await index.toBuffer(objectFormat)
    await this.writeIndex(updatedIndexBuffer)
    return oid
  }

  async commit(
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
  ): Promise<string> {
    const { commit } = await import('../commands/commit.ts')
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    return await commit({
      fs: this.fs,
      dir,
      gitdir: this.gitdir,
      message,
      author: options?.author,
      committer: options?.committer,
      signingKey: options?.signingKey,
      onSign: options?.onSign,
      amend: options?.amend,
      dryRun: options?.dryRun,
      noUpdateBranch: options?.noUpdateBranch,
      ref: options?.ref,
      parent: options?.parent,
      tree: options?.tree,
    })
  }

  async checkout(
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
  ): Promise<void> {
    const { checkout } = await import('../commands/checkout.ts')
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    return await checkout({
      fs: this.fs,
      dir,
      gitdir: this.gitdir,
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
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    branch: string,
    options?: {
      create?: boolean
      force?: boolean
      track?: boolean
      remote?: string
    }
  ): Promise<void> {
    // Switch is essentially checkout with branch switching
    return await this.checkout(worktreeBackend, branch, {
      force: options?.force,
      track: options?.track,
      remote: options?.remote,
    })
  }

  async status(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    filepath: string
  ): Promise<import('../commands/status.ts').FileStatus> {
    const { status } = await import('../commands/status.ts')
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    return await status({
      fs: this.fs,
      dir,
      gitdir: this.gitdir,
      filepath,
    })
  }

  async statusMatrix(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    options?: { filepaths?: string[] }
  ): Promise<import('../commands/statusMatrix.ts').StatusRow[]> {
    const { statusMatrix } = await import('../commands/statusMatrix.ts')
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    return await statusMatrix({
      fs: this.fs,
      dir,
      gitdir: this.gitdir,
      filepaths: options?.filepaths,
    })
  }

  async reset(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    ref?: string,
    mode?: 'soft' | 'mixed' | 'hard'
  ): Promise<void> {
    const { resetToCommit } = await import('../commands/reset.ts')
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    return await resetToCommit({
      fs: this.fs,
      dir,
      gitdir: this.gitdir,
      ref: ref || 'HEAD',
      mode: mode || 'mixed',
    })
  }

  async diff(
    worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    options?: {
      ref?: string
      filepaths?: string[]
      cached?: boolean
    }
  ): Promise<import('../commands/diff.ts').DiffResult> {
    const { diff } = await import('../commands/diff.ts')
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    return await diff({
      fs: this.fs,
      dir,
      gitdir: this.gitdir,
      refA: options?.ref,
      filepath: options?.filepaths?.[0],
      staged: options?.cached,
    })
  }

  async mergeTree(
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
  ): Promise<string | import('../errors/MergeConflictError.ts').MergeConflictError> {
    const { mergeTree } = await import('../git/merge/mergeTree.ts')
    const dir = worktreeBackend.getDirectory?.() || ''
    if (!dir) {
      throw new Error('WorktreeBackend must provide a directory')
    }

    // Read index from gitdir
    const { readIndex } = await import('../git/index/readIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const objectFormat = await detectObjectFormat(this.fs, this.gitdir, {})
    const index = await readIndex({ fs: this.fs, gitdir: this.gitdir, objectFormat })

    // mergeTree needs repo for writeTree and worktreeBackend access
    // Create a minimal Repository instance with this gitBackend and worktreeBackend
    const { Repository } = await import('../core-utils/Repository.ts')
    const repo = new Repository({
      gitBackend: this,
      worktreeBackend,
      cache: {},
      autoDetectConfig: true,
    })
    
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
  // ============================================================================
  // Walker Creation
  // ============================================================================

  async createTreeWalker(ref: string = 'HEAD', cache: Record<string, unknown> = {}): Promise<import('../models/GitWalkerRepo.ts').GitWalkerRepo> {
    const { GitWalkerRepo } = await import('../models/GitWalkerRepo.ts')
    return new GitWalkerRepo({ gitBackend: this, ref, cache })
  }

  async createIndexWalker(cache: Record<string, unknown> = {}): Promise<import('../models/GitWalkerIndex.ts').GitWalkerIndex> {
    const { GitWalkerIndex } = await import('../models/GitWalkerIndex.ts')
    return new GitWalkerIndex({ gitBackend: this, cache })
  }

  // ============================================================================
  // Blob Operations
  // ============================================================================

  async readBlob(oid: string, filepath?: string): Promise<{ oid: string; blob: Uint8Array }> {
    if (!oid || typeof oid !== 'string') {
      throw new Error(`Invalid OID: ${oid}`)
    }
    
    // Use a shared cache for objectFormat detection across all readObject calls
    const cache: Record<string, unknown> = {}
    
    // Peel tags/commits to get to the blob
    let currentOid = oid
    let currentObj = await this.readObject(currentOid, 'content', cache)
    
    // Peel tags
    while (currentObj.type === 'tag') {
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      const tagBuffer = UniversalBuffer.from(currentObj.object)
      const tagText = tagBuffer.toString('utf8')
      const objectMatch = tagText.match(/^object ([a-f0-9]{40,64})/m)
      if (!objectMatch) {
        throw new Error('Tag object missing object reference')
      }
      currentOid = objectMatch[1]
      currentObj = await this.readObject(currentOid, 'content', cache)
    }
    
    // If filepath is provided, resolve it within the tree/commit
    if (filepath !== undefined) {
      // If it's a commit, get the tree OID
      if (currentObj.type === 'commit') {
        const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
        const commitBuffer = UniversalBuffer.from(currentObj.object)
        const commitText = commitBuffer.toString('utf8')
        const treeMatch = commitText.match(/^tree ([a-f0-9]{40,64})/m)
        if (!treeMatch) {
          throw new Error('Commit object missing tree reference')
        }
        currentOid = treeMatch[1]
        currentObj = await this.readObject(currentOid, 'content', cache)
      }
      
      // Walk the tree to find the file
      if (currentObj.type !== 'tree') {
        throw new Error(`Cannot resolve filepath in ${currentObj.type} object`)
      }
      
      const pathParts = filepath.split('/').filter(p => p)
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]
        const isLast = i === pathParts.length - 1
        
        const { GitTree } = await import('../models/GitTree.ts')
        const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
        const tree = GitTree.from(UniversalBuffer.from(currentObj.object))
        const entry = tree.entries().find(e => e.path === part)
        if (!entry || !entry.oid) {
          throw new Error(`File not found: ${filepath}`)
        }
        
        currentOid = entry.oid
        if (!currentOid) {
          throw new Error(`Entry ${part} has no OID`)
        }
        
        if (isLast) {
          // We'll read the blob object below
        } else {
          currentObj = await this.readObject(currentOid, 'content', cache)
          if (currentObj.type !== 'tree') {
            throw new Error(`Expected tree object at ${part}, got ${currentObj.type}`)
          }
        }
      }
    }
    
    // If we resolved a filepath, we need to read the final blob object
    if (filepath !== undefined && currentObj.type !== 'blob') {
      if (!currentOid) {
        throw new Error('OID is undefined after resolving filepath')
      }
      currentObj = await this.readObject(currentOid, 'content', cache)
    }
    
    // Peel commits to get to the tree/blob
    while (currentObj.type === 'commit') {
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      const commitBuffer = UniversalBuffer.from(currentObj.object)
      const commitText = commitBuffer.toString('utf8')
      const treeMatch = commitText.match(/^tree ([a-f0-9]{40,64})/m)
      if (!treeMatch || !treeMatch[1]) {
        throw new Error('Commit object missing tree reference')
      }
      currentOid = treeMatch[1]
      if (!currentOid) {
        throw new Error('Tree OID is undefined')
      }
      currentObj = await this.readObject(currentOid, 'content', cache)
    }
    
    // Now we should have a blob
    if (currentObj.type !== 'blob') {
      throw new Error(`Expected blob object, got ${currentObj.type}`)
    }
    
    if (!currentOid) {
      throw new Error('OID is undefined after resolving blob')
    }
    
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    const blob = UniversalBuffer.from(currentObj.object)
    return { 
      oid: currentOid, 
      blob: blob instanceof Uint8Array ? blob : new Uint8Array(blob) 
    }
  }

  // Private Helpers
  // ============================================================================

  private _oidToPath(oid: string): { dir: string; file: string } {
    return {
      dir: oid.substring(0, 2),
      file: oid.substring(2),
    }
  }
}

