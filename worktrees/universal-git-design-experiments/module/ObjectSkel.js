/**
 * @fileoverview A complete, single-file, SQL-first architectural blueprint for universal-git.
 * This model defines the logical domain classes that map to a database schema,
 * separating them from the serialization classes used for transport and compatibility.
 * All interfaces have been converted to abstract classes.
 */

// =================================================================
//  PART 1: THE LOGICAL DOMAIN MODEL (DATABASE SCHEMA REPRESENTATION)
// =================================================================
// These are the primary classes the application works with. They map directly to
// database tables and represent the pure, relational structure of a Git repository.

// -----------------------------------------------------------------
// Section 1.1: Core Repository Entities (The Object Model)
// -----------------------------------------------------------------

/**
 * @abstract The base class for all fundamental Git object types.
 * Maps to a central 'objects' table.
 * 
 * @example SQL Table: objects(oid, repository_id, type, content_or_metadata)
 */
export abstract class GitObject {
  /** The SHA hash of the object. Primary Key (with repository_id). */
  oid;
  /** The repository this object belongs to. Foreign Key. */
  repositoryId;
  /** The object's type ('blob', 'tree', 'commit', 'tag'). */
  abstract type;
}

/**
 * Represents file content. The 'content' property maps to a BLOB/bytea column.
 */
export class Blob extends GitObject {
  type = 'blob';
  content; // Buffer
}

/**
 * A value object representing a single row in a tree. This is not a top-level
 * GitObject itself but a component of a Tree.
 * 
 * @example SQL Table: tree_entries(tree_oid, mode, type, path, entry_oid)
 */
export class TreeEntry {
  mode; // string, e.g., '100644'
  type; // 'blob' | 'tree' | 'commit'
  path; // string
  /** The OID of the blob, tree, or commit this entry points to. Foreign Key to 'objects'. */
  oid;
}

/**
 * Represents a directory structure. The 'entries' are stored relationally.
 */
export class Tree extends GitObject {
  type = 'tree';
  /** A collection of TreeEntry objects, hydrated from the 'tree_entries' table. */
  entries = []; // TreeEntry[]
}

/** 
 * A value object for author/committer/tagger identity. 
 * Can be stored as JSONB or individual columns.
 */
export class PersonStamp {
  name; // string
  email; // string
  timestamp; // number (Unix timestamp)
  timezone; // string, e.g., '-0500'
}

/**
 * Represents a commit. Its parent relationships are stored in a join table.
 * 
 * @example SQL Join Table: commit_parents(commit_oid, parent_oid)
 */
export class Commit extends GitObject {
  type = 'commit';
  /** OID of the root tree. Foreign Key to 'objects'. */
  treeOid;
  /** Array of parent OIDs, hydrated from the 'commit_parents' table. */
  parentOids = []; // string[]
  author; // PersonStamp
  committer; // PersonStamp
  message; // string
}

/**
 * Represents an annotated tag object.
 */
export class Tag extends GitObject {
  type = 'tag';
  /** OID of the object being tagged. Foreign Key to 'objects'. */
  objectOid;
  objectType; // 'commit' | 'tree' | 'blob' | 'tag'
  tag; // string, e.g., 'v1.0.0'
  tagger; // PersonStamp
  message; // string
}


// -----------------------------------------------------------------
// Section 1.2: Repository State & Pointers
// -----------------------------------------------------------------

/**
 * @abstract Represents a reference, such as a branch, tag, or HEAD.
 * Maps to a central 'refs' table.
 * 
 * @example SQL Table: refs(repository_id, name, target_oid, symbolic_target)
 */
export abstract class Reference {
  /** The repository this ref belongs to. Foreign Key. */
  repositoryId;
  /** The full name of the ref (e.g., 'refs/heads/main'). Primary Key. */
  name;
}

/** A reference pointing directly to a Git object OID. */
export class DirectReference extends Reference {
  /** The OID this reference points to. Populates the 'target_oid' column. */
  targetOid;
}

/** A reference pointing to another reference (e.g., HEAD -> main). */
export class SymbolicReference extends Reference {
  /** The name of the ref this one points to. Populates the 'symbolic_target' column. */
  targetRef;
}

