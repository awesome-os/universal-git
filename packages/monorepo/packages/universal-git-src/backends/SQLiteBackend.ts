import type { GitBackend } from './GitBackend.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'

/**
 * SQLiteBackend - SQLite-based implementation of GitBackend
 * 
 * This backend stores all Git data in a SQLite database, providing
 * a single-file repository format that's easy to backup and transfer.
 */
export class SQLiteBackend implements GitBackend {
  private readonly dbPath: string
  private readonly sqliteModule?: any // Optional SQLite module (better-sqlite3, sql.js, etc.)
  private db: any // SQLite database instance
  private initialized: boolean = false

  constructor(
    dbPath: string,
    sqliteModule?: any // Optional SQLite module (better-sqlite3, sql.js, etc.)
  ) {
    this.dbPath = dbPath
    this.sqliteModule = sqliteModule
  }

  getType(): string {
    return 'sqlite'
  }

  /**
   * Gets or initializes the SQLite database connection
   */
  private async _getDB(): Promise<any> {
    if (this.db) {
      return this.db
    }

    // Try to use provided SQLite module, or default to better-sqlite3
    if (this.sqliteModule) {
      const Database = this.sqliteModule.Database || this.sqliteModule
      this.db = new Database(this.dbPath)
    } else {
      // Try to dynamically import better-sqlite3
      try {
        const { importBetterSqlite3 } = await import('../type-wrappers/better-sqlite3.ts')
        const betterSqlite3 = await importBetterSqlite3()
        const Database = betterSqlite3.default || betterSqlite3.Database
        this.db = new Database(this.dbPath)
      } catch {
        throw new Error(
          'SQLite module not provided and better-sqlite3 not available. ' +
          'Please provide a SQLite module or install better-sqlite3.'
        )
      }
    }

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    // Initialize schema if needed
    if (!this.initialized) {
      await this._initializeSchema()
      this.initialized = true
    }

    return this.db
  }

