import type { GitBackend } from '../git/backends/GitBackend.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'
import { Worktree } from '../core-utils/Worktree.ts'
import { GitIndex } from '../git/index/GitIndex.ts'
import { createFileSystem } from '../git/backends/GitBackendFs/utils/createFileSystem.ts'
import type { ObjectFormat } from '../git/backends/GitBackendFs/utils/detectObjectFormat.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'
import type { Transport, TransportOptions } from '../transport/index.ts'
import { WorkerPool } from '../workers/WorkerPool.ts'
import type { ProxiedRepository } from '../workers/Proxies.ts'

import { getGitdir } from './gitdir.ts'
import { getConfig } from './config.ts'
import { getWorktreeSync, getWorktree } from './worktree.ts'
import { getRemote, listRemotes, invalidateRemoteCache, fetch, push, pull } from './remote.ts'
import { checkout, branch, currentBranch, listBranches, resolveRef, expandRef, readSymbolicRef, writeRef } from './refs.ts'
import { isBare, getObjectFormat, getHead } from './state.ts'
import { init } from './init.ts'
import { add, commit, status, statusMatrix, remove, reset } from './commands.ts'
import { enableWorkers, getWorkerPool, getTransport, broadcastToWorkers, hasWorkers, getProxiedRepository, cleanupWorkers } from './workers.ts'
import { getSubmodule, listSubmodules, invalidateSubmoduleCache } from './submodules.ts'
import { detectConfigPaths, analyzeCheckout } from './utils.ts'

/**
 * Repository - Thin wrapper around GitBackend and multiple WorktreeBackend instances
 */
export class Repository {
  // CRITICAL: Two-level static cache for Repository instances
  private static _instanceCache: Map<FileSystemProvider, Map<string, Repository>> = new Map()

  /**
   * Gets the internal filesystem provider (legacy property)
   * Exposed as public property for backward compatibility with legacy commands
   * and tests that expect repo.fs.
   */
  get fs(): FileSystemProvider {
    throw new Error('fs is not available in the new Repository API')
    // If no FS available (bare repo with non-FS backend), this might be undefined
    return undefined as unknown as FileSystemProvider
  }

  // Internal properties (private in original class, but we need to access them in extracted functions)
  // Making them public or internal for now, in a real migration we might use a symbol or friend access pattern
  // These are the actual storage fields - accessed directly by extracted functions
  private __fs: FileSystemProvider | null = null
  private __dir: string | null = null
  private __gitdir: string | null = null
  
  // Getters that throw to prevent external access
  get _fs(): FileSystemProvider | null {
    throw new Error('fs is not available in the new Repository API')
  }
  get _dir(): string | null {
    throw new Error('dir is not available in the new Repository API')
  }
  get _gitdir(): string | null {
    throw new Error('gitdir is not available in the new Repository API')
  }
  public readonly cache: Record<string, unknown>
  _systemConfigPath?: string
  _globalConfigPath?: string

  _gitBackend: GitBackend
  _worktreeBackend: GitWorktreeBackend | null = null
  _worktrees: Map<string, Worktree> = new Map()
  _remoteBackends: Map<string, import('../git/remote/GitRemoteBackend.ts').GitRemoteBackend> = new Map()
  _submoduleRepos: Map<string, Repository> = new Map()
  
  _autoDetectConfig: boolean

  _objectReader: any | null = null
  _objectWriter: any | null = null
  _isBare: boolean | null = null
  _worktree: Worktree | null = null
  _objectFormat: ObjectFormat | null = null
  
  _index: GitIndex | null = null
  _indexMtime: number | null = null
  
  public readonly instanceId = Math.random()
  
  _workerPool?: WorkerPool
  _transport?: Transport
  _proxiedRepository?: ProxiedRepository

  constructor(options: {
    gitBackend: GitBackend
    worktreeBackend?: GitWorktreeBackend
    cache?: Record<string, unknown>
    systemConfigPath?: string
    globalConfigPath?: string
    autoDetectConfig?: boolean
  }) {
    const {
      gitBackend,
      worktreeBackend,
      cache = {},
      systemConfigPath,
      globalConfigPath,
      autoDetectConfig = true,
    } = options

  
    this.cache = cache
    this._systemConfigPath = systemConfigPath
    this._globalConfigPath = globalConfigPath
    this._gitBackend = gitBackend
    this._worktreeBackend = worktreeBackend || null
    
    if (worktreeBackend && 'setRepository' in worktreeBackend) {
      (worktreeBackend as any).setRepository(this)
    }
    
    if (worktreeBackend) {
      this._gitBackend.isInitialized().then(async (initialized) => {
        if (initialized) {
          await this._gitBackend.setConfig('core.bare', 'false', 'local')
          await this._gitBackend.setConfig('core.logallrefupdates', 'true', 'local')
        }
      }).catch(() => {})
    }
    
    this._autoDetectConfig = autoDetectConfig
  }

  // Bind extracted methods
  getGitdir = getGitdir.bind(this)
  get gitdir(): Promise<string> { return this.getGitdir() }
  
