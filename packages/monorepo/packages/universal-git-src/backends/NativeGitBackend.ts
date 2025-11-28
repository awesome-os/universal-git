import { execSync } from 'child_process'
import { join } from "../core-utils/GitPath.ts"
import type { FileSystem, FileSystemProvider } from "../models/FileSystem.ts"
import type { GitBackend } from './GitBackend.ts'
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import { FilesystemBackend } from './FilesystemBackend.ts'

/**
 * NativeGitBackend - Native Git CLI-based implementation of GitBackend
 * 
 * This backend uses the same implementations as FilesystemBackend but uses
 * node execSync for git operations. It wraps FilesystemBackend internally
 * for file operations and uses native git CLI commands for git operations.
 * 
 * This backend is primarily intended for testing and comparison purposes,
 * allowing tests to use native git CLI while still working with universal-git's
 * Repository interface.
 */
export class NativeGitBackend implements GitBackend {
  private readonly fsBackend: FilesystemBackend
  private readonly gitdir: string
  private readonly workdir: string | null

  constructor(
    fs: FileSystem,
    gitdir: string,
    workdir?: string | null
  ) {
    this.fsBackend = new FilesystemBackend(fs, gitdir)
    this.gitdir = gitdir
    // Workdir is needed for git commands that operate on the working directory
    this.workdir = workdir || null
  }

  getType(): string {
    return 'native-git'
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
    return this.fsBackend.getFs()
  }


  /**
   * Get the working directory for git commands
   */
  private getWorkdir(): string {
    if (this.workdir) {
      return this.workdir
    }
    // Try to get workdir from gitdir (assuming standard .git structure)
    const gitdirPath = this.gitdir
    if (gitdirPath.endsWith('.git')) {
      return gitdirPath.substring(0, gitdirPath.length - 4)
    }
    // Fallback to gitdir if we can't determine workdir
    return gitdirPath
  }

  /**
   * Execute a git command using execSync
   */
  private execGit(command: string, options: { cwd?: string; env?: Record<string, string> } = {}): string {
    const workdir = options.cwd || this.getWorkdir()
    // Use --git-dir and --work-tree flags for better compatibility
    // This ensures git commands work even if GIT_DIR env var isn't respected
    const gitDirFlag = `--git-dir="${this.gitdir}"`
    const workTreeFlag = workdir ? `--work-tree="${workdir}"` : ''
    const gitCommand = workTreeFlag 
      ? `git ${gitDirFlag} ${workTreeFlag} ${command}`
      : `git ${gitDirFlag} ${command}`
    
    const env = {
      ...process.env,
      ...options.env,
    }
    try {
      return execSync(gitCommand, {
        cwd: workdir || undefined,
        env,
        encoding: 'utf-8',
        stdio: 'pipe',
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', // Required for quoted paths on Windows
      }).trim()
    } catch (error: any) {
      throw new Error(`Git command failed: ${gitCommand}\n${error.message}`)
    }
  }

  // ============================================================================
  // Core Metadata & Current State
  // ============================================================================

  async readHEAD(): Promise<string> {
    // Use native git to read HEAD
    try {
      const ref = this.execGit('symbolic-ref HEAD')
      // Return in the format "ref: refs/heads/master"
      return `ref: ${ref}`
    } catch {
      // If symbolic-ref fails, try to read the raw HEAD (detached HEAD state)
      try {
        const head = this.execGit('rev-parse HEAD')
        return head
      } catch {
        // Fallback to filesystem backend
        return this.fsBackend.readHEAD()
      }
    }
  }

  async writeHEAD(value: string): Promise<void> {
    // Use native git to write HEAD
    if (value.startsWith('ref: ')) {
      const ref = value.substring(5)
      this.execGit(`symbolic-ref HEAD ${ref}`)
    } else {
      // Direct OID
      this.execGit(`update-ref HEAD ${value}`)
    }
  }

  async readConfig(): Promise<UniversalBuffer> {
    // Use filesystem backend for config (native git doesn't have a direct way to read raw config)
    return this.fsBackend.readConfig()
  }

  async writeConfig(data: UniversalBuffer): Promise<void> {
    // Use filesystem backend for config
    return this.fsBackend.writeConfig(data)
  }

  async hasConfig(): Promise<boolean> {
    return this.fsBackend.hasConfig()
  }

