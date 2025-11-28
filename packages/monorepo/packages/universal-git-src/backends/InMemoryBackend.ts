/**
 * InMemoryBackend - In-memory implementation of GitBackend
 * 
 * This backend stores all Git data in memory using Maps and Sets.
 * It's fast but non-persistent - useful for testing and temporary operations.
 * 
 * All data is lost when the backend instance is destroyed.
 */

import type { GitBackend } from './GitBackend.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'

/**
 * InMemoryBackend - Stores Git repository data in memory
 */
export class InMemoryBackend implements GitBackend {
  private initialized: boolean = false

  // Core metadata
  private head: string = 'ref: refs/heads/master'
  private config: UniversalBuffer = UniversalBuffer.alloc(0)
  private index: UniversalBuffer = UniversalBuffer.alloc(0)
  private description: string | null = null
  
  // Track which files have been written (for existsFile check)
  private writtenFiles = new Set<string>()

  // State files (FETCH_HEAD, ORIG_HEAD, etc.)
  private stateFiles = new Map<string, string>()

  // Sequencer files
  private sequencerFiles = new Map<string, string>()

  // Object Database
  private looseObjects = new Map<string, UniversalBuffer>()
  private packfiles = new Map<string, UniversalBuffer>() // Key: name, Value: packfile data
  private packIndices = new Map<string, UniversalBuffer>() // Key: name, Value: index data
  private packBitmaps = new Map<string, UniversalBuffer>() // Key: name, Value: bitmap data
  private odbInfoFiles = new Map<string, string>()
  private multiPackIndex: UniversalBuffer | null = null

  // References
  private refs = new Map<string, string>() // Key: ref path, Value: OID or symbolic ref
  private packedRefs: string | null = null

  // Reflogs
  private reflogs = new Map<string, string>() // Key: ref path, Value: reflog content

  // Info files
  private infoFiles = new Map<string, string>()

  // Hooks
  private hooks = new Map<string, UniversalBuffer>()

  // Advanced features
  private submoduleConfigs = new Map<string, string>()
  private worktreeConfigs = new Map<string, string>()
  private worktrees = new Set<string>()
  private shallow: string | null = null
  private lfsFiles = new Map<string, UniversalBuffer>()
  private gitDaemonExportOk: boolean = false

  constructor() {
    // No parameters needed for in-memory backend
  }

  getType(): string {
    return 'in-memory'
  }

  // ============================================================================
  // Core Metadata & Current State
  // ============================================================================

  async readHEAD(): Promise<string> {
    return this.head
  }

  async writeHEAD(value: string): Promise<void> {
    this.head = value
  }

  async readConfig(): Promise<UniversalBuffer> {
    return this.config
  }

  async writeConfig(data: UniversalBuffer): Promise<void> {
    this.config = UniversalBuffer.from(data)
    this.writtenFiles.add('config')
  }

  async hasConfig(): Promise<boolean> {
    return this.writtenFiles.has('config')
  }

  async readIndex(): Promise<UniversalBuffer> {
    return this.index
  }

  async writeIndex(data: UniversalBuffer): Promise<void> {
    this.index = UniversalBuffer.from(data)
    this.writtenFiles.add('index')
  }

  async hasIndex(): Promise<boolean> {
    return this.writtenFiles.has('index')
  }

  async readDescription(): Promise<string | null> {
    return this.description
  }

  async writeDescription(description: string): Promise<void> {
    this.description = description
  }

  async readStateFile(name: string): Promise<string | null> {
    return this.stateFiles.get(name) || null
  }

  async writeStateFile(name: string, value: string): Promise<void> {
    this.stateFiles.set(name, value)
  }

  async deleteStateFile(name: string): Promise<void> {
    this.stateFiles.delete(name)
  }

  async listStateFiles(): Promise<string[]> {
    return Array.from(this.stateFiles.keys())
  }

  // ============================================================================
  // Sequencer Operations
  // ============================================================================

  async readSequencerFile(name: string): Promise<string | null> {
    return this.sequencerFiles.get(name) || null
  }

  async writeSequencerFile(name: string, data: string): Promise<void> {
    this.sequencerFiles.set(name, data)
  }

  async deleteSequencerFile(name: string): Promise<void> {
    this.sequencerFiles.delete(name)
  }

