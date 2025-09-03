/**
 * @fileoverview Final, complete architectural skeleton for a universal Git implementation.
 * This blueprint maps standard Git commands to their logical class locations and includes
 * the full API for all foundational and high-level classes. It is integrated with a
 * SQL-first data model, separating logical data from its transport serialization.
 */

// =================================================================
//  PART 0: THE SQL-FIRST LOGICAL DATA & SERIALIZATION MODEL
// =================================================================
// This entire section defines the canonical, in-memory representation of Git data.
// These classes map directly to a database schema, not to binary file formats.

// Section 0.1: Core Repository Entities (The Object Model)
export class GitObject { oid; repositoryId; type; }
export class Blob extends GitObject { type = 'blob'; content; }
export class TreeEntry { mode; type; path; oid; }
export class Tree extends GitObject { type = 'tree'; entries = []; }
export class PersonStamp { name; email; timestamp; timezone; }
export class Commit extends GitObject { type = 'commit'; treeOid; parentOids = []; author; committer; message; }
export class Tag extends GitObject { type = 'tag'; objectOid; objectType; tag; tagger; message; }

// Section 0.2: Repository State & Pointers
export class Reference { repositoryId; name; }
export class DirectReference extends Reference { targetOid; }
export class SymbolicReference extends Reference { targetRef; }
export class IndexEntry { worktreeId; path; oid; stage; metadata; }
export class ReflogEntry { oldOid; newOid; actor; message; }

// Section 0.3: Serialization & Transport Model (Stateless Helpers)
// These classes are only used for import/export and communication.
export class GitDataParser { async * parse(stream) { throw new Error("Not implemented."); } }
export class GitDataBuilder { build(repository, oids) { throw new Error("Not implemented."); } }
export class PackfileParser extends GitDataParser { /* ... packfile stream -> GitObject logic ... */ }
export class PackfileBuilder extends GitDataBuilder { /* ... GitObject -> packfile stream logic ... */ }
export class LooseObjectSerializer { static serialize(object) {} static parse(buffer) {} }

// =================================================================
//  LAYER 1: THE FOUNDATION (ABSTRACT STORAGE)
// =================================================================

/** @class @abstract Core persistence layer for the logical data model. */
export class GitStorage {
  async writeObject(object /* GitObject */) { throw new Error("Not implemented."); }
  async readObject(oid) { throw new Error("Not implemented."); }
  async hasObject(oid) { throw new Error("Not implemented."); }
  async writeRef(ref /* Reference */) { throw new Error("Not implemented."); }
  async readRef(name) { throw new Error("Not implemented."); }
  async listRefs(prefix) { throw new Error("Not implemented."); }
  async deleteRef(name) { throw new Error("Not implemented."); }
  async writeIndexEntries(worktreeId, entries /* IndexEntry[] */) { throw new Error("Not implemented."); }
  async readIndex(worktreeId) { throw new Error("Not implemented."); }
  async listAllObjectOids() { throw new Error("Not implemented."); }
}

/** 
 * A concrete implementation using a SQL database. Each method maps to SQL queries.
 */
export class SqlStorage extends GitStorage {
    constructor({ client }) { super(); this.client = client; }
    async writeObject(object) { /* SQL: INSERT OR IGNORE INTO objects...; if Tree, INSERT INTO tree_entries...; if Commit, INSERT INTO commit_parents... */ }
    async readObject(oid) { /* SQL: SELECT * FROM objects WHERE oid=...; if Tree, JOIN tree_entries...; if Commit, JOIN commit_parents... */ }
    async hasObject(oid) { /* SQL: SELECT 1 FROM objects WHERE oid=... */ }
    async writeRef(ref) { /* SQL: INSERT OR REPLACE INTO refs (name, target_oid, symbolic_target) VALUES (...) */ }
    async readRef(name) { /* SQL: SELECT * FROM refs WHERE name=... */ }
    async listRefs(prefix) { /* SQL: SELECT * FROM refs WHERE name LIKE 'prefix%' */ }
    async deleteRef(name) { /* SQL: DELETE FROM refs WHERE name=... */ }
    async writeIndexEntries(worktreeId, entries) { /* SQL: DELETE FROM index_entries WHERE worktreeId=...; INSERT INTO index_entries (...) VALUES (...) for each entry */ }
    async readIndex(worktreeId) { /* SQL: SELECT * FROM index_entries WHERE worktreeId=... */ }
    async listAllObjectOids() { /* SQL: SELECT oid FROM objects */ }
}