  async readIndex(): Promise<UniversalBuffer> {
    // Use filesystem backend for index (native git doesn't have a direct way to read raw index)
    return this.fsBackend.readIndex()
  }

  async writeIndex(data: UniversalBuffer): Promise<void> {
    // Use filesystem backend for index
    return this.fsBackend.writeIndex(data)
  }

  async hasIndex(): Promise<boolean> {
    return this.fsBackend.hasIndex()
  }

  async readDescription(): Promise<string | null> {
    return this.fsBackend.readDescription()
  }

  async writeDescription(description: string): Promise<void> {
    return this.fsBackend.writeDescription(description)
  }

  async readStateFile(name: string): Promise<string | null> {
    return this.fsBackend.readStateFile(name)
  }

  async writeStateFile(name: string, value: string): Promise<void> {
    return this.fsBackend.writeStateFile(name, value)
  }

  async deleteStateFile(name: string): Promise<void> {
    return this.fsBackend.deleteStateFile(name)
  }

  async listStateFiles(): Promise<string[]> {
    return this.fsBackend.listStateFiles()
  }

  // ============================================================================
  // Sequencer Operations
  // ============================================================================

  async readSequencerFile(name: string): Promise<string | null> {
    return this.fsBackend.readSequencerFile(name)
  }

  async writeSequencerFile(name: string, data: string): Promise<void> {
    return this.fsBackend.writeSequencerFile(name, data)
  }

  async deleteSequencerFile(name: string): Promise<void> {
    return this.fsBackend.deleteSequencerFile(name)
  }

  async listSequencerFiles(): Promise<string[]> {
    return this.fsBackend.listSequencerFiles()
  }

  // ============================================================================
  // Object Database (ODB)
  // ============================================================================

  async readLooseObject(oid: string): Promise<UniversalBuffer | null> {
    // Use filesystem backend for reading loose objects
    return this.fsBackend.readLooseObject(oid)
  }

  async writeLooseObject(oid: string, data: UniversalBuffer): Promise<void> {
    // Use filesystem backend for writing loose objects
    return this.fsBackend.writeLooseObject(oid, data)
  }

  async hasLooseObject(oid: string): Promise<boolean> {
    return this.fsBackend.hasLooseObject(oid)
  }

  async listLooseObjects(): Promise<string[]> {
    return this.fsBackend.listLooseObjects()
  }

  async readPackfile(name: string): Promise<UniversalBuffer | null> {
    return this.fsBackend.readPackfile(name)
  }

  async writePackfile(name: string, data: UniversalBuffer): Promise<void> {
    return this.fsBackend.writePackfile(name, data)
  }

  async listPackfiles(): Promise<string[]> {
    return this.fsBackend.listPackfiles()
  }

  async readPackIndex(name: string): Promise<UniversalBuffer | null> {
    return this.fsBackend.readPackIndex(name)
  }

  async writePackIndex(name: string, data: UniversalBuffer): Promise<void> {
    return this.fsBackend.writePackIndex(name, data)
  }

  async readPackBitmap(name: string): Promise<UniversalBuffer | null> {
    return this.fsBackend.readPackBitmap(name)
  }

  async writePackBitmap(name: string, data: UniversalBuffer): Promise<void> {
    return this.fsBackend.writePackBitmap(name, data)
  }

  async readODBInfoFile(name: string): Promise<string | null> {
    return this.fsBackend.readODBInfoFile(name)
  }

  async writeODBInfoFile(name: string, data: string): Promise<void> {
    return this.fsBackend.writeODBInfoFile(name, data)
  }

  async deleteODBInfoFile(name: string): Promise<void> {
    return this.fsBackend.deleteODBInfoFile(name)
  }

  async readMultiPackIndex(): Promise<UniversalBuffer | null> {
    return this.fsBackend.readMultiPackIndex()
  }

  async writeMultiPackIndex(data: UniversalBuffer): Promise<void> {
    return this.fsBackend.writeMultiPackIndex(data)
  }

  async hasMultiPackIndex(): Promise<boolean> {
    return this.fsBackend.hasMultiPackIndex()
  }

