/**
 * @fileoverview Final, complete, and fully integrated architectural skeleton for universal-git.
 * This version corrects previous omissions by wiring the GitConfig class into all relevant
 * high-level commands, ensuring a practical and implementable design. Configuration data
 * now correctly drives the behavior of remotes, commits, and repository setup.
 */

// =================================================================
//  PART 0: THE SQL-FIRST LOGICAL DATA & SERIALIZATION MODEL
// =================================================================
export class GitObject { oid; repositoryId; type; }
export class Blob extends GitObject { type = 'blob'; content; }
export class TreeEntry { mode; type; path; oid; }
export class Tree extends GitObject { type = 'tree'; entries = []; }
export class PersonStamp { name; email; timestamp; timezone; }
export class Commit extends GitObject { type = 'commit'; treeOid; parentOids = []; author; committer; message; }
export class Tag extends GitObject { type = 'tag'; objectOid; objectType; tag; tagger; message; }
export class Reference { repositoryId; name; }
export class DirectReference extends Reference { targetOid; }
export class SymbolicReference extends Reference { targetRef; }
export class IndexEntry { worktreeId; path; oid; stage; metadata; }
export class ReflogEntry { oldOid; newOid; actor; message; }
export class GitDataParser { async * parse(stream) {} }
export class GitDataBuilder { build(repository, oids) {} }
export class PackfileParser extends GitDataParser {}
export class PackfileBuilder extends GitDataBuilder {}
export class LooseObjectSerializer { static serialize(object) {} static parse(buffer) {} }

// =================================================================
//  PART 1: UTILITY CLASSES
// =================================================================
export class GitDiffer {
    constructor(storage) { this.storage = storage; }
    async compareTrees(treeA_oid, treeB_oid) { return []; }
    async compareTreeToIndex(treeOid, indexEntries) { return []; }
}

// =================================================================
//  LAYER 1: THE FOUNDATION (ABSTRACT STORAGE & CONFIG)
// =================================================================
export class GitStorage {
  async writeObject(object) {}
  async readObject(oid) {}
  async hasObject(oid) {}
  async writeRef(ref) {}
  async readRef(name) {}
  async listRefs(prefix) {}
  async deleteRef(name) {}
  async writeIndexEntries(worktreeId, entries) {}
  async readIndex(worktreeId) {}
  async listAllObjectOids() {}
}
export class SqlStorage extends GitStorage { /* ... SQL Implementations ... */ }
export class MemoryStorage extends GitStorage { /* ... In-Memory Implementations ... */ }

/**
 * Manages repository configuration (INI format). Now a critical component.
 * It reads from and writes to a specific part of the GitStorage.
 */
export class GitConfig {
    constructor(storage, storageKey = 'config.ini') { this.storage = storage; this.key = storageKey; }
    async get(key) { /* Parses the config file from storage and returns the value */ }
    async set(key, value) { /* Reads, modifies, and writes the config file back to storage */ }
}

// =================================================================
//  LAYER 2: THE COMMUNICATION PRIMITIVES (TRANSPORTS)
// =================================================================
export class GitTransport {
  static connect({ url }) { 
      if (url.startsWith('http')) return new HttpTransport({ url });
      /* ... other transports ... */
  }
  constructor({ url }) { this.url = url; }
  async discover() {}
  async negotiateAndFetch(haveOids) {}
  async push(packfileStream, commands) {}
}
class HttpTransport extends GitTransport {}

// =================================================================
//  LAYER 3: THE CORE DATA MANAGER (BARE REPOSITORY)
// =================================================================
export class BareRepository {
  constructor(storage, config) { 
      this.storage = storage; 
      this.config = config;
  }
  static async fromPackfile(packfileStream, storage, config) { /* ... */ }
  async readObject(oid) { return this.storage.readObject(oid); }
  async readTree(oid) { return this.storage.readObject(oid); }
  async listRefs(prefix) { return this.storage.listRefs(prefix); }
  async resolveRef(refName) { /* ... */ }
  async writeObject(type, content) { /* ... */ }
  async writeTree(indexEntries) { /* ... */ }
  async writeCommit(commitArgs) { /* ... */ }
  async writeRef(path, targetOid) { /* ... */ }
  async symbolicRef(name, targetRef) { /* ... */ }
  async updateRef(refName, newValue, oldValue) { /* ... */ }
  async * revList({ from, not }) { /* ... */ }
  hashObject(content, type) { /* ... */ }
  hashTree(entries) { /* ... */ }
  hashCommit(commit) { /* ... */ }
}

// =================================================================
//  LAYER 4: THE PROJECT MANAGER (REPOSITORY)
// =================================================================
export class Repository {
  constructor(storage) { 
      this.config = new GitConfig(storage);
      this.bareRepo = new BareRepository(storage, this.config);
  }

  static async init({ storage }) {
      const repo = new Repository(storage);
      await repo.config.set('core.repositoryformatversion', 0);
      await repo.config.set('core.filemode', true);
      await repo.bareRepo.symbolicRef('HEAD', 'refs/heads/main');
      return repo;
  }

