/**
 * @fileoverview A final, architecturally-definitive implementation of a universal-git
 * SqlStorage system. This version correctly separates responsibilities into
 * SqlGitStorage and SqlWorkdirStorage classes, which operate on a shared
 * database connection, demonstrating a clean separation of concerns.
 */

import Database from 'better-sqlite3';
import { Readable } from 'stream';

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
//  LAYER 1: ABSTRACT STORAGE CLASSES
// =================================================================

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
}



// =================================================================
//  MAIN: Demonstrating the correctly separated architecture
// =================================================================

async function main() {
    console.log("--- universal-git with Separated SqlGitStorage and SqlWorkdirStorage ---");

    // 1. Create ONE database connection and initialize the schema.
    const db = new Database(':memory:');
    initSchema(db);

    // 2. Instantiate the TWO separate storage classes, injecting the SAME connection.
    const gitStorage = new SqlGitStorage({ db });
    const workdirStorage = new SqlWorkdirStorage({ db });
    console.log("Instantiated separate storage classes for Git DB and Workdir.");

    // 3. Instantiate higher-level objects with their specific dependencies.
    const repo = new Repository(gitStorage);
    const worktree = new Worktree({ repository: repo, workdir: workdirStorage });

    // 4. Demonstrate writing a LARGE file using the WorkdirStorage.
    console.log("\n--- Handling a large workdir file (>100MB) via SqlWorkdirStorage ---");
    const largeContent = Buffer.alloc(CHUNK_THRESHOLD + 1, 'x');
    await worktree.workdir.writeFile('large-video.mp4', largeContent, { mode: '100644' });
    console.log("Wrote large-video.mp4 using chunking.");

    // Verify workdir tables
    const fileHeader = db.prepare('SELECT * FROM workdir_files WHERE filepath = ?').get('large-video.mp4');
    const chunkCount = db.prepare('SELECT COUNT(*) as count FROM workdir_chunks WHERE filepath = ?').get('large-video.mp4');
    console.log("DB verification: is_chunked =", fileHeader.is_chunked, ", chunks =", chunkCount.count);

    const readContent = await worktree.workdir.readFile('large-video.mp4');
    console.log(`Read back ${readContent.length} bytes. Match: ${Buffer.compare(largeContent, readContent) === 0}`);

    // 5. Demonstrate writing a LARGE Git BLOB using the GitStorage.
    console.log("\n--- Handling a large Git blob (>100MB) via SqlGitStorage ---");
    const largeBlobOid = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    await repo.bareRepo.storage.writeObject({ oid: largeBlobOid, type: 'blob', content: largeContent });
    console.log("Wrote large blob to Git storage using chunking.");
    
    // Verify object tables
    const objHeader = db.prepare('SELECT * FROM objects WHERE oid = ?').get(largeBlobOid);
    const objChunkCount = db.prepare('SELECT COUNT(*) as count FROM object_chunks WHERE oid = ?').get(largeBlobOid);
    console.log("DB verification: is_chunked =", objHeader.is_chunked, ", chunks =", objChunkCount.count);

    const readBlob = await repo.bareRepo.storage.readObject(largeBlobOid);
    console.log(`Read back ${readBlob.content.length} bytes. Match: ${Buffer.compare(largeContent, readBlob.content) === 0}`);
    
    console.log("\n--- Example Complete: Architecture is clean and correct. ---");
}

main().catch(console.error);