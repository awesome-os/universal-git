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

  async readIndex(): Promise<UniversalBuffer> {
    return this.index
  }

  async writeIndex(data: UniversalBuffer): Promise<void> {
    this.index = UniversalBuffer.from(data)
    this.writtenFiles.add('index')
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
  // References - REMOVED
  // ============================================================================
  // Ref operations have been removed from the backend interface.
  // All ref operations must go through src/git/refs/ functions to ensure
  // reflog, locking, validation, and state tracking work consistently.
  //
  // Use these functions instead:
  // - src/git/refs/readRef.ts - readRef()
  // - src/git/refs/writeRef.ts - writeRef(), writeSymbolicRef()
  // - src/git/refs/deleteRef.ts - deleteRef()
  // - src/git/refs/listRefs.ts - listRefs()

  async readRef(ref: string): Promise<string | null> {
    throw new Error(
      `InMemoryBackend.readRef() has been removed. ` +
      `Use src/git/refs/readRef.ts instead. ` +
      `This ensures reflog, locking, and validation work correctly.`
    )
  }

  async writeRef(ref: string, value: string): Promise<void> {
    throw new Error(
      `InMemoryBackend.writeRef() has been removed. ` +
      `Use src/git/refs/writeRef.ts instead. ` +
      `This ensures reflog entries are created and locking works correctly.`
    )
  }

  async deleteRef(ref: string): Promise<void> {
    throw new Error(
      `InMemoryBackend.deleteRef() has been removed. ` +
      `Use src/git/refs/deleteRef.ts instead. ` +
      `This ensures proper cleanup and state tracking.`
    )
  }

  async listRefs(prefix: string): Promise<string[]> {
    throw new Error(
      `InMemoryBackend.listRefs() has been removed. ` +
      `Use src/git/refs/listRefs.ts instead. ` +
      `This ensures consistent ref listing across all storage backends.`
    )
  }

  async hasRef(ref: string): Promise<boolean> {
    throw new Error(
      `InMemoryBackend.hasRef() has been removed. ` +
      `Use src/git/refs/readRef.ts and check for null instead. ` +
      `This ensures consistent ref existence checking.`
    )
  }

  async readPackedRefs(): Promise<string | null> {
    throw new Error(
      `InMemoryBackend.readPackedRefs() has been removed. ` +
      `Use src/git/refs/readRef.ts which handles packed-refs automatically. ` +
      `This ensures consistent ref reading across all storage backends.`
    )
  }

  async writePackedRefs(data: string): Promise<void> {
    throw new Error(
      `InMemoryBackend.writePackedRefs() has been removed. ` +
      `Use src/git/refs/writeRef.ts which handles packed-refs automatically. ` +
      `This ensures consistent ref writing across all storage backends.`
    )
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
}

