export class Repository {
  constructor(bareRepo) {
    this.bareRepo = bareRepo;
    /** @type {Map<string, Remote>} */
    this.remotes = new Map();
  }

  /**
   * Adds a new remote to this repository's configuration.
   * @param {string} name - The name of the remote (e.g., 'origin').
   * @param {object} config - The connection configuration for the remote.
   */
  async addRemote(name, config) {
    const remote = new Remote(name, config);
    this.remotes.set(name, remote);
    // In a real implementation, this would also be persisted in the bareRepo's storage
  }

  /**
   * The generic synchronization logic. Fetches from a source and updates a destination.
   * @param {GitTransport} source - The transport to fetch from.
   * @param {GitTransport} destination - The transport to push updates to.
   */
  async _synchronize(source, destination) {
    // 1. Discover refs from both endpoints
    const sourceRefs = await parseDiscoveryResponse(await source.discover());
    const destRefs = await parseDiscoveryResponse(await destination.discover());

    // 2. Determine what the destination needs
    const { wants, haves } = calculateDelta(sourceRefs, destRefs);
    if (wants.length === 0) {
      console.log("Repositories are already in sync.");
      return;
    }

    // 3. Fetch a packfile of missing objects from the source
    const negotiationBody = createFetchNegotiationBody({ wants, haves });
    const packfileStream = await source.negotiateAndFetch(negotiationBody);

    // 4. Create the push request body for the destination
    const pushBody = createPushBodyFromPackfile(packfileStream, { wants, oldOids: destRefs });

    // 5. Push the updates to the destination
    const resultStream = await destination.push(pushBody);
    const { ok, error } = await parsePushResponse(resultStream);
    if (!ok) throw new Error(error);
  }

  /**
   * Fetches updates from a named remote into this repository.
   * @param {string} remoteName
   */
  async fetch(remoteName) {
    if (!this.remotes.has(remoteName)) throw new Error(`Remote '${remoteName}' not found.`);
    
    const sourceTransport = this.remotes.get(remoteName).connect();
    
    // Create a transport that represents THIS repository (the destination)
    const selfTransport = new SqlTransport({ client: this.bareRepo.storage.db }); // Assuming SqlStorage

    console.log(`Fetching from remote '${remoteName}' (${sourceTransport.constructor.name}) into local repository...`);
    await this._synchronize(sourceTransport, selfTransport);
  }

  /**
   * Pushes a branch from this repository to a named remote.
   * @param {string} remoteName
   * @param {string} branchName
   */
  async push(remoteName, branchName) {
    if (!this.remotes.has(remoteName)) throw new Error(`Remote '${remoteName}' not found.`);
    
    // This repository is the source
    const selfTransport = new SqlTransport({ client: this.bareRepo.storage.db });
    
    // The remote is the destination
    const destinationTransport = this.remotes.get(remoteName).connect();

    console.log(`Pushing to remote '${remoteName}' (${destinationTransport.constructor.name}) from local repository...`);
    // Note: The synchronize logic needs to be adapted for push (only sending specific branches)
    // but the principle of using two transports remains the same.
    // ... push logic ...
  }
  
  // ... all other methods like createWorktree ...
}