  async listSequencerFiles(): Promise<string[]> {
    return Array.from(this.sequencerFiles.keys())
  }

  // ============================================================================
  // Object Database (ODB)
  // ============================================================================

  async readLooseObject(oid: string): Promise<UniversalBuffer | null> {
    return this.looseObjects.get(oid) || null
  }

  async writeLooseObject(oid: string, data: UniversalBuffer): Promise<void> {
    this.looseObjects.set(oid, UniversalBuffer.from(data))
  }

  async hasLooseObject(oid: string): Promise<boolean> {
    return this.looseObjects.has(oid)
  }

  async listLooseObjects(): Promise<string[]> {
    return Array.from(this.looseObjects.keys())
  }

  async readPackfile(name: string): Promise<UniversalBuffer | null> {
    return this.packfiles.get(name) || null
  }

  async writePackfile(name: string, data: UniversalBuffer): Promise<void> {
    this.packfiles.set(name, UniversalBuffer.from(data))
  }

  async listPackfiles(): Promise<string[]> {
    // Return only .pack files (not .idx or .bitmap)
    return Array.from(this.packfiles.keys()).filter(name => name.endsWith('.pack'))
  }

  async readPackIndex(name: string): Promise<UniversalBuffer | null> {
    return this.packIndices.get(name) || null
  }

  async writePackIndex(name: string, data: UniversalBuffer): Promise<void> {
    this.packIndices.set(name, UniversalBuffer.from(data))
  }

  async readPackBitmap(name: string): Promise<UniversalBuffer | null> {
    return this.packBitmaps.get(name) || null
  }

  async writePackBitmap(name: string, data: UniversalBuffer): Promise<void> {
    this.packBitmaps.set(name, UniversalBuffer.from(data))
  }

  async readODBInfoFile(name: string): Promise<string | null> {
    return this.odbInfoFiles.get(name) || null
  }

  async writeODBInfoFile(name: string, data: string): Promise<void> {
    this.odbInfoFiles.set(name, data)
  }

  async deleteODBInfoFile(name: string): Promise<void> {
    this.odbInfoFiles.delete(name)
  }

  async readMultiPackIndex(): Promise<UniversalBuffer | null> {
    return this.multiPackIndex
  }

  async writeMultiPackIndex(data: UniversalBuffer): Promise<void> {
    this.multiPackIndex = UniversalBuffer.from(data)
  }

  async hasMultiPackIndex(): Promise<boolean> {
    return this.multiPackIndex !== null
  }

  // ============================================================================
  // References
  // ============================================================================

  // ============================================================================
  // High-Level Ref Operations
  // ============================================================================
  // These methods implement high-level ref operations using in-memory storage.
  // They handle symbolic ref resolution, reflog, and validation.

  async readRef(ref: string, depth: number = 5, cache: Record<string, unknown> = {}): Promise<string | null> {
    if (depth <= 0) {
      // Max depth reached - return the ref as-is (might be a symbolic ref)
      if (ref.startsWith('ref: ')) {
        return ref.slice('ref: '.length).trim()
      }
      return ref
    }

    // Check if it's a symbolic ref pointer
    if (ref.startsWith('ref: ')) {
      const targetRef = ref.slice('ref: '.length).trim()
      if (depth === 1) {
        return targetRef
      }
      return this.readRef(targetRef, depth - 1, cache)
    }

    // Check if it's already a valid OID (40 chars for SHA-1, 64 for SHA-256)
    const { validateOid } = await import('../utils/detectObjectFormat.ts')
    if (validateOid(ref, 'sha1') || validateOid(ref, 'sha256')) {
      return ref
    }

    // Normalize ref name
    let normalizedRef = ref
    if (!ref.startsWith('refs/')) {
      // Try common ref prefixes
      const prefixes = ['refs/heads/', 'refs/tags/', 'refs/remotes/']
      for (const prefix of prefixes) {
        const candidate = prefix + ref
        if (this.refs.has(candidate)) {
          normalizedRef = candidate
          break
        }
      }
    }

    // Check loose refs first
    const looseValue = this.refs.get(normalizedRef)
    if (looseValue !== undefined) {
      // Check if it's a symbolic ref
      if (looseValue.startsWith('ref: ')) {
        const targetRef = looseValue.slice('ref: '.length).trim()
        return this.readRef(targetRef, depth - 1, cache)
      }
      return looseValue
    }

    // Check packed refs
    if (this.packedRefs) {
      const lines = this.packedRefs.split('\n')
      for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue
        const [oid, packedRef] = line.split(' ', 2)
        if (packedRef && packedRef.trim() === normalizedRef) {
          return oid.trim()
        }
      }
    }