  static async clone({ storage, url, remoteName = 'origin' }) {
    const transport = GitTransport.connect({ url });
    const { refs, packfileStream } = await transport.negotiateAndFetch([]);
    const repo = new Repository(storage);
    await BareRepository.fromPackfile(packfileStream, repo.bareRepo.storage, repo.config);
    for (const ref of refs) {
        if (ref instanceof DirectReference) await repo.bareRepo.storage.writeRef(ref);
    }
    const headRef = refs.find(r => r.name === 'HEAD');
    if (headRef) await repo.bareRepo.storage.writeRef(headRef);
    // CRITICAL: Write remote configuration after cloning
    await repo.config.set(`remote.${remoteName}.url`, url);
    await repo.config.set(`remote.${remoteName}.fetch`, `+refs/heads/*:refs/remotes/${remoteName}/*`);
    return repo;
  }

  async createPackfile(oids) { return new PackfileBuilder().build(this, oids); }
  async branch(branchName, { from = 'HEAD' }) { /* ... */ }
  async deleteBranch(branchName) { /* ... */ }
  async listBranches() { /* ... */ }
  async mergeBase(oid1, oid2) { /* ... implementation from before ... */ }
  remote(name) { return new Remote({ name, repository: this }); }
}

// =================================================================
//  LAYER 5: THE COMMUNICATION ENDPOINT OBJECT (REMOTE)
// =================================================================
export class Remote {
  constructor({ name, repository }) { 
      this.name = name; 
      this.repo = repository;
      this.config = repository.config; // Inherit config access
      this.url = null; // Will be loaded lazily
  }

  async _getUrl() {
      if (!this.url) {
          this.url = await this.config.get(`remote.${this.name}.url`);
          if (!this.url) throw new Error(`URL for remote '${this.name}' not configured.`);
      }
      return this.url;
  }

  async fetch(options) {
    const transport = GitTransport.connect({ url: await this._getUrl() });
    const remoteRefs = await transport.discover();
    await BareRepository.fromPackfile(
        await transport.negotiateAndFetch(await this.repo.bareRepo.storage.listAllObjectOids()),
        this.repo.bareRepo.storage,
        this.config
    );
    for (const ref of remoteRefs) {
        if (ref.name.startsWith('refs/heads/')) {
            const remoteTrackingName = `refs/remotes/${this.name}/${ref.name.substring(11)}`;
            await this.repo.bareRepo.writeRef(remoteTrackingName, ref.targetOid);
        }
    }
  }

  async push(branchName, options) {
    const localRefName = `refs/heads/${branchName}`;
    const remoteRef = await this.repo.bareRepo.resolveRef(`refs/remotes/${this.name}/${branchName}`);
    const oidsToPush = [];
    for await (const oid of this.repo.bareRepo.revList({ from: localRef.targetOid, not: remoteRef?.targetOid })) {
        oidsToPush.push(oid);
    }
    const transport = GitTransport.connect({ url: await this._getUrl() });
    const result = await transport.push(await this.repo.createPackfile(oidsToPush), { updateRef: localRefName });
    if (result.ok) {
        await this.repo.bareRepo.updateRef(remoteTrackingRefName, (await this.repo.bareRepo.resolveRef(localRefName)).targetOid, remoteRef?.targetOid);
    }
  }

  async ls() {
      return GitTransport.connect({ url: await this._getUrl() }).discover();
  }
}

// =================================================================
//  LAYER 6: THE USER SESSION (WORKTREE)
// =================================================================
export class Worktree {
  constructor({ name, repository }) {
    this.name = name;
    this.repo = repository;
    this.storage = repository.bareRepo.storage;
    this.config = repository.config; // Inherit config access
    this.differ = new GitDiffer(this.storage);
  }

  async _readFromWorkdir(filepath) {}
  async _writeToWorkdir(filepath, content) {}
  async _getWorkdirStatus(indexEntries) { return []; }
  async add(filepath) { /* ... */ }
  async rm(filepath) { /* ... */ }
  
  async commit({ message, author, committer }) {
    const indexEntries = await this.storage.readIndex(this.name);
    if (indexEntries.length === 0) throw new Error("Nothing to commit, working tree clean.");
    
    // CRITICAL: Use config to get author/committer if not provided
    if (!author) {
        author = {
            name: await this.config.get('user.name'),
            email: await this.config.get('user.email')
        };
    }
    if (!author.name || !author.email) {
        throw new Error("Author name and email must be configured or passed explicitly.");
    }
    
    const headRef = await this.repo.bareRepo.resolveRef('HEAD');
    const commitOid = await this.repo.bareRepo.writeCommit({
      treeOid: await this.repo.bareRepo.writeTree(indexEntries),
      parentOids: headRef ? [headRef.targetOid] : [],
      author,
      committer: committer || author,
      message,
    });
    await this.repo.bareRepo.writeRef((await this.repo.bareRepo.readRef('HEAD')).targetRef, commitOid);
  }
  
  async * log(options) { /* ... */ }
  async status() { /* ... */ }
  async merge(branchToMerge) { /* ... */ }
  
  async pull(remoteName, branchName) {
      await this.repo.remote(remoteName).fetch();
      await this.merge(`${remoteName}/${branchName}`);
  }

  async checkout(ref) { /* ... */ }
}