  // ============================================================================
  // High-Level Object Operations
  // ============================================================================

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
    // Use filesystem backend which delegates to universal-git's readObject
    return this.fsBackend.readObject(oid, format, cache)
  }

  async writeObject(
    type: string,
    object: UniversalBuffer | Uint8Array,
    format: 'wrapped' | 'deflated' | 'content' = 'content',
    oid?: string,
    dryRun: boolean = false,
    cache: Record<string, unknown> = {}
  ): Promise<string> {
    // Use filesystem backend which delegates to universal-git's writeObject
    return this.fsBackend.writeObject(type, object, format, oid, dryRun, cache)
  }

  // ============================================================================
  // References
  // ============================================================================

  async readRef(ref: string, depth: number = 5, cache: Record<string, unknown> = {}): Promise<string | null> {
    // Use native git to read ref
    try {
      return this.execGit(`rev-parse ${ref}`)
    } catch {
      return null
    }
  }

  async writeRef(ref: string, value: string, skipReflog: boolean = false, cache: Record<string, unknown> = {}): Promise<void> {
    // Use native git to write ref
    const reflogFlag = skipReflog ? '--no-create-reflog' : ''
    this.execGit(`update-ref ${reflogFlag} ${ref} ${value}`)
  }

  async writeSymbolicRef(ref: string, value: string, oldOid?: string, cache: Record<string, unknown> = {}): Promise<void> {
    // Use native git to write symbolic ref
    // Strip 'ref: ' prefix if present (it's only used in HEAD file format, not in git command)
    const refValue = value.startsWith('ref: ') ? value.substring(5) : value
    if (oldOid) {
      this.execGit(`symbolic-ref ${ref} ${refValue}`)
    } else {
      this.execGit(`symbolic-ref ${ref} ${refValue}`)
    }
  }

  async readSymbolicRef(ref: string): Promise<string | null> {
    // Use native git to read symbolic ref
    try {
      return this.execGit(`symbolic-ref ${ref}`)
    } catch {
      return null
    }
  }

  async deleteRef(ref: string, cache: Record<string, unknown> = {}): Promise<void> {
    // Use native git to delete ref
    this.execGit(`update-ref -d ${ref}`)
  }

  async listRefs(filepath: string): Promise<string[]> {
    // Use filesystem backend for listing refs
    return this.fsBackend.listRefs(filepath)
  }

  // ============================================================================
  // Reflogs
  // ============================================================================

  async readReflog(ref: string): Promise<string | null> {
    return this.fsBackend.readReflog(ref)
  }

  async writeReflog(ref: string, data: string): Promise<void> {
    return this.fsBackend.writeReflog(ref, data)
  }

  async appendReflog(ref: string, entry: string): Promise<void> {
    return this.fsBackend.appendReflog(ref, entry)
  }

  async deleteReflog(ref: string): Promise<void> {
    return this.fsBackend.deleteReflog(ref)
  }

  async listReflogs(): Promise<string[]> {
    return this.fsBackend.listReflogs()
  }

  // ============================================================================
  // Info Files
  // ============================================================================

  async readInfoFile(name: string): Promise<string | null> {
    return this.fsBackend.readInfoFile(name)
  }

  async writeInfoFile(name: string, data: string): Promise<void> {
    return this.fsBackend.writeInfoFile(name, data)
  }

  async deleteInfoFile(name: string): Promise<void> {
    return this.fsBackend.deleteInfoFile(name)
  }

  // ============================================================================
  // Hooks
  // ============================================================================

  async readHook(name: string): Promise<UniversalBuffer | null> {
    return this.fsBackend.readHook(name)
  }

  async writeHook(name: string, data: UniversalBuffer): Promise<void> {
    return this.fsBackend.writeHook(name, data)
  }

  async deleteHook(name: string): Promise<void> {
    return this.fsBackend.deleteHook(name)
  }

  async listHooks(): Promise<string[]> {
    return this.fsBackend.listHooks()
  }

  async hasHook(name: string): Promise<boolean> {
    return this.fsBackend.hasHook(name)
  }

  async runHook(
    hookName: string,
    context?: import('../git/hooks/runHook.ts').HookContext,
    executor?: import('../git/hooks/runHook.ts').HookExecutor,
    stdin?: string | import('../utils/UniversalBuffer.ts').UniversalBuffer,
    args?: string[]
  ): Promise<import('../git/hooks/runHook.ts').HookResult> {
    return this.fsBackend.runHook(hookName, context, executor, stdin, args)
  }

  // ============================================================================
  // Advanced Features
  // ============================================================================

  async readSubmoduleConfig(path: string): Promise<string | null> {
    return this.fsBackend.readSubmoduleConfig(path)
  }

  async writeSubmoduleConfig(path: string, data: string): Promise<void> {
    return this.fsBackend.writeSubmoduleConfig(path, data)
  }

  async readWorktreeConfig(name: string): Promise<string | null> {
    return this.fsBackend.readWorktreeConfig(name)
  }

  async writeWorktreeConfig(name: string, data: string): Promise<void> {
    return this.fsBackend.writeWorktreeConfig(name, data)
  }

  async listWorktrees(): Promise<string[]> {
    return this.fsBackend.listWorktrees()
  }

  async createWorktreeGitdir(name: string, worktreeDir: string): Promise<import('./GitBackend.ts').WorktreeGitdir> {
    return this.fsBackend.createWorktreeGitdir(name, worktreeDir)
  }

  async writeWorktreeHEAD(worktreeGitdir: import('./GitBackend.ts').WorktreeGitdir, value: string): Promise<void> {
    return this.fsBackend.writeWorktreeHEAD(worktreeGitdir, value)
  }

  async readShallow(): Promise<string | null> {
    return this.fsBackend.readShallow()
  }

  async writeShallow(data: string): Promise<void> {
    return this.fsBackend.writeShallow(data)
  }

  async deleteShallow(): Promise<void> {
    return this.fsBackend.deleteShallow()
  }

  async readLFSFile(path: string): Promise<UniversalBuffer | null> {
    return this.fsBackend.readLFSFile(path)
  }

  async writeLFSFile(path: string, data: UniversalBuffer): Promise<void> {
    return this.fsBackend.writeLFSFile(path, data)
  }

  async listLFSFiles(prefix?: string): Promise<string[]> {
    return this.fsBackend.listLFSFiles(prefix)
  }

  async readGitDaemonExportOk(): Promise<boolean> {
    return this.fsBackend.readGitDaemonExportOk()
  }

  async writeGitDaemonExportOk(): Promise<void> {
    return this.fsBackend.writeGitDaemonExportOk()
  }

  async deleteGitDaemonExportOk(): Promise<void> {
    return this.fsBackend.deleteGitDaemonExportOk()
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async initialize(): Promise<void> {
    // Use native git to initialize
    this.execGit('init', { cwd: this.getWorkdir() })
  }

  async isInitialized(): Promise<boolean> {
    return this.fsBackend.isInitialized()
  }

  async existsFile(path: string): Promise<boolean> {
    return this.fsBackend.existsFile(path)
  }

  async readPackedRefs(): Promise<string | null> {
    return this.fsBackend.readPackedRefs()
  }

  async writePackedRefs(data: string): Promise<void> {
    return this.fsBackend.writePackedRefs(data)
  }

  async expandRef(ref: string, cache: Record<string, unknown> = {}): Promise<string> {
    // Use native git to expand ref
    try {
      const result = this.execGit(`rev-parse --symbolic-full-name ${ref}`)
      return result.trim()
    } catch {
      // If that fails, try without --symbolic-full-name
      try {
        const oid = this.execGit(`rev-parse ${ref}`)
        // If it's a valid OID, return it
        if (oid && /^[0-9a-f]{40}$/.test(oid.trim())) {
          return oid.trim()
        }
        // Otherwise delegate to filesystem backend
        return this.fsBackend.expandRef(ref, cache)
      } catch {
        // Delegate to filesystem backend
        return this.fsBackend.expandRef(ref, cache)
      }
    }
  }

  async close(): Promise<void> {
    return this.fsBackend.close()
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
    return this.fsBackend.getRemoteInfo(url, options)
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
    return this.fsBackend.listServerRefs(url, options)
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
    // Use native git for merge operations
    const workdir = this.getWorkdir()
    const cache = options?.cache || {}
    
    try {
      // Checkout ours branch first
      this.execGit(`checkout ${ours}`, { cwd: workdir })
      
      // Build merge command
      const mergeArgs: string[] = []
      if (options?.noUpdateBranch) {
        // For dry run, we'll handle it differently
        if (options.dryRun) {
          mergeArgs.push('--no-commit', '--no-ff')
        }
      } else {
        if (!options?.fastForward) {
          mergeArgs.push('--no-ff')
        }
        if (options?.fastForwardOnly) {
          mergeArgs.push('--ff-only')
        }
        if (options?.message) {
          mergeArgs.push('-m', `"${options.message}"`)
        }
        if (options?.allowUnrelatedHistories) {
          mergeArgs.push('--allow-unrelated-histories')
        }
      }
      
      // Attempt merge
      try {
        this.execGit(`merge ${mergeArgs.join(' ')} ${theirs}`, { cwd: workdir })
        
        // Merge succeeded
        const oid = this.execGit('rev-parse HEAD', { cwd: workdir })
        const tree = this.execGit('rev-parse HEAD^{tree}', { cwd: workdir })
        
        // Check if it was a fast-forward by checking if HEAD^2 exists (merge commit has 2 parents)
        let isFastForward = false
        try {
          // Try to access HEAD^2 - if it exists, it's a merge commit (not fast-forward)
          this.execGit('rev-parse HEAD^2', { cwd: workdir })
          // HEAD^2 exists, so it's a merge commit
          isFastForward = false
        } catch {
          // HEAD^2 doesn't exist, so it might be a fast-forward
          // Check if ORIG_HEAD exists and if current HEAD is a descendant (fast-forward)
          try {
            const origHead = this.execGit('rev-parse ORIG_HEAD', { cwd: workdir })
            // If ORIG_HEAD equals current HEAD, it's already merged (not a fast-forward, but already merged)
            // If ORIG_HEAD is an ancestor of HEAD, it's a fast-forward
            try {
              this.execGit(`merge-base --is-ancestor ${origHead} ${oid}`, { cwd: workdir })
              isFastForward = true
            } catch {
              // Not an ancestor, so it's not a fast-forward
              isFastForward = false
            }
          } catch {
            // Can't determine, assume it's not a fast-forward
            isFastForward = false
          }
        }
        
        return {
          oid,
          tree,
          mergeCommit: !isFastForward,
          fastForward: isFastForward,
        }
      } catch (mergeError: any) {
        // Check if merge failed due to conflicts
        let unmergedFiles: string[] = []
        try {
          unmergedFiles = this.execGit('diff --name-only --diff-filter=U', { cwd: workdir })
            .split('\n')
            .filter(Boolean)
        } catch {
          // Can't get unmerged files, might not be a conflict
        }
        
        if (unmergedFiles.length > 0) {
          // Conflicts detected
          const { MergeConflictError } = await import('../errors/MergeConflictError.ts')
          const error = new MergeConflictError(unmergedFiles, unmergedFiles, [], [])
          
          if (options?.abortOnConflict !== false) {
            // Abort the merge
            try {
              this.execGit('merge --abort', { cwd: workdir })
            } catch {
              // Ignore abort errors
            }
          }
          
          throw error
        }
        
        // Re-throw if it's not a conflict error
        throw mergeError
      }
    } catch (error) {
      // If it's already a MergeConflictError, re-throw it
      if (error instanceof Error && error.constructor.name === 'MergeConflictError') {
        throw error
      }
      
      // Otherwise, fall back to filesystem backend implementation
      return this.fsBackend.merge(ours, theirs, options)
    }
  }

  // ============================================================================
  // High-Level Config Operations (merged from system/global/local)
  // Note: Worktree config is handled by WorktreeBackend, not GitBackend
  // ============================================================================

  /**
   * Get a config value (merged from system, global, and local config)
   * Delegates to FilesystemBackend
   */
  async getConfig(path: string): Promise<unknown> {
    return this.fsBackend.getConfig(path)
  }

  /**
   * Set a config value
   * Delegates to FilesystemBackend
   * Note: 'worktree' scope is handled by WorktreeBackend, not GitBackend
   */
  async setConfig(
    path: string,
    value: unknown,
    scope?: 'local' | 'global' | 'system',
    append?: boolean
  ): Promise<void> {
    return this.fsBackend.setConfig(path, value, scope, append)
  }

  /**
   * Get all values for a config path from all scopes (system, global, local)
   * Delegates to FilesystemBackend
   */
  async getAllConfig(path: string): Promise<Array<{ value: unknown; scope: 'local' }>> {
    return this.fsBackend.getAllConfig(path)
  }

  /**
   * Get all subsections for a section
   * Delegates to FilesystemBackend
   */
  async getConfigSubsections(section: string): Promise<(string | null)[]> {
    return this.fsBackend.getConfigSubsections(section)
  }

  /**
   * Get all section names
   * Delegates to FilesystemBackend
   */
  async getConfigSections(): Promise<string[]> {
    return this.fsBackend.getConfigSections()
  }

  /**
   * Reload all configs (re-reads from filesystem/storage)
   * Delegates to FilesystemBackend
   */
  async reloadConfig(): Promise<void> {
    return this.fsBackend.reloadConfig()
  }

  // ============================================================================
  // Convenience Methods for Native Git Operations
  // These methods wrap common git CLI commands for use in tests
  // ============================================================================

  /**
   * Create an orphan branch (branch with no parent)
   * @param branchName - Name of the orphan branch
   */
  async checkoutOrphan(branchName: string): Promise<void> {
    const workdir = this.getWorkdir()
    this.execGit(`checkout --orphan ${branchName}`, { cwd: workdir })
  }

  /**
   * Stage files for commit
   * @param filepaths - File or directory paths to add (default: all files)
   */
  async addFiles(filepaths: string | string[] = '.'): Promise<void> {
    const workdir = this.getWorkdir()
    const paths = Array.isArray(filepaths) ? filepaths : [filepaths]
    for (const path of paths) {
      this.execGit(`add "${path}"`, { cwd: workdir })
    }
  }

  /**
   * Remove files from index and working directory
   * @param filepaths - File or directory paths to remove
   * @param options - Remove options
   */
  async rmFiles(filepaths: string | string[], options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const workdir = this.getWorkdir()
    const paths = Array.isArray(filepaths) ? filepaths : [filepaths]
    const flags: string[] = []
    if (options?.recursive) {
      flags.push('-r')
    }
    if (options?.force) {
      flags.push('-f')
    }
    const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : ''
    for (const path of paths) {
      this.execGit(`rm${flagStr} "${path}"`, { cwd: workdir })
    }
  }

  /**
   * Create a commit using native git
   * @param message - Commit message
   * @param options - Commit options
   * @returns Commit OID
   */
  async createCommit(
    message: string,
    options?: {
      author?: Partial<import('../models/GitCommit.ts').Author>
      committer?: Partial<import('../models/GitCommit.ts').Author>
      env?: Record<string, string>
    }
  ): Promise<string> {
    const workdir = this.getWorkdir()
    // Filter out undefined values from process.env
    const processEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        processEnv[key] = value
      }
    }
    const env: Record<string, string> = {
      ...processEnv,
      ...options?.env,
    }
    
    // Set author name and email if provided
    if (options?.author?.name) {
      env.GIT_AUTHOR_NAME = options.author.name
    }
    if (options?.author?.email) {
      env.GIT_AUTHOR_EMAIL = options.author.email
    }
    
    // Set committer name and email if provided
    if (options?.committer?.name) {
      env.GIT_COMMITTER_NAME = options.committer.name
    }
    if (options?.committer?.email) {
      env.GIT_COMMITTER_EMAIL = options.committer.email
    }
    
    // Set author date if provided
    if (options?.author?.timestamp !== undefined) {
      const timezoneOffset = options.author.timezoneOffset ?? 0
      // Convert minutes to HHMM format (e.g., +240 minutes = +0400, -240 minutes = -0400)
      const hours = Math.floor(Math.abs(timezoneOffset) / 60)
      const minutes = Math.abs(timezoneOffset) % 60
      const offsetStr = timezoneOffset >= 0 
        ? `+${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}` 
        : `-${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`
      env.GIT_AUTHOR_DATE = `${Math.floor(options.author.timestamp)} ${offsetStr}`
    }
    
    // Set committer date if provided
    if (options?.committer?.timestamp !== undefined) {
      const timezoneOffset = options.committer.timezoneOffset ?? 0
      // Convert minutes to HHMM format (e.g., +240 minutes = +0400, -240 minutes = -0400)
      const hours = Math.floor(Math.abs(timezoneOffset) / 60)
      const minutes = Math.abs(timezoneOffset) % 60
      const offsetStr = timezoneOffset >= 0 
        ? `+${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}` 
        : `-${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`
      env.GIT_COMMITTER_DATE = `${Math.floor(options.committer.timestamp)} ${offsetStr}`
    }
    
    this.execGit(`commit -m "${message}"`, { cwd: workdir, env })
    
    // Return the commit OID
    return this.execGit('rev-parse HEAD', { cwd: workdir })
  }
}

