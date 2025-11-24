-- ====================================================================================
--  SQLite Schema for the universal-git Storage Backend
-- ====================================================================================
--
--  Author: universal-git Team
--  Version: 1.0.0
--
--  DESCRIPTION:
--  This SQL script defines the complete relational schema for storing a Git repository
--  within a single SQLite database file. It is designed to be the foundation for a
--  high-performance, transactional, and robust storage backend for universal-git.
--
--  The schema moves away from a filesystem emulation and instead models Git's
--  core data structures directly, unlocking significant performance and reliability
--  gains, especially in browser and serverless environments.
--
--  This script is idempotent, meaning it can be run multiple times on the same
--  database without causing errors or data loss.
--

-- ====================================================================================
--  DATABASE CONFIGURATION (PRAGMAs)
-- ====================================================================================

-- PRAGMA journal_mode = WAL;
--
--  Sets the journaling mode to Write-Ahead Logging (WAL).
--  - WHY: WAL provides significantly better concurrency by allowing read operations
--    to proceed concurrently with write operations. This is a major performance
--    enhancement over the default 'DELETE' mode, which locks the entire database
--    during writes. It is the modern standard for high-performance applications.
--
PRAGMA journal_mode = WAL;


-- PRAGMA synchronous = NORMAL;
--
--  Configures how aggressively the database engine syncs data to the disk.
--  - WHY: In WAL mode, 'NORMAL' is a safe and highly performant setting. It ensures
--    that data is written to the WAL file before a transaction is committed but
--    relies on periodic checkpoints to sync data to the main database file. This
--    offers a great balance between data safety and write performance, avoiding
--    costly disk syncs on every single transaction.
--
PRAGMA synchronous = NORMAL;


-- PRAGMA foreign_keys = ON;
--
--  Enforces foreign key constraints.
--  - WHY: This is crucial for maintaining the relational integrity of the Git data.
--    For example, it will prevent a 'ref' from pointing to a non-existent 'object'
--    SHA, which helps prevent repository corruption at the database level.
--
PRAGMA foreign_keys = ON;


-- ====================================================================================
--  TABLE DEFINITIONS
-- ====================================================================================

-- ------------------------------------------------------------------------------------
--  TABLE: objects
--  PURPOSE: Stores all Git objects (blobs, trees, commits, tags).
--  REPLACES: The entire `.git/objects/[0-9a-f]{2}/` directory structure for loose objects.
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objects (
    -- The full 40-character SHA-1 hash of the object, acting as the primary key.
    -- This is the unique, content-addressable identifier for every piece of data.
    -- Stored as TEXT for simplicity and readability. A 20-byte BLOB is a potential
    -- micro-optimization for storage space if needed in the future.
    sha TEXT(40) PRIMARY KEY NOT NULL,

    -- The type of the Git object. This is essential for parsers to know how to
    -- interpret the 'content' blob. The CHECK constraint enforces data validity.
    type TEXT NOT NULL CHECK(type IN ('blob', 'tree', 'commit', 'tag')),

    -- The raw, zlib-deflated content of the object. Storing it as a BLOB is highly
    -- efficient, avoiding any encoding/decoding overhead (like Base64) and allowing
    -- the database to manage binary data optimally.
    content BLOB NOT NULL
);


-- ------------------------------------------------------------------------------------
--  TABLE: refs
--  PURPOSE: Stores all references like branches, tags, and HEAD.
--  REPLACES: Files in `.git/refs/`, `.git/heads/`, `.git/tags/`, and the `.git/HEAD` file.
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refs (
    -- The full, namespaced path of the reference (e.g., 'refs/heads/main',
    -- 'refs/tags/v1.0.0', 'HEAD'). This serves as the unique key.
    path TEXT PRIMARY KEY NOT NULL,

    -- For DIRECT references (e.g., a branch pointing to a commit), this column
    -- stores the target object's SHA-1 hash. It is NULL for symbolic refs.
    target_sha TEXT(40),

    -- For SYMBOLIC references (e.g., HEAD pointing to 'refs/heads/main'), this
    -- column stores the path of the ref it points to. It is NULL for direct refs.
    symbolic_target TEXT,

    -- This database-level constraint ensures a ref is either direct OR symbolic,
    -- but never both or neither. This enforces the logical integrity of Git refs.
    CHECK (
        (target_sha IS NOT NULL AND symbolic_target IS NULL) OR
        (target_sha IS NULL AND symbolic_target IS NOT NULL)
    )
);

-- An index on 'target_sha' allows for very fast lookups to find all references
-- pointing to a specific commit. This is useful for core Git logic like garbage
-- collection (determining reachability) and checking if a commit is the tip of any branch.
CREATE INDEX IF NOT EXISTS idx_refs_target_sha ON refs(target_sha);


-- ------------------------------------------------------------------------------------
--  TABLE: packfiles
--  PURPOSE: Stores the binary packfiles and their corresponding indexes.
--  REPLACES: The `.git/objects/pack/` directory.
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packfiles (
    -- The primary key is the SHA-1 hash of the .pack file itself. This provides a
    -- unique identifier for the pack and is used to name the file on disk.
    sha TEXT(40) PRIMARY KEY NOT NULL,

    -- The complete, opaque binary content of the .pack file. universal-git's
    -- internal parsers will read this blob and interpret it.
    pack_data BLOB NOT NULL,

    -- The complete, opaque binary content of the packfile's corresponding .idx file.
    -- Storing it alongside the pack data ensures they are always kept together.
    idx_data BLOB NOT NULL
);


-- ------------------------------------------------------------------------------------
--  TABLE: loose_files
--  PURPOSE: A flexible key-value store for other files in the .git directory.
--  REPLACES: `.git/config`, `.git/index`, `.git/FETCH_HEAD`, etc.
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loose_files (
    -- The key mimics the filename within the .git directory. This provides a simple
    -- and direct mapping from the old filesystem model.
    key TEXT PRIMARY KEY NOT NULL,

    -- The raw, binary content of the file. This is perfect for complex binary
    -- formats like the Git index file, or simple text files like the config.
    -- The application layer is responsible for parsing this blob.
    value BLOB NOT NULL
);