    // Check HEAD
    if (ref === 'HEAD' || normalizedRef === 'HEAD') {
      const headValue = this.head
      if (headValue.startsWith('ref: ')) {
        const targetRef = headValue.slice('ref: '.length).trim()
        return this.readRef(targetRef, depth - 1, cache)
      }
      return headValue
    }

    return null
  }

  async writeRef(ref: string, value: string, skipReflog: boolean = false, cache: Record<string, unknown> = {}): Promise<void> {
    // Validate OID format
    const { validateOid, detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const objectFormat = await detectObjectFormat(null, '', cache)
    if (!validateOid(value.trim(), objectFormat)) {
      throw new Error(`Invalid OID: ${value}`)
    }

    const trimmedValue = value.trim()
    const oldValue = this.refs.get(ref) || null

    // Write ref
    this.refs.set(ref, trimmedValue)

    // Update reflog if not skipped
    if (!skipReflog) {
      const { getOidLength } = await import('../utils/detectObjectFormat.ts')
      const timestamp = Math.floor(Date.now() / 1000)
      const oldOid = oldValue && !oldValue.startsWith('ref: ') ? oldValue : '0'.repeat(getOidLength(objectFormat))
      const newOid = trimmedValue
      const entry = `${oldOid} ${newOid} InMemoryBackend <inmemory@backend> ${timestamp} +0000\tupdate by push\n`
      await this.appendReflog(ref, entry)
    }
  }

  async writeSymbolicRef(ref: string, value: string, oldOid?: string, cache: Record<string, unknown> = {}): Promise<void> {
    // Write symbolic ref
    this.refs.set(ref, `ref: ${value}`)
    
    // Update HEAD if this is HEAD
    if (ref === 'HEAD') {
      this.head = `ref: ${value}`
    }
  }

  async readSymbolicRef(ref: string): Promise<string | null> {
    // Check HEAD first
    if (ref === 'HEAD') {
      const headValue = this.head
      if (headValue.startsWith('ref: ')) {
        return headValue.slice('ref: '.length).trim()
      }
      return null
    }

    // Check loose refs
    const value = this.refs.get(ref)
    if (value && value.startsWith('ref: ')) {
      return value.slice('ref: '.length).trim()
    }

    return null
  }

  async deleteRef(ref: string, cache: Record<string, unknown> = {}): Promise<void> {
    this.refs.delete(ref)
    
    // Also delete reflog
    this.reflogs.delete(ref)
  }

  async listRefs(filepath: string): Promise<string[]> {
    const refs: string[] = []
    
    // List loose refs
    for (const ref of this.refs.keys()) {
      if (ref.startsWith(filepath)) {
        // Remove the prefix
        const suffix = ref.substring(filepath.length)
        if (suffix && !suffix.startsWith('/')) {
          refs.push(suffix)
        } else if (suffix.startsWith('/')) {
          refs.push(suffix.substring(1))
        }
      }
    }

    // List packed refs
    if (this.packedRefs) {
      const lines = this.packedRefs.split('\n')
      for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue
        const [, packedRef] = line.split(' ', 2)
        if (packedRef && packedRef.trim().startsWith(filepath)) {
          const suffix = packedRef.trim().substring(filepath.length)
          if (suffix && !suffix.startsWith('/') && !refs.includes(suffix)) {
            refs.push(suffix)
          } else if (suffix.startsWith('/')) {
            const cleanSuffix = suffix.substring(1)
            if (!refs.includes(cleanSuffix)) {
              refs.push(cleanSuffix)
            }
          }
        }
      }
    }

    return refs.sort()
  }

  // ============================================================================
  // High-Level Object Operations
  // ============================================================================
  // These methods implement high-level object operations using in-memory storage.
  // They handle both loose and packed objects.

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
    // Try loose objects first
    const looseObject = this.looseObjects.get(oid)
    if (looseObject) {
      // Objects are stored in deflated format
      const { inflate } = await import('../core-utils/Zlib.ts')
      const { GitObject } = await import('../models/GitObject.ts')
      
      // Inflate (decompress) the object
      const decompressed = await inflate(looseObject)
      const unwrapped = GitObject.unwrap(decompressed)
      
      // Determine type from unwrapped object
      const type = unwrapped.type
      let objectData: UniversalBuffer
      
      if (format === 'deflated') {
        objectData = looseObject
      } else if (format === 'wrapped') {
        objectData = decompressed
      } else {
        objectData = unwrapped.object
      }
      
      return {
        type,
        object: objectData,
        format,
        source: 'loose',
        oid,
      }
    }

    // TODO: Check packfiles (requires packfile parsing)
    // For now, throw error if not found in loose objects
    const { NotFoundError } = await import('../errors/NotFoundError.ts')
    throw new NotFoundError(`Object ${oid} not found`)
  }

  async writeObject(
    type: string,
    object: UniversalBuffer | Uint8Array,
    format: 'wrapped' | 'deflated' | 'content' = 'content',
    oid?: string,
    dryRun: boolean = false,
    cache: Record<string, unknown> = {}
  ): Promise<string> {
    const { GitObject } = await import('../models/GitObject.ts')
    const { hashObject } = await import('../core-utils/ShaHasher.ts')
    const { deflate } = await import('../core-utils/Zlib.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const objectFormat = await detectObjectFormat(null, '', cache)
    
    const objectBuffer = UniversalBuffer.from(object)
    
    // Convert to wrapped format if needed
    let wrapped: UniversalBuffer
    if (format === 'content') {
      wrapped = UniversalBuffer.from(GitObject.wrap({ type, object: objectBuffer }))
    } else if (format === 'wrapped') {
      wrapped = objectBuffer
    } else {
      // deflated format - need to inflate to get wrapped, then recompress
      const { inflate } = await import('../core-utils/Zlib.ts')
      const decompressed = await inflate(objectBuffer)
      wrapped = decompressed
    }
    
    // Compute OID if not provided
    const computedOid = oid || hashObject(wrapped, objectFormat)
    
    // Deflate the wrapped object
    const deflated = await deflate(wrapped)
    
    if (!dryRun) {
      // Store in loose objects
      this.looseObjects.set(computedOid, deflated)
    }
    
    return computedOid
  }

  // ============================================================================
  // Reflogs
  // ============================================================================

  async readReflog(ref: string): Promise<string | null> {
    return this.reflogs.get(ref) || null
  }

  async writeReflog(ref: string, data: string): Promise<void> {
    this.reflogs.set(ref, data)
  }

  async appendReflog(ref: string, entry: string): Promise<void> {
    const existing = this.reflogs.get(ref) || ''
    const newContent = existing ? `${existing}\n${entry}` : entry
    this.reflogs.set(ref, newContent)
  }

  async deleteReflog(ref: string): Promise<void> {
    this.reflogs.delete(ref)
  }

  async listReflogs(): Promise<string[]> {
    return Array.from(this.reflogs.keys())
  }

  // ============================================================================
  // Info Files
  // ============================================================================

  async readInfoFile(name: string): Promise<string | null> {
    return this.infoFiles.get(name) || null
  }

  async writeInfoFile(name: string, data: string): Promise<void> {
    this.infoFiles.set(name, data)
  }

  async deleteInfoFile(name: string): Promise<void> {
    this.infoFiles.delete(name)
  }

  // ============================================================================
  // Hooks
  // ============================================================================

  async readHook(name: string): Promise<UniversalBuffer | null> {
    return this.hooks.get(name) || null
  }

  async writeHook(name: string, data: UniversalBuffer): Promise<void> {
    this.hooks.set(name, UniversalBuffer.from(data))
  }

  async deleteHook(name: string): Promise<void> {
    this.hooks.delete(name)
  }

  async listHooks(): Promise<string[]> {
    return Array.from(this.hooks.keys())
  }

  async hasHook(name: string): Promise<boolean> {
    return this.hooks.has(name)
  }

  // ============================================================================
  // Advanced Features
  // ============================================================================

  async readSubmoduleConfig(path: string): Promise<string | null> {
    return this.submoduleConfigs.get(path) || null
  }

  async writeSubmoduleConfig(path: string, data: string): Promise<void> {
    this.submoduleConfigs.set(path, data)
  }

  async readWorktreeConfig(name: string): Promise<string | null> {
    return this.worktreeConfigs.get(name) || null
  }

  async writeWorktreeConfig(name: string, data: string): Promise<void> {
    this.worktreeConfigs.set(name, data)
  }

  async listWorktrees(): Promise<string[]> {
    return Array.from(this.worktrees)
  }

  async readShallow(): Promise<string | null> {
    return this.shallow
  }

  async writeShallow(data: string): Promise<void> {
    this.shallow = data
  }

  async deleteShallow(): Promise<void> {
    this.shallow = null
  }

  async readLFSFile(path: string): Promise<UniversalBuffer | null> {
    return this.lfsFiles.get(path) || null
  }

  async writeLFSFile(path: string, data: UniversalBuffer): Promise<void> {
    this.lfsFiles.set(path, UniversalBuffer.from(data))
  }

  async listLFSFiles(prefix?: string): Promise<string[]> {
    const files = Array.from(this.lfsFiles.keys())
    if (prefix) {
      return files.filter(path => path.startsWith(prefix))
    }
    return files
  }

  async readGitDaemonExportOk(): Promise<boolean> {
    return this.gitDaemonExportOk
  }

  async writeGitDaemonExportOk(): Promise<void> {
    this.gitDaemonExportOk = true
  }

  async deleteGitDaemonExportOk(): Promise<void> {
    this.gitDaemonExportOk = false
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async initialize(): Promise<void> {
    // For in-memory backend, initialization is just setting the flag
    // All data structures are already initialized in the constructor
    this.initialized = true
  }

  async isInitialized(): Promise<boolean> {
    return this.initialized
  }

  async existsFile(path: string): Promise<boolean> {
    // Check core metadata files
    if (path === 'index') {
      return this.writtenFiles.has('index')
    }
    if (path === 'config') {
      return this.writtenFiles.has('config')
    }
    if (path === 'HEAD') {
      return true // HEAD always exists (initialized)
    }
    if (path === 'description') {
      return this.description !== null
    }
    
    // Check state files
    if (this.stateFiles.has(path)) {
      return true
    }
    
    // Check sequencer files
    if (this.sequencerFiles.has(path)) {
      return true
    }
    
    // Check info files
    if (this.infoFiles.has(path)) {
      return true
    }
    
    // Check hooks
    if (this.hooks.has(path)) {
      return true
    }
    
    // Check shallow file
    if (path === 'shallow' && this.shallow !== null) {
      return true
    }
    
    // Check git-daemon-export-ok
    if (path === 'git-daemon-export-ok') {
      return this.gitDaemonExportOk
    }
    
    // For other files, check if they're in writtenFiles
    return this.writtenFiles.has(path)
  }

  async close(): Promise<void> {
    // For in-memory backend, closing means clearing all data
    // This allows the backend to be reused or garbage collected
    this.head = 'ref: refs/heads/master'
    this.config = UniversalBuffer.alloc(0)
    this.index = UniversalBuffer.alloc(0)
    this.description = null
    this.stateFiles.clear()
    this.sequencerFiles.clear()
    this.looseObjects.clear()
    this.packfiles.clear()
    this.packIndices.clear()
    this.packBitmaps.clear()
    this.odbInfoFiles.clear()
    this.multiPackIndex = null
    this.refs.clear()
    this.packedRefs = null
    this.reflogs.clear()
    this.infoFiles.clear()
    this.hooks.clear()
    this.submoduleConfigs.clear()
    this.worktreeConfigs.clear()
    this.worktrees.clear()
    this.shallow = null
    this.lfsFiles.clear()
    this.gitDaemonExportOk = false
    this.writtenFiles.clear()
    this.initialized = false
  }

  async readPackedRefs(): Promise<string | null> {
    return this.packedRefs
  }

  async writePackedRefs(data: string): Promise<void> {
    this.packedRefs = data
  }

  async expandRef(ref: string, cache: Record<string, unknown> = {}): Promise<string> {
    const { NotFoundError } = await import('../errors/NotFoundError.ts')
    const { parsePackedRefs } = await import('../git/refs/packedRefs.ts')
    
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
    for (const refPath of refpaths) {
      // Check if ref exists using backend method
      const refValue = await this.readRef(refPath, 5, cache)
      if (refValue) {
        return refPath
      }
      // Also check packed refs
      if (packedMap.has(refPath)) return refPath
    }
    
    // Do we give up?
    throw new NotFoundError(ref)
  }

  /**
   * Clear all data (useful for testing)
   * This is similar to close() but doesn't reset initialization state
   */
  clear(): void {
    this.head = 'ref: refs/heads/master'
    this.config = UniversalBuffer.alloc(0)
    this.index = UniversalBuffer.alloc(0)
    this.description = null
    this.stateFiles.clear()
    this.sequencerFiles.clear()
    this.looseObjects.clear()
    this.packfiles.clear()
    this.packIndices.clear()
    this.packBitmaps.clear()
    this.odbInfoFiles.clear()
    this.multiPackIndex = null
    this.refs.clear()
    this.packedRefs = null
    this.reflogs.clear()
    this.infoFiles.clear()
    this.hooks.clear()
    this.submoduleConfigs.clear()
    this.worktreeConfigs.clear()
    this.worktrees.clear()
    this.shallow = null
    this.lfsFiles.clear()
    this.gitDaemonExportOk = false
    this.writtenFiles.clear()
  }

  /**
   * Get statistics about the backend (useful for testing/debugging)
   */
  getStats(): {
    looseObjects: number
    packfiles: number
    refs: number
    reflogs: number
    hooks: number
    stateFiles: number
    sequencerFiles: number
  } {
    return {
      looseObjects: this.looseObjects.size,
      packfiles: this.packfiles.size,
      refs: this.refs.size,
      reflogs: this.reflogs.size,
      hooks: this.hooks.size,
      stateFiles: this.stateFiles.size,
      sequencerFiles: this.sequencerFiles.size,
    }
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
    // InMemoryBackend doesn't have a filesystem, so use provided fs or throw
    const fs = options?.fs || null
    if (!fs) {
      throw new Error('InMemoryBackend.getRemoteInfo requires filesystem for remote operations. Provide fs option.')
    }
    
    const { RemoteBackendRegistry } = await import('../git/remote/RemoteBackendRegistry.ts')
    const { formatInfoRefs } = await import('../utils/formatInfoRefs.ts')
    
    // Get remote backend from registry
    const backend = RemoteBackendRegistry.getBackend({
      url,
      http: options?.http,
      ssh: options?.ssh,
      tcp: options?.tcp,
      fs,
      useRestApi: false,
    })
    
    // Call backend.discover() with protocol-agnostic options
    const remote = await backend.discover({
      service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      protocolVersion: options?.protocolVersion || 2,
      onProgress: options?.onProgress,
      http: options?.http,
      headers: options?.headers,
      corsProxy: options?.corsProxy,
      onAuth: options?.onAuth,
      onAuthSuccess: options?.onAuthSuccess,
      onAuthFailure: options?.onAuthFailure,
      ssh: options?.ssh,
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
    // InMemoryBackend doesn't have a filesystem, so use provided fs or throw
    const fs = options?.fs || null
    if (!fs) {
      throw new Error('InMemoryBackend.listServerRefs requires filesystem for remote operations. Provide fs option.')
    }
    
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
      fs,
      useRestApi: false,
    })
    
    // Step 1: Discover capabilities and refs (for protocol v1)
    const remote = await backend.discover({
      service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      protocolVersion: options?.protocolVersion || 2,
      onProgress: options?.onProgress,
      http: options?.http,
      headers: options?.headers,
      corsProxy: options?.corsProxy,
      onAuth: options?.onAuth,
      onAuthSuccess: options?.onAuthSuccess,
      onAuthFailure: options?.onAuthFailure,
      ssh: options?.ssh,
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
      http: options?.http,
      headers: options?.headers,
      auth: remote.auth,
      corsProxy: options?.corsProxy,
      ssh: options?.ssh,
      tcp: options?.tcp,
    })
    
    if (!res.body) {
      throw new Error('No response body from server')
    }
    return parseListRefsResponse(res.body)
  }
}