  // dir property getter
  get dir(): string | null {
    const repo = this as any
    return repo.__dir || (repo._worktreeBackend?.getDirectory?.() || null)
  }
  
  getConfig = getConfig.bind(this)
  
  getWorktreeSync = getWorktreeSync.bind(this)
  getWorktree = getWorktree.bind(this)
  get worktree(): Worktree | null { return this.getWorktreeSync() }
  get worktreeBackend(): GitWorktreeBackend | null { return this._worktreeBackend }
  get gitBackend(): GitBackend { return this._gitBackend }

  // Remote methods
  getRemote = getRemote.bind(this)
  listRemotes = listRemotes.bind(this)
  invalidateRemoteCache = invalidateRemoteCache.bind(this)
  fetch = fetch.bind(this)
  push = push.bind(this)
  pull = pull.bind(this)

  // Ref methods
  checkout = checkout.bind(this)
  branch = branch.bind(this)
  currentBranch = currentBranch.bind(this)
  listBranches = listBranches.bind(this)
  resolveRef = resolveRef.bind(this)
  expandRef = expandRef.bind(this)
  readSymbolicRef = readSymbolicRef.bind(this)
  writeRef = writeRef.bind(this)

  /**
   * Reads the index (staging area) bypassing cache (wraps backend.readIndex)
   */
  async readIndexDirect(returnBuffer: boolean = false): Promise<GitIndex | import('../git/backends/GitBackendFs/utils/UniversalBuffer.ts').UniversalBuffer> {
    const buffer = await this._gitBackend.readIndex()
    if (returnBuffer) {
      return buffer
    }
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../git/backends/GitBackendFs/utils/detectObjectFormat.ts')
    
    // If buffer is empty, return empty index
    if (buffer.length === 0) {
      const objectFormat = await detectObjectFormat(this._gitBackend)
      return new GitIndex(null, undefined, 2)
    }
    
    const objectFormat = await detectObjectFormat(this._gitBackend)
    return GitIndex.fromBuffer(buffer, objectFormat)
  }

  /**
   * Writes the index (staging area) bypassing cache (wraps backend.writeIndex)
   */
  async writeIndexDirect(data: GitIndex | import('../git/backends/GitBackendFs/utils/UniversalBuffer.ts').UniversalBuffer): Promise<void> {
    let buffer: import('../git/backends/GitBackendFs/utils/UniversalBuffer.ts').UniversalBuffer
    
    if (data instanceof GitIndex) {
      const { detectObjectFormat } = await import('../git/backends/GitBackendFs/utils/detectObjectFormat.ts')
      const objectFormat = await detectObjectFormat(this._gitBackend)
      buffer = await data.toBuffer(objectFormat)
    } else {
      buffer = data
    }
    
    return this._gitBackend.writeIndex(buffer)
  }

  // State methods
  isBare = isBare.bind(this)
  getObjectFormat = getObjectFormat.bind(this)
  getHead = getHead.bind(this)

  // Init
  init = init.bind(this)

  // Core Commands
  add = add.bind(this)
  commit = commit.bind(this)
  status = status.bind(this)
  statusMatrix = statusMatrix.bind(this)
  remove = remove.bind(this)
  reset = reset.bind(this)

  // Workers
  enableWorkers = enableWorkers.bind(this)
  getWorkerPool = getWorkerPool.bind(this)
  getTransport = getTransport.bind(this)
  broadcastToWorkers = broadcastToWorkers.bind(this)
  hasWorkers = hasWorkers.bind(this)
  getProxiedRepository = getProxiedRepository.bind(this)
  cleanupWorkers = cleanupWorkers.bind(this)

  // Submodules
  getSubmodule = getSubmodule.bind(this)
  listSubmodules = listSubmodules.bind(this)
  invalidateSubmoduleCache = invalidateSubmoduleCache.bind(this)

  // Utils
  analyzeCheckout = analyzeCheckout.bind(this)
  static detectConfigPaths = detectConfigPaths

  /**
   * Gets the object reader (cached)
   * Returns the gitBackend itself as the reader
   */
  async getObjectReader(): Promise<GitBackend> {
    if (!this._objectReader) {
      this._objectReader = this._gitBackend
    }
    return this._objectReader
  }

  /**
   * Gets the object writer (cached)
   * Returns the gitBackend itself as the writer
   */
  async getObjectWriter(): Promise<GitBackend> {
    if (!this._objectWriter) {
      this._objectWriter = this._gitBackend
    }
    return this._objectWriter
  }

  /**
   * Open a repository (backward compatibility shim)
   * This delegates to createRepository utility.
   * NOTE: This static method cannot use the same caching strategy as direct constructor usage
   * because it relies on FS path discovery.
   */
  static async open(args: {
    fs: FileSystemProvider
    dir?: string
    gitdir?: string
    cache?: Record<string, unknown>
    crossFs?: boolean
  }): Promise<Repository> {
    const { createRepository } = await import('../core-utils/createRepository.ts')
    return createRepository(args)
  }

  hasFileSystem(): boolean {
    return this.fs !== null
  }

  static clearInstanceCache(): void {
    Repository._instanceCache.clear()
  }
}