/** A concrete implementation using an in-memory Map of Maps. */
export class MemoryStorage extends GitStorage {
    constructor() { super(); this.objects = new Map(); this.refs = new Map(); this.index = new Map(); }
    async writeObject(object) { this.objects.set(object.oid, object); }
    async readObject(oid) { return this.objects.get(oid); }
    async hasObject(oid) { return this.objects.has(oid); }
    async writeRef(ref) { this.refs.set(ref.name, ref); }
    async readRef(name) { return this.refs.get(name); }
    async listRefs(prefix) { return [...this.refs.values()].filter(ref => ref.name.startsWith(prefix)); }
    async deleteRef(name) { this.refs.delete(name); }
    async writeIndexEntries(worktreeId, entries) { this.index.set(worktreeId, entries); }
    async readIndex(worktreeId) { return this.index.get(worktreeId) || []; }
    async listAllObjectOids() { return [...this.objects.keys()]; }
}

// =================================================================
//  LAYER 2: THE COMMUNICATION PRIMITIVES (TRANSPORTS)
// =================================================================

/** @class @abstract Network and Local Protocol Handler. Deals with streams. */
export class GitTransport {
  static connect({ url, ...rest }) { /* ... logic to pick Http, Ssh, etc. based on URL scheme ... */ }
  constructor(url) { this.url = url; }
  async discover() { throw new Error("Not implemented."); }
  async negotiateAndFetch(haveOids) { throw new Error("Not implemented."); }
  async push(packfileStream) { throw new Error("Not implemented."); }
}

class HttpTransport extends GitTransport { /* ... implementation using fetch() to /info/refs and git-upload-pack/git-receive-pack endpoints ... */ }
// ... other transport implementations ...

// =================================================================
//  LAYER 3: THE CORE DATA MANAGER (BARE REPOSITORY & CONFIG)
// =================================================================

export class GitConfig { /* ... as before ... */ }

/** Manages the core, shared Git data by using the GitStorage layer. */
export class BareRepository {
  constructor(storage /* GitStorage */) { this.storage = storage; }

  static async fromPackfile(packfileStream, storage) {
    const parser = new PackfileParser();
    for await (const gitObject of parser.parse(packfileStream)) {
      await storage.writeObject(gitObject);
    }
    return new BareRepository(storage);
  }

  async readObject(oid) { return this.storage.readObject(oid); }
  async readTree(oid) { return this.storage.readObject(oid); }
  async listRefs(prefix) { return this.storage.listRefs(prefix); }
  async resolveRef(refName) {
      let ref = await this.storage.readRef(refName);
      while (ref instanceof SymbolicReference) {
          ref = await this.storage.readRef(ref.targetRef);
      }
      return ref; // This will be a DirectReference
  }
  
  async writeObject(type, content) {
    const object = type === 'blob' ? new Blob() : new GitObject();
    object.content = content;
    object.oid = this.hashObject(content, type);
    await this.storage.writeObject(object);
    return object.oid;
  }

  async writeTree(indexEntries) {
    const tree = new Tree();
    tree.entries = indexEntries.map(entry => ({ mode: entry.metadata.mode, type: 'blob', path: entry.path, oid: entry.oid }));
    tree.oid = this.hashTree(tree.entries);
    await this.storage.writeObject(tree);
    return tree.oid;
  }

  async writeCommit({ treeOid, parentOids, author, committer, message }) {
    const commit = new Commit();
    commit.treeOid = treeOid;
    commit.parentOids = parentOids;
    commit.author = new PersonStamp(author);
    commit.committer = new PersonStamp(committer);
    commit.message = message;
    commit.oid = this.hashCommit(commit);
    await this.storage.writeObject(commit);
    return commit.oid;
  }

  async writeRef(path, targetOid) {
    const ref = new DirectReference();
    ref.name = path;
    ref.targetOid = targetOid;
    await this.storage.writeRef(ref);
  }

  async symbolicRef(name, targetRef) {
    const ref = new SymbolicReference();
    ref.name = name;
    ref.targetRef = targetRef;
    await this.storage.writeRef(ref);
  }
  
  async updateRef(refName, newValue, oldValue) {
      // This needs a transactional read-and-write to be safe.
      const currentRef = await this.resolveRef(refName);
      if (currentRef.targetOid !== oldValue) {
          throw new Error(`Ref ${refName} has changed`);
      }
      await this.writeRef(currentRef.name, newValue);
  }

