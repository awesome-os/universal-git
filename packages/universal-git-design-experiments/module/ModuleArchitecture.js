/**
 * @fileoverview Final architectural skeleton for a universal Git implementation.
 * Includes config, gitignore, and shallow clone support.
 */

// =================================================================
//  LAYER 0: THE FOUNDATION (ABSTRACT STORAGE)
// =================================================================

/** @class @abstract */
export class GitStorage {
  async read(key) { throw new Error("Not implemented."); }
  async write(key, value) { throw new Error("Not implemented."); }
  async list(prefix) { throw new Error("Not implemented."); }
}

// =================================================================
//  LAYER 1: THE COMMUNICATION PRIMITIVES (TRANSPORTS)
// =================================================================

/** @class @abstract */
export class GitTransport {
  static connect(config) {}
  constructor(url) {}
  async discover() { throw new Error("Not implemented."); }
  async negotiateAndFetch(bodyStream) { throw new Error("Not implemented."); }
  async push(bodyStream) { throw new Error("Not implemented."); }
}

// ... Concrete HttpTransport, SshTransport, SqlTransport, FileSystemTransport classes ...

// =================================================================
//  LAYER 2: THE CORE DATA MANAGER (BARE REPOSITORY & CONFIG)
// =================================================================

/** Manages repository-level configuration. */
export class GitConfig {
  constructor(storage, namespace = 'default') {}
  async get(key) {}
  async set(key, value) {}
}

/**
 * Manages the core, shared Git data (objects and refs).
 * This is the equivalent of a bare '.git' repository, now with shallow state management.
 */
export class BareRepository {
  constructor(storage) {
    /** @type {GitStorage} */
    this.storage = storage;
    /** @type {GitConfig} */
    this.config = new GitConfig(storage);
  }

  static async fromPackfile(packfileStream, storage) {}
  async readObject(oid) {}
  async writeObject(type, content) {}
  async readRef(path) {}
  async writeRef(path, target) {}
  async listRefs(prefix) {}
  async resolveRef(ref) {}
  
  // --- NEW: Shallow Repository State Management ---
  async getShallowCommits() {}
  async writeShallowCommits(oids) {}
  async isShallow() {}
}

// =================================================================
//  LAYER 3: THE PROJECT MANAGER (REPOSITORY)
// =================================================================

/**
 * The central management unit for a Git project.
 */
export class Repository {
  constructor(bareRepo) {
    /** @type {BareRepository} */
    this.bareRepo = bareRepo;
    /** @type {Map<string, Remote>} */
    this.remotes = new Map();
  }

  static async init({ storage }) {}

  /**
   * Clones a remote repository.
   * @param {object} options
   * @param {string} options.url - The URL of the remote.
   * @param {GitStorage} options.storage - The storage backend.
   * @param {string} [options.singleBranch] - Clones only a single branch.
   * @param {number} [options.depth] - Creates a shallow clone with a history truncated to the specified number of commits.
   */
  static async clone({ url, storage, singleBranch, depth }) {}
  
  async addRemote(name, config) {}
  remote(name) {}
  asTransport() {}
  async _synchronize(sourceTransport, destinationTransport) {}
  async _pushLogic(sourceTransport, destinationTransport, branchName) {}
  async createWorktree(branchName, options) {}
  
  // --- NEW: Convenience method ---
  async isShallow() {}
}

// =================================================================
//  LAYER 4: THE COMMUNICATION ENDPOINT OBJECT (REMOTE)
// =================================================================

/**
 * Represents a configured remote endpoint.
 */
export class Remote {
  constructor({ name, config, repository }) {}
  _connect() {}
  
  /**
   * Fetches updates from this remote into the local repository.
   * @param {object} [options]
   * @param {number} [options.depth] - Deepens a shallow repository by the specified number of commits.
   * @param {boolean} [options.unshallow=false] - Converts a shallow repository into a complete one.
   */
  async fetch({ depth, unshallow } = {}) {}
  
  async push(branchName) {}
}

// =================================================================
//  LAYER 5: THE USER SESSION (WORKTREE & GITIGNORE)
// =================================================================

/**
 * A helper class to parse .gitignore files and match paths against their rules.
 */
class GitIgnore {
  constructor() {}
  static async from(worktree) {}
  isIgnored(filepath) {}
}

/**
 * Represents a single, isolated checkout session.
 */
export class Worktree {
  constructor({ name, repository, sparseConfig }) {
    /** @type {Repository} */
    this.repo = repository;
    /** @type {GitIgnore | null} */
    this.ignore = null;
  }

  // --- Internal Key Management ---
  _headKey() {}
  _indexKey() {}
  _worktreeKey() {}

  // --- Core Workflow Methods ---
  async add(filepath) {}
  async commit({ message, author }) {}
  async status() {}
  async writeFile(filepath, content) {}
  async switchBranch(branchName) {}
  async checkoutCommit(commitOid) {}
  
  // --- Submodule Management ---
  async submoduleInit() {}
  async submoduleUpdate({ storageFactory }) {}

  // --- NEW: History-aware command ---
  /**
   * Retrieves the commit history, respecting the repository's shallow state.
   * @param {string} [startCommit='HEAD'] - The commit to start walking from.
   * @returns {AsyncGenerator<ParsedCommitObject>}
   */
  async * log(startCommit = 'HEAD') {}

  // --- Gitignore Management ---
  async _loadIgnoreRules() {}

  // --- Export and Helpers ---
  async export(fs, targetDir) {}
  async resolveRef(ref) {}
}