/**
 * Represents a single row in the staging area (index) for a worktree.
 * 
 * @example SQL Table: index_entries(worktree_id, path, oid, stage, metadata)
 */
export class IndexEntry {
  /** The worktree this entry belongs to. Foreign Key. */
  worktreeId;
  /** The path of the file in the index. */
  path;
  /** The OID of the blob object. */
  oid;
  /** Merge conflict stage (0 = normal, 1 = base, 2 = ours, 3 = theirs). */
  stage;
  /** Filesystem metadata, can be stored as a JSONB column. */
  metadata; // object
}

/** 
 * A value object representing a reflog entry.
 *
 * @example SQL Table: reflogs(ref_name, repository_id, old_oid, new_oid, actor_json, message, timestamp)
 */
export class ReflogEntry {
    oldOid;
    newOid;
    actor; // PersonStamp
    message;
}


// -----------------------------------------------------------------
// Section 1.3: Performance & Cache Model Abstractions
// -----------------------------------------------------------------
// These classes provide a queryable API over pre-computed database tables or
// materialized views, which are updated during write operations.

/**
 * @abstract Provides an API for querying pre-computed commit ancestry data.
 * This abstracts away the underlying cache tables.
 *
 * @example SQL Tables: commit_graph_nodes(oid, tree_oid, commit_time, generation),
 *                       commit_graph_edges(commit_oid, parent_oid)
 */
export abstract class CommitGraphCache {
  /** Gets commit metadata without parsing the full object. */
  async getCommitData(oid) { throw new Error("Not implemented."); }
  /** Efficiently finds the merge base of two or more commits. */
  async findMergeBase(oid1, oid2) { throw new Error("Not implemented."); }
}

/**
 * @abstract Provides an API for querying object reachability.
 * This could be implemented using graph traversal queries or dedicated tables.
 *
 * @example SQL Tables: reachability_bitmaps(commit_oid, reachable_objects_set)
 */
export abstract class ReachabilityIndex {
  /** Returns the set of all OIDs reachable from a given commit OID. */
  async getReachableObjects(commitOid) { throw new Error("Not implemented."); }
}


// =================================================================
//  PART 2: THE SERIALIZATION & TRANSPORT MODEL
// =================================================================
// These are stateless helper classes used only when a command needs to interact
// with the outside world (e.g., a filesystem or a remote Git server). They are
// responsible for parsing and building the standard Git binary formats.

/** 
 * @abstract Defines the contract for parsing a stream of Git data into logical objects.
 */
export abstract class GitDataParser {
  /** A generator that yields GitObject instances from a readable stream. */
  async * parse(stream) { throw new Error("Not implemented."); }
}

/** 
 * @abstract Defines the contract for building a stream of Git data from logical objects.
 */
export abstract class GitDataBuilder {
  /** Creates a stream from a list of OIDs, fetching their data from the repository. */
  build(repository, oids) { throw new Error("Not implemented."); }
}

/** Implements parsing for the Packfile format. Contains all delta and zlib logic. */
export class PackfileParser extends GitDataParser {
  async * parse(stream) {
    // Implementation would go here to read the packfile header,
    // then iterate through objects, decompressing, resolving deltas,
    // and yielding logical GitObject instances (Blob, Commit, etc.).
  }
}

/** Implements building the Packfile format. */
export class PackfileBuilder extends GitDataBuilder {
  build(repository, oids) {
    // Implementation would go here to fetch the requested objects from the DB,
    // compute optimal deltas, compress them, construct a packfile stream,
    // and return a ReadableStream of that data.
    return null; // Returns a ReadableStream
  }
}

/** Implements parsing and building for individual zlib-compressed loose objects. */
export class LooseObjectSerializer {
  static serialize(object) {
    // Implementation to create the header (e.g., "blob 12\0"),
    // append the content, and zlib-compress the result.
    return Buffer.alloc(0);
  }
  static parse(buffer) {
    // Implementation to decompress, parse the header to find the type,
    // and return the corresponding logical GitObject.
    return null;
  }
}