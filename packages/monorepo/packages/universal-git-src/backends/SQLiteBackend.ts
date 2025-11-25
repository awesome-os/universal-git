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
      `SQLiteBackend.readRef() has been removed. ` +
      `Use src/git/refs/readRef.ts instead. ` +
      `This ensures reflog, locking, and validation work correctly.`
    )
  }

  async writeRef(ref: string, value: string): Promise<void> {
    throw new Error(
      `SQLiteBackend.writeRef() has been removed. ` +
      `Use src/git/refs/writeRef.ts instead. ` +
      `This ensures reflog entries are created and locking works correctly.`
    )
  }

  async deleteRef(ref: string): Promise<void> {
    throw new Error(
      `SQLiteBackend.deleteRef() has been removed. ` +
      `Use src/git/refs/deleteRef.ts instead. ` +
      `This ensures proper cleanup and state tracking.`
    )
  }

  async listRefs(prefix: string): Promise<string[]> {
    throw new Error(
      `SQLiteBackend.listRefs() has been removed. ` +
      `Use src/git/refs/listRefs.ts instead. ` +
      `This ensures consistent ref listing across all storage backends.`
    )
  }

  async hasRef(ref: string): Promise<boolean> {
    throw new Error(
      `SQLiteBackend.hasRef() has been removed. ` +
      `Use src/git/refs/readRef.ts and check for null instead. ` +
      `This ensures consistent ref existence checking.`
    )
  }

  async readPackedRefs(): Promise<string | null> {
    throw new Error(
      `SQLiteBackend.readPackedRefs() has been removed. ` +
      `Use src/git/refs/readRef.ts which handles packed-refs automatically. ` +
      `This ensures consistent ref reading across all storage backends.`
    )
  }

  async writePackedRefs(data: string): Promise<void> {
    throw new Error(
      `SQLiteBackend.writePackedRefs() has been removed. ` +
      `Use src/git/refs/writeRef.ts which handles packed-refs automatically. ` +
      `This ensures consistent ref writing across all storage backends.`
    )
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

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

