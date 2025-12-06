/**
 * Represents the shared data of a Git repository, like a bare '.git' directory.
 * It manages all permanent objects and references.
 */
export class GitBareRepository {
  /**
   * @param {GitStorage} storage - The storage backend for this repository's data.
   */
  constructor(storage) {
    this.storage = storage;
  }
    async getConfig(key) {
    // Reads from a 'CONFIG' key in storage, which would store INI-formatted data.
    const configData = await this.storage.read('CONFIG') || '';
    // ... parse INI and return value for key ...
    }

    async setConfig(key, value) {
    // ... read, update, and write back to 'CONFIG' key ...
    }
  // --- FACTORY METHOD: CLONE (Creates the bare repo) ---
  
  /**
   * Creates a new bare repository by cloning a remote into the provided storage.
   * @param {object} options
   * @param {string} options.url - The URL of the remote.
   * @param {GitStorage} options.storage - The storage backend to populate.
   * @returns {Promise<GitBareRepository>} A new bare repository instance.
   */
  static async clone({ url, storage }) {
    // ... The packfile fetching and unpacking logic is the same ...
    // It populates the storage with objects and refs/heads/*, refs/tags/*
    // It does NOT write HEAD, INDEX, or WORKTREE.
    
    // After unpacking:
    return new GitBareRepository(storage);
  }

  // --- CORE METHOD: CREATE WORKTREE (The bridge to the next class) ---

    /**
     * Creates a new, isolated worktree session for a specific branch.
     *
     * @param {string} branchName - The branch to check out.
     * @param {object} [options]
     * @param {string[]} [options.sparsePaths] - A list of files or directory prefixes to include.
     *                                           If provided, enables sparse checkout.
     * @returns {Promise<GitWorktree>}
     */
    async createWorktree(branchName, { sparsePaths } = {}) {
    const worktree = new GitWorktree({
        name: branchName,
        repository: this,
        sparseConfig: sparsePaths // Pass the config to the worktree
    });

    // The switchBranch method will now handle the sparse logic.
    await worktree.switchBranch(branchName);
    return worktree;
    }
  
  // --- LOW-LEVEL DATA ACCESS (Used by GitWorktree) ---
  // These are the methods the worktree will call to interact with shared data.
  
  async readObject(oid) { return this.storage.read(oid); }
  async writeObject(type, content) { return GitObject.write(this.storage, type, content); }
  async readRef(ref) { return this.storage.read(ref); }
  async writeRef(ref, oid) { return this.storage.write(ref, oid); }
  async resolveRef(ref) { return this.storage.resolveRef(ref); }
}