  /**
   * Initializes the database schema
   */
  private async _initializeSchema(): Promise<void> {
    const db = await this._getDB()

    // Core metadata table
    db.exec(`
      CREATE TABLE IF NOT EXISTS core_metadata (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL
      )
    `)

    // Loose objects table
    db.exec(`
      CREATE TABLE IF NOT EXISTS loose_objects (
        oid TEXT PRIMARY KEY,
        data BLOB NOT NULL
      )
    `)

    // Packfiles table
    db.exec(`
      CREATE TABLE IF NOT EXISTS packfiles (
        name TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('pack', 'idx', 'bitmap'))
      )
    `)

    // ODB info files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS odb_info (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `)

    // References table
    db.exec(`
      CREATE TABLE IF NOT EXISTS refs (
        ref TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Packed refs (stored as single entry)
    db.exec(`
      CREATE TABLE IF NOT EXISTS packed_refs (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        data TEXT
      )
    `)

    // Reflogs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS reflogs (
        ref TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (ref)
      )
    `)

    // Info files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS info_files (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `)

    // Hooks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS hooks (
        name TEXT PRIMARY KEY,
        data BLOB NOT NULL
      )
    `)

    // State files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS state_files (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Sequencer files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sequencer_files (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `)

    // Submodules table
    db.exec(`
      CREATE TABLE IF NOT EXISTS submodules (
        path TEXT PRIMARY KEY,
        config TEXT NOT NULL
      )
    `)

    // Worktrees table
    db.exec(`
      CREATE TABLE IF NOT EXISTS worktrees (
        name TEXT PRIMARY KEY,
        config TEXT NOT NULL
      )
    `)

    // LFS files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS lfs_files (
        path TEXT PRIMARY KEY,
        data BLOB NOT NULL
      )
    `)

    // Shallow file (single entry)
    db.exec(`
      CREATE TABLE IF NOT EXISTS shallow (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        data TEXT
      )
    `)

    // Git daemon export ok (boolean flag)
    db.exec(`
      CREATE TABLE IF NOT EXISTS git_daemon_export_ok (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        enabled INTEGER DEFAULT 0
      )
    `)

    // Create indexes for performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_refs_prefix ON refs(ref);
      CREATE INDEX IF NOT EXISTS idx_reflogs_ref ON reflogs(ref);
    `)
  }

  // ============================================================================
  // Core Metadata & Current State
  // ============================================================================

  async readHEAD(): Promise<string> {
    const db = await this._getDB()
    const row = db.prepare('SELECT value FROM core_metadata WHERE key = ?').get('HEAD')
    if (row) {
      return UniversalBuffer.from(row.value as Uint8Array).toString('utf8').trim()
    }
    return 'ref: refs/heads/master'
  }

  async writeHEAD(value: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO core_metadata (key, value) VALUES (?, ?)').run(
      'HEAD',
      UniversalBuffer.from(value + '\n', 'utf8')
    )
  }

  async readConfig(): Promise<UniversalBuffer> {
    const db = await this._getDB()
    const row = db.prepare('SELECT value FROM core_metadata WHERE key = ?').get('config')
    if (row) {
      return UniversalBuffer.from(row.value as Uint8Array)
    }
    return UniversalBuffer.alloc(0)
  }

  async writeConfig(data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO core_metadata (key, value) VALUES (?, ?)').run(
      'config',
      data
    )
  }

  async hasConfig(): Promise<boolean> {
    const db = await this._getDB()
    const row = db.prepare('SELECT key FROM core_metadata WHERE key = ?').get('config')
    return !!row
  }

  async readIndex(): Promise<UniversalBuffer> {
    const db = await this._getDB()
    const row = db.prepare('SELECT value FROM core_metadata WHERE key = ?').get('index')
    if (row) {
      return UniversalBuffer.from(row.value as Uint8Array)
    }
    return UniversalBuffer.alloc(0)
  }

  async writeIndex(data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO core_metadata (key, value) VALUES (?, ?)').run(
      'index',
      data
    )
  }

  async hasIndex(): Promise<boolean> {
    const db = await this._getDB()
    const row = db.prepare('SELECT key FROM core_metadata WHERE key = ?').get('index')
    return !!row
  }

  async readDescription(): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT value FROM core_metadata WHERE key = ?').get('description')
    if (row) {
      return UniversalBuffer.from(row.value as Uint8Array).toString('utf8')
    }
    return null
  }

  async writeDescription(description: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO core_metadata (key, value) VALUES (?, ?)').run(
      'description',
      UniversalBuffer.from(description, 'utf8')
    )
  }

  async readStateFile(name: string): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT value FROM state_files WHERE name = ?').get(name)
    return row ? (row.value as string).trim() : null
  }

  async writeStateFile(name: string, value: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO state_files (name, value) VALUES (?, ?)').run(
      name,
      value + '\n'
    )
  }

  async deleteStateFile(name: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM state_files WHERE name = ?').run(name)
  }

  async listStateFiles(): Promise<string[]> {
    const db = await this._getDB()
    const rows = db.prepare('SELECT name FROM state_files').all()
    return rows.map((row: { name: string }) => row.name)
  }

  // ============================================================================
  // Sequencer Operations
  // ============================================================================

  async readSequencerFile(name: string): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM sequencer_files WHERE name = ?').get(name)
    return row ? (row.data as string) : null
  }

  async writeSequencerFile(name: string, data: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO sequencer_files (name, data) VALUES (?, ?)').run(
      name,
      data
    )
  }

  async deleteSequencerFile(name: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM sequencer_files WHERE name = ?').run(name)
  }

  async listSequencerFiles(): Promise<string[]> {
    const db = await this._getDB()
    const rows = db.prepare('SELECT name FROM sequencer_files').all()
    return rows.map((row: { name: string }) => row.name)
  }

  // ============================================================================
  // Object Database (ODB)
  // ============================================================================

  async readLooseObject(oid: string): Promise<UniversalBuffer | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM loose_objects WHERE oid = ?').get(oid)
    return row ? UniversalBuffer.from(row.data as Uint8Array) : null
  }

  async writeLooseObject(oid: string, data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    // Don't overwrite existing objects
    const existing = db.prepare('SELECT oid FROM loose_objects WHERE oid = ?').get(oid)
    if (!existing) {
      db.prepare('INSERT INTO loose_objects (oid, data) VALUES (?, ?)').run(oid, data)
    }
  }

  async hasLooseObject(oid: string): Promise<boolean> {
    const db = await this._getDB()
    const row = db.prepare('SELECT oid FROM loose_objects WHERE oid = ?').get(oid)
    return !!row
  }

  async listLooseObjects(): Promise<string[]> {
    const db = await this._getDB()
    const rows = db.prepare('SELECT oid FROM loose_objects').all()
    return rows.map((row: { oid: string }) => row.oid)
  }

  async readPackfile(name: string): Promise<UniversalBuffer | null> {
    const db = await this._getDB()
    const row = db
      .prepare('SELECT data FROM packfiles WHERE name = ? AND type = ?')
      .get(name, 'pack')
    return row ? UniversalBuffer.from(row.data as Uint8Array) : null
  }

  async writePackfile(name: string, data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO packfiles (name, data, type) VALUES (?, ?, ?)').run(
      name,
      data,
      'pack'
    )
  }

  async listPackfiles(): Promise<string[]> {
    const db = await this._getDB()
    const rows = db.prepare("SELECT name FROM packfiles WHERE type = 'pack'").all()
    return rows.map((row: { name: string }) => row.name)
  }

  async readPackIndex(name: string): Promise<UniversalBuffer | null> {
    const db = await this._getDB()
    const row = db
      .prepare('SELECT data FROM packfiles WHERE name = ? AND type = ?')
      .get(name, 'idx')
    return row ? UniversalBuffer.from(row.data as Uint8Array) : null
  }

  async writePackIndex(name: string, data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO packfiles (name, data, type) VALUES (?, ?, ?)').run(
      name,
      data,
      'idx'
    )
  }

  async readPackBitmap(name: string): Promise<UniversalBuffer | null> {
    const db = await this._getDB()
    const row = db
      .prepare('SELECT data FROM packfiles WHERE name = ? AND type = ?')
      .get(name, 'bitmap')
    return row ? UniversalBuffer.from(row.data as Uint8Array) : null
  }

  async writePackBitmap(name: string, data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO packfiles (name, data, type) VALUES (?, ?, ?)').run(
      name,
      data,
      'bitmap'
    )
  }

  async readODBInfoFile(name: string): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM odb_info WHERE name = ?').get(name)
    return row ? (row.data as string) : null
  }

  async writeODBInfoFile(name: string, data: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO odb_info (name, data) VALUES (?, ?)').run(name, data)
  }

  async deleteODBInfoFile(name: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM odb_info WHERE name = ?').run(name)
  }

  async readMultiPackIndex(): Promise<UniversalBuffer | null> {
    const db = await this._getDB()
    const row = db
      .prepare('SELECT data FROM packfiles WHERE name = ? AND type = ?')
      .get('multi-pack-index', 'midx')
    return row ? UniversalBuffer.from(row.data as Uint8Array) : null
  }

  async writeMultiPackIndex(data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO packfiles (name, data, type) VALUES (?, ?, ?)').run(
      'multi-pack-index',
      data,
      'midx'
    )
  }

  async hasMultiPackIndex(): Promise<boolean> {
    const db = await this._getDB()
    const row = db
      .prepare('SELECT name FROM packfiles WHERE name = ? AND type = ?')
      .get('multi-pack-index', 'midx')
    return !!row
  }

  // ============================================================================
  // References
  // ============================================================================

  // ============================================================================
  // High-Level Ref Operations
  // ============================================================================
  // These methods implement high-level ref operations using SQLite storage.
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

    // Check if it's already a valid OID
    const { validateOid } = await import('../utils/detectObjectFormat.ts')
    if (validateOid(ref, 'sha1') || validateOid(ref, 'sha256')) {
      return ref
    }

    // Normalize ref name
    let normalizedRef = ref
    if (!ref.startsWith('refs/')) {
      // Try common ref prefixes
      const db = await this._getDB()
      const prefixes = ['refs/heads/', 'refs/tags/', 'refs/remotes/']
      for (const prefix of prefixes) {
        const candidate = prefix + ref
        const row = db.prepare('SELECT value FROM refs WHERE ref = ?').get(candidate)
        if (row) {
          normalizedRef = candidate
          break
        }
      }
    }

    const db = await this._getDB()

    // Check loose refs first
    const looseRow = db.prepare('SELECT value FROM refs WHERE ref = ?').get(normalizedRef)
    if (looseRow) {
      const value = (looseRow.value as string).trim()
      // Check if it's a symbolic ref
      if (value.startsWith('ref: ')) {
        const targetRef = value.slice('ref: '.length).trim()
        return this.readRef(targetRef, depth - 1, cache)
      }
      return value
    }

    // Check packed refs
    const packedRow = db.prepare('SELECT data FROM packed_refs WHERE id = 1').get()
    if (packedRow && packedRow.data) {
      const packedRefs = packedRow.data as string
      const lines = packedRefs.split('\n')
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
      const headValue = await this.readHEAD()
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
    const { validateOid, detectObjectFormat, getOidLength } = await import('../utils/detectObjectFormat.ts')
    const objectFormat = await detectObjectFormat(null, '', cache)
    if (!validateOid(value.trim(), objectFormat)) {
      throw new Error(`Invalid OID: ${value}`)
    }

    const trimmedValue = value.trim()
    const db = await this._getDB()

    // Get old value for reflog
    const oldRow = db.prepare('SELECT value FROM refs WHERE ref = ?').get(ref)
    const oldValue = oldRow ? (oldRow.value as string).trim() : null

    // Write ref
    db.prepare('INSERT OR REPLACE INTO refs (ref, value) VALUES (?, ?)').run(ref, trimmedValue)

    // Update reflog if not skipped
    if (!skipReflog) {
      const timestamp = Math.floor(Date.now() / 1000)
      const oldOid = oldValue && !oldValue.startsWith('ref: ') ? oldValue : '0'.repeat(getOidLength(objectFormat))
      const newOid = trimmedValue
      const entry = `${oldOid} ${newOid} SQLiteBackend <sqlite@backend> ${timestamp} +0000\tupdate by push\n`
      await this.appendReflog(ref, entry)
    }
  }

  async writeSymbolicRef(ref: string, value: string, oldOid?: string, cache: Record<string, unknown> = {}): Promise<void> {
    const db = await this._getDB()
    // Write symbolic ref
    db.prepare('INSERT OR REPLACE INTO refs (ref, value) VALUES (?, ?)').run(ref, `ref: ${value}`)
    
    // Update HEAD if this is HEAD
    if (ref === 'HEAD') {
      await this.writeHEAD(`ref: ${value}`)
    }
  }

  async readSymbolicRef(ref: string): Promise<string | null> {
    // Check HEAD first
    if (ref === 'HEAD') {
      const headValue = await this.readHEAD()
      if (headValue.startsWith('ref: ')) {
        return headValue.slice('ref: '.length).trim()
      }
      return null
    }

    // Check loose refs
    const db = await this._getDB()
    const row = db.prepare('SELECT value FROM refs WHERE ref = ?').get(ref)
    if (row) {
      const value = (row.value as string).trim()
      if (value.startsWith('ref: ')) {
        return value.slice('ref: '.length).trim()
      }
    }

    return null
  }

  async deleteRef(ref: string, cache: Record<string, unknown> = {}): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM refs WHERE ref = ?').run(ref)
    
    // Also delete reflog
    await this.deleteReflog(ref)
  }

  async listRefs(filepath: string): Promise<string[]> {
    const db = await this._getDB()
    const refs: string[] = []
    
    // List loose refs
    const rows = db.prepare('SELECT ref FROM refs WHERE ref LIKE ?').all(filepath + '%')
    for (const row of rows) {
      const ref = (row.ref as string)
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
    const packedRow = db.prepare('SELECT data FROM packed_refs WHERE id = 1').get()
    if (packedRow && packedRow.data) {
      const packedRefs = packedRow.data as string
      const lines = packedRefs.split('\n')
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
  // These methods implement high-level object operations using SQLite storage.
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
    const db = await this._getDB()
    
    // Try loose objects first
    const looseRow = db.prepare('SELECT data FROM loose_objects WHERE oid = ?').get(oid)
    if (looseRow) {
      // Objects are stored in deflated format
      const { inflate } = await import('../core-utils/Zlib.ts')
      const { GitObject } = await import('../models/GitObject.ts')
      
      const deflated = UniversalBuffer.from(looseRow.data as Uint8Array)
      
      // Inflate (decompress) the object
      const decompressed = await inflate(deflated)
      const unwrapped = GitObject.unwrap(decompressed)
      
      // Determine type from unwrapped object
      const type = unwrapped.type
      let objectData: UniversalBuffer
      
      if (format === 'deflated') {
        objectData = deflated
      } else if (format === 'wrapped') {
        objectData = UniversalBuffer.from(decompressed)
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
      wrapped = UniversalBuffer.from(decompressed)
    }
    
    // Compute OID if not provided
    const computedOid = oid || hashObject(wrapped, objectFormat)
    
    // Deflate the wrapped object
    const deflated = await deflate(wrapped)
    
    if (!dryRun) {
      const db = await this._getDB()
      // Store in loose objects
      db.prepare('INSERT OR REPLACE INTO loose_objects (oid, data) VALUES (?, ?)').run(computedOid, deflated)
    }
    
    return computedOid
  }

  // ============================================================================
  // Reflogs
  // ============================================================================

  async readReflog(ref: string): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM reflogs WHERE ref = ?').get(ref)
    return row ? (row.data as string) : null
  }

  async writeReflog(ref: string, data: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO reflogs (ref, data) VALUES (?, ?)').run(ref, data)
  }

  async appendReflog(ref: string, entry: string): Promise<void> {
    const db = await this._getDB()
    const existing = await this.readReflog(ref)
    const newData = existing ? existing + entry : entry
    await this.writeReflog(ref, newData)
  }

  async deleteReflog(ref: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM reflogs WHERE ref = ?').run(ref)
  }

  async listReflogs(): Promise<string[]> {
    const db = await this._getDB()
    const rows = db.prepare('SELECT ref FROM reflogs').all()
    return rows.map((row: { ref: string }) => row.ref)
  }

  // ============================================================================
  // Info Files
  // ============================================================================

  async readInfoFile(name: string): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM info_files WHERE name = ?').get(name)
    return row ? (row.data as string) : null
  }

  async writeInfoFile(name: string, data: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO info_files (name, data) VALUES (?, ?)').run(name, data)
  }

  async deleteInfoFile(name: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM info_files WHERE name = ?').run(name)
  }

  // ============================================================================
  // Hooks
  // ============================================================================

  async readHook(name: string): Promise<UniversalBuffer | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM hooks WHERE name = ?').get(name)
    return row ? UniversalBuffer.from(row.data as Uint8Array) : null
  }

  async writeHook(name: string, data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO hooks (name, data) VALUES (?, ?)').run(name, data)
  }

  async deleteHook(name: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM hooks WHERE name = ?').run(name)
  }

  async listHooks(): Promise<string[]> {
    const db = await this._getDB()
    const rows = db.prepare('SELECT name FROM hooks').all()
    return rows.map((row: { name: string }) => row.name)
  }

  async hasHook(name: string): Promise<boolean> {
    const db = await this._getDB()
    const row = db.prepare('SELECT name FROM hooks WHERE name = ?').get(name)
    return !!row
  }

  // ============================================================================
  // Advanced Features
  // ============================================================================

  async readSubmoduleConfig(path: string): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT config FROM submodules WHERE path = ?').get(path)
    return row ? (row.config as string) : null
  }

  async writeSubmoduleConfig(path: string, data: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO submodules (path, config) VALUES (?, ?)').run(path, data)
  }

  async readWorktreeConfig(name: string): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT config FROM worktrees WHERE name = ?').get(name)
    return row ? (row.config as string).trim() : null
  }

  async writeWorktreeConfig(name: string, data: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO worktrees (name, config) VALUES (?, ?)').run(name, data)
  }

  async listWorktrees(): Promise<string[]> {
    const db = await this._getDB()
    const rows = db.prepare('SELECT name FROM worktrees').all()
    return rows.map((row: { name: string }) => row.name)
  }

  async readShallow(): Promise<string | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM shallow WHERE id = 1').get()
    return row ? (row.data as string) : null
  }

  async writeShallow(data: string): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO shallow (id, data) VALUES (1, ?)').run(data)
  }

  async deleteShallow(): Promise<void> {
    const db = await this._getDB()
    db.prepare('DELETE FROM shallow WHERE id = 1').run()
  }

  async readLFSFile(path: string): Promise<UniversalBuffer | null> {
    const db = await this._getDB()
    const row = db.prepare('SELECT data FROM lfs_files WHERE path = ?').get(path)
    return row ? UniversalBuffer.from(row.data as Uint8Array) : null
  }

  async writeLFSFile(path: string, data: UniversalBuffer): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO lfs_files (path, data) VALUES (?, ?)').run(path, data)
  }

  async listLFSFiles(prefix?: string): Promise<string[]> {
    const db = await this._getDB()
    let rows
    if (prefix) {
      rows = db.prepare('SELECT path FROM lfs_files WHERE path LIKE ?').all(prefix + '%')
    } else {
      rows = db.prepare('SELECT path FROM lfs_files').all()
    }
    return rows.map((row: { path: string }) => row.path)
  }

  async readGitDaemonExportOk(): Promise<boolean> {
    const db = await this._getDB()
    const row = db.prepare('SELECT enabled FROM git_daemon_export_ok WHERE id = 1').get()
    return row ? (row.enabled as number) === 1 : false
  }

  async writeGitDaemonExportOk(): Promise<void> {
    const db = await this._getDB()
    db.prepare('INSERT OR REPLACE INTO git_daemon_export_ok (id, enabled) VALUES (1, 1)').run()
  }

  async deleteGitDaemonExportOk(): Promise<void> {
    const db = await this._getDB()
    db.prepare('UPDATE git_daemon_export_ok SET enabled = 0 WHERE id = 1').run()
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async initialize(): Promise<void> {
    await this._getDB() // This will initialize the schema
  }

  async isInitialized(): Promise<boolean> {
    try {
      const db = await this._getDB()
      const row = db.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="core_metadata"').get()
      return !!row
    } catch {
      return false
    }
  }

  async existsFile(path: string): Promise<boolean> {
    const db = await this._getDB()
    
    // Check core metadata files (index, config, description)
    if (path === 'index' || path === 'config' || path === 'description') {
      const row = db.prepare('SELECT key FROM core_metadata WHERE key = ?').get(path)
      return !!row
    }
    
    // HEAD always exists (it's initialized)
    if (path === 'HEAD') {
      return true
    }
    
    // Check state files
    const stateFileRow = db.prepare('SELECT name FROM state_files WHERE name = ?').get(path)
    if (stateFileRow) {
      return true
    }
    
    // Check sequencer files
    const sequencerRow = db.prepare('SELECT name FROM sequencer_files WHERE name = ?').get(path)
    if (sequencerRow) {
      return true
    }
    
    // Check info files
    const infoRow = db.prepare('SELECT name FROM info_files WHERE name = ?').get(path)
    if (infoRow) {
      return true
    }
    
    // Check hooks
    const hookRow = db.prepare('SELECT name FROM hooks WHERE name = ?').get(path)
    if (hookRow) {
      return true
    }
    
    // Check shallow file
    if (path === 'shallow') {
      const shallowRow = db.prepare('SELECT value FROM core_metadata WHERE key = ?').get('shallow')
      return !!shallowRow
    }
    
    // Check git-daemon-export-ok
    if (path === 'git-daemon-export-ok') {
      const row = db.prepare('SELECT enabled FROM git_daemon_export_ok WHERE id = 1').get()
      return row ? (row.enabled === 1) : false
    }
    
    // For other files, return false (not found)
    return false
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
    // SQLiteBackend doesn't have a filesystem, so use provided fs or throw
    const fs = options?.fs || null
    if (!fs) {
      throw new Error('SQLiteBackend.getRemoteInfo requires filesystem for remote operations. Provide fs option.')
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
    // SQLiteBackend doesn't have a filesystem, so use provided fs or throw
    const fs = options?.fs || null
    if (!fs) {
      throw new Error('SQLiteBackend.listServerRefs requires filesystem for remote operations. Provide fs option.')
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

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

