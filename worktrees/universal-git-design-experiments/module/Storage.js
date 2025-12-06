export class GitStorage {
    async writeObject({ oid, type, content }) {}
    async readObject(oid) {}
    async readObjectStream(oid) {}
    async resolveRef(ref) {}
}
export class WorkdirStorage {
    async writeFile(filepath, content, metadata) {}
    async readFile(filepath) {}
    async stat(filepath) {}
    async chmod(filepath) {}
}


// =================================================================
//  CONSTANTS & SCHEMA
// =================================================================

const CHUNK_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const CHUNK_SIZE = 10 * 1024 * 1024;      // 10 MB chunks

/** A standalone function to initialize the complete database schema. */
function initSchema(db) {
    db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS objects (
            oid TEXT PRIMARY KEY, type TEXT NOT NULL, content BLOB,
            is_chunked INTEGER DEFAULT 0, total_size INTEGER
        );
        CREATE TABLE IF NOT EXISTS object_chunks (
            oid TEXT, sequence INTEGER, data BLOB NOT NULL,
            PRIMARY KEY (oid, sequence),
            FOREIGN KEY (oid) REFERENCES objects(oid) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS workdir_files (
            filepath TEXT PRIMARY KEY, content BLOB,
            is_chunked INTEGER DEFAULT 0, total_size INTEGER,
            metadata TEXT
        );
        CREATE TABLE IF NOT EXISTS workdir_chunks (
            filepath TEXT, sequence INTEGER, data BLOB NOT NULL,
            PRIMARY KEY (filepath, sequence),
            FOREIGN KEY (filepath) REFERENCES workdir_files(filepath) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS refs (
            name TEXT PRIMARY KEY, target TEXT NOT NULL
        );
    `);
}


// =================================================================
//  LAYER 2A: SQL GIT STORAGE IMPLEMENTATION
// =================================================================

export class SqlGitStorage extends GitStorage {
    constructor({ db }) {
        super();
        this.db = db;
    }

    async writeObject({ oid, type, content }) {
        if (type !== 'blob' || content.length < CHUNK_THRESHOLD) {
            this.db.prepare('INSERT OR REPLACE INTO objects (oid, type, content, is_chunked) VALUES (?, ?, ?, 0)').run(oid, type, content);
        } else {
            const insertHeader = this.db.prepare('INSERT OR REPLACE INTO objects (oid, type, content, is_chunked, total_size) VALUES (?, ?, NULL, 1, ?)');
            const insertChunk = this.db.prepare('INSERT INTO object_chunks (oid, sequence, data) VALUES (?, ?, ?)');
            this.db.transaction(() => {
                insertHeader.run(oid, type, content.length);
                this.db.prepare('DELETE FROM object_chunks WHERE oid = ?').run(oid);
                for (let i = 0, seq = 0; i < content.length; i += CHUNK_SIZE, seq++) {
                    insertChunk.run(oid, seq, content.slice(i, i + CHUNK_SIZE));
                }
            })();
        }
    }

    async readObject(oid) {
        const header = this.db.prepare('SELECT type, content, is_chunked FROM objects WHERE oid = ?').get(oid);
        if (!header) return null;
        if (!header.is_chunked) return { oid, type: header.type, content: header.content };
        
        const chunks = this.db.prepare('SELECT data FROM object_chunks WHERE oid = ? ORDER BY sequence').all(oid);
        return { oid, type: header.type, content: Buffer.concat(chunks.map(c => c.data)) };
    }
    
    readObjectStream(oid) {
        const header = this.db.prepare('SELECT is_chunked FROM objects WHERE oid = ?').get(oid);
        if (!header?.is_chunked) throw new Error("Streaming is only supported for chunked objects.");
        const iterator = this.db.prepare('SELECT data FROM object_chunks WHERE oid = ? ORDER BY sequence').iterate(oid);
        return new Readable({ read() { const r = iterator.next(); this.push(r.done ? null : r.value.data); } });
    }

    async resolveRef(ref) { /* Implementation */ }
}

// =================================================================
//  LAYER 2B: SQL WORKDIR STORAGE IMPLEMENTATION
// =================================================================

export class SqlWorkdirStorage extends WorkdirStorage {
    constructor({ db }) {
        super();
        this.db = db;
    }

    async writeFile(filepath, content, metadata = {}) {
        if (content.length < CHUNK_THRESHOLD) {
            this.db.prepare('INSERT OR REPLACE INTO workdir_files (filepath, content, is_chunked, metadata) VALUES (?, ?, 0, ?)').run(filepath, content, JSON.stringify(metadata));
        } else {
            const insertHeader = this.db.prepare('INSERT OR REPLACE INTO workdir_files (filepath, content, is_chunked, total_size, metadata) VALUES (?, NULL, 1, ?, ?)');
            const insertChunk = this.db.prepare('INSERT INTO workdir_chunks (filepath, sequence, data) VALUES (?, ?, ?)');
            this.db.transaction(() => {
                insertHeader.run(filepath, content.length, JSON.stringify(metadata));
                this.db.prepare('DELETE FROM workdir_chunks WHERE filepath = ?').run(filepath);
                for (let i = 0, seq = 0; i < content.length; i += CHUNK_SIZE, seq++) {
                    insertChunk.run(filepath, seq, content.slice(i, i + CHUNK_SIZE));
                }
            })();
        }
    }

    async readFile(filepath) {
        const header = this.db.prepare('SELECT content, is_chunked FROM workdir_files WHERE filepath = ?').get(filepath);
        if (!header) return null;
        if (!header.is_chunked) return header.content;
        
        const chunks = this.db.prepare('SELECT data FROM workdir_chunks WHERE filepath = ? ORDER BY sequence').all(filepath);
        return Buffer.concat(chunks.map(c => c.data));
    }

    async stat(filepath) {
        const row = this.db.prepare('SELECT metadata FROM workdir_files WHERE filepath = ?').get(filepath);
        return row ? JSON.parse(row.metadata) : null;
    }
}

// =================================================================
//  HIGHER-LEVEL CLASSES (UNCHANGED, NOW CONSUME CORRECT ABSTRACTIONS)
// =================================================================
class BareRepository { constructor(gitStorage) { this.storage = gitStorage; } }
class Repository { constructor(gitStorage) { this.bareRepo = new BareRepository(gitStorage); } }
class Worktree { constructor({ repository, workdir }) { this.repo = repository; this.workdir = workdir; } }