  async * revList({ from, not }) {
      // Perform a graph traversal (e.g., BFS or DFS) starting from 'from' OIDs,
      // stopping traversal at any 'not' OIDs.
      // Use a queue and a visited set. For each commit OID:
      // 1. Read the Commit object from storage.
      // 2. Yield the OID.
      // 3. Add its parentOids to the queue if not visited.
  }
  
  hashObject(content, type) { /* ... logic to compute SHA-1 of `type size\0content` ... */ }
  hashTree(entries) { /* ... logic to format entries as `mode path\0oid` and compute SHA-1 ... */ }
  hashCommit(commit) { /* ... logic to format commit details and compute SHA-1 ... */ }
}

// =================================================================
//  LAYER 4: THE PROJECT MANAGER (REPOSITORY)
// =================================================================

/** The central management unit for a Git project. Orchestrates high-level operations. */
export class Repository {
  constructor(bareRepo /* BareRepository */) { this.bareRepo = bareRepo; }

  static async init({ storage }) {
      const bareRepo = new BareRepository(storage);
      // Create initial HEAD pointing to an unborn branch.
      await bareRepo.symbolicRef('HEAD', 'refs/heads/main');
      return new Repository(bareRepo);
  }

  static async clone({ storage, url }) {
    const transport = GitTransport.connect({ url });
    const { refs, packfileStream } = await transport.negotiateAndFetch([]);
    const bareRepo = await BareRepository.fromPackfile(packfileStream, storage);
    for (const ref of refs) {
        if (ref instanceof DirectReference) await bareRepo.storage.writeRef(ref);
    }
    const headRef = refs.find(r => r.name === 'HEAD');
    if (headRef) await bareRepo.storage.writeRef(headRef);
    return new Repository(bareRepo);
  }

  async createPackfile(oids) {
    const builder = new PackfileBuilder();
    return builder.build(this, oids);
  }

  async branch(branchName, { from = 'HEAD' }) {
      const oid = (await this.bareRepo.resolveRef(from)).targetOid;
      await this.bareRepo.writeRef(`refs/heads/${branchName}`, oid);
  }

  async deleteBranch(branchName) {
      await this.bareRepo.storage.deleteRef(`refs/heads/${branchName}`);
  }

  async listBranches() {
      return (await this.bareRepo.listRefs('refs/heads/')).map(ref => ref.name);
  }

  async mergeBase(oid1, oid2) {
      // Use revList or a CommitGraphCache to perform graph traversal
      // from both oids simultaneously until a common ancestor is found.
  }

  remote(name, options) { return new Remote({ name, repository: this, ...options }); }
}

// =================================================================
//  LAYER 5: THE COMMUNICATION ENDPOINT OBJECT (REMOTE)
// =================================================================

/** Represents a configured remote endpoint. */
export class Remote {
  constructor({ name, repository }) { this.name = name; this.repo = repository; }

  async fetch(options) {
    const transport = GitTransport.connect({ /* get url from config */ });
    const remoteRefs = await transport.discover();
    const localOids = await this.repo.bareRepo.storage.listAllObjectOids();
    const packfileStream = await transport.negotiateAndFetch(localOids);
    await BareRepository.fromPackfile(packfileStream, this.repo.bareRepo.storage);
    // Update remote-tracking branches (e.g., refs/remotes/origin/main)
    for (const ref of remoteRefs) {
        if (ref.name.startsWith('refs/heads/')) {
            const remoteTrackingName = `refs/remotes/${this.name}/${ref.name.substring(11)}`;
            await this.repo.bareRepo.writeRef(remoteTrackingName, ref.targetOid);
        }
    }
  }

  async push(branchName, options) {
    const localRefName = `refs/heads/${branchName}`;
    const remoteTrackingRefName = `refs/remotes/${this.name}/${branchName}`;
    const localRef = await this.repo.bareRepo.resolveRef(localRefName);
    const remoteRef = await this.repo.bareRepo.resolveRef(remoteTrackingRefName);
    const oidsToPush = [];
    for await (const oid of this.repo.bareRepo.revList({ from: localRef.targetOid, not: remoteRef?.targetOid })) {
        oidsToPush.push(oid);
    }
    const packfileStream = await this.repo.createPackfile(oidsToPush);
    const transport = GitTransport.connect({ /* ... */ });
    const result = await transport.push(packfileStream, { updateRef: localRefName });
    if (result.ok) {
        await this.repo.bareRepo.updateRef(remoteTrackingRefName, localRef.targetOid, remoteRef?.targetOid);
    }
  }

  async ls() {
      const transport = GitTransport.connect({ /* ... */ });
      return transport.discover();
  }
}

// =================================================================
//  LAYER 6: THE USER SESSION (WORKTREE)
// =================================================================

export class Worktree {
  constructor({ name, repository /* Repository */ }) {
    this.name = name;
    this.repo = repository;
    this.storage = repository.bareRepo.storage;
  }

  // Abstracted working directory interaction
  async _readFromWorkdir(filepath) { /* ... read file from actual fs, memory, etc. ... */ }
  async _writeToWorkdir(filepath, content) { /* ... write file ... */ }
  async _getWorkdirStatus() { /* ... compare fs with index to find untracked/modified files ... */ }

  async add(filepath) {
    const content = await this._readFromWorkdir(filepath);
    const blobOid = await this.repo.bareRepo.writeObject('blob', content);
    const entry = new IndexEntry();
    entry.worktreeId = this.name;
    entry.path = filepath;
    entry.oid = blobOid;
    entry.stage = 0;
    // ... set metadata
    const currentIndex = await this.storage.readIndex(this.name);
    const newIndex = [...currentIndex.filter(e => e.path !== filepath), entry];
    await this.storage.writeIndexEntries(this.name, newIndex);
  }

  async rm(filepath) {
      const currentIndex = await this.storage.readIndex(this.name);
      const newIndex = currentIndex.filter(e => e.path !== filepath);
      await this.storage.writeIndexEntries(this.name, newIndex);
  }

  async commit({ message, author, committer }) {
    const indexEntries = await this.storage.readIndex(this.name);
    if (indexEntries.length === 0) throw new Error("Nothing to commit");
    const treeOid = await this.repo.bareRepo.writeTree(indexEntries);
    const headRef = await this.repo.bareRepo.resolveRef('HEAD');
    const parentOids = headRef ? [headRef.targetOid] : [];
    const commitOid = await this.repo.bareRepo.writeCommit({
      treeOid,
      parentOids,
      author,
      committer: committer || author,
      message,
    });
    const currentBranchRef = await this.repo.bareRepo.readRef('HEAD');
    await this.repo.bareRepo.writeRef(currentBranchRef.targetRef, commitOid);
  }
  
  async * log(options) {
      const head = await this.repo.bareRepo.resolveRef(options.ref || 'HEAD');
      for await (const oid of this.repo.bareRepo.revList({ from: head.targetOid })) {
          yield await this.repo.bareRepo.readObject(oid);
      }
  }

  async status() {
      const indexEntries = await this.storage.readIndex(this.name);
      const headCommitOid = (await this.repo.bareRepo.resolveRef('HEAD')).targetOid;
      const headCommit = await this.repo.bareRepo.readObject(headCommitOid);
      const headTree = await this.repo.bareRepo.readTree(headCommit.treeOid);
      // Diff HEAD tree vs index to find staged changes.
      const stagedChanges = this._diffTrees(headTree, indexEntries);
      // Diff index vs working directory to find unstaged changes.
      const unstagedChanges = await this._getWorkdirStatus();
      return { stagedChanges, unstagedChanges };
  }

  async merge(branchToMerge) {
      const head = await this.repo.bareRepo.resolveRef('HEAD');
      const other = await this.repo.bareRepo.resolveRef(`refs/heads/${branchToMerge}`);
      const baseOid = await this.repo.mergeBase(head.targetOid, other.targetOid);
      // Perform 3-way merge logic on trees (base, head, other).
      // For each file, compare versions. If no conflicts, update index.
      // If conflicts, create IndexEntry for stage 1 (base), 2 (head), and 3 (other).
      // After resolving, create a merge commit with two parents.
  }
  
  async pull(remoteName, branchName, options) {
      await this.repo.remote(remoteName).fetch();
      await this.merge(`${remoteName}/${branchName}`);
  }

  async checkout(ref) {
      const targetCommitOid = (await this.repo.bareRepo.resolveRef(ref)).targetOid;
      const targetCommit = await this.repo.bareRepo.readObject(targetCommitOid);
      const targetTree = await this.repo.bareRepo.readTree(targetCommit.treeOid);
      
      // Update index and working directory to match the targetTree.
      const newIndexEntries = [];
      for (const entry of targetTree.entries) {
          const blob = await this.repo.bareRepo.readObject(entry.oid);
          await this._writeToWorkdir(entry.path, blob.content);
          newIndexEntries.push({ worktreeId: this.name, path: entry.path, oid: entry.oid, stage: 0 });
      }
      await this.storage.writeIndexEntries(this.name, newIndexEntries);

      // Update HEAD to point to the new commit.
      await this.repo.bareRepo.writeRef('HEAD', targetCommitOid);
  }
}