/**
 * Represents an isolated worktree and index (a single checkout).
 * All operations are performed against a backing GitBareRepository.
 */
export class GitWorktree {
    /**
     * @param {object} options
     * @param {string} options.name
     * @param {GitBareRepository} options.repository
     * @param {string[]} [options.sparseConfig] - The paths for sparse checkout.
     */
    constructor({ name, repository, sparseConfig }) {
        this.name = name;
        this.repo = repository;
        this.storage = repository.storage;
        this.sparseConfig = sparseConfig; // Store the sparse configuration
    }
    // --- PRIVATE HELPERS FOR NAMESPACED KEYS ---
    _headKey() { return `worktrees/${this.name}/HEAD`; }
    _indexKey() { return `worktrees/${this.name}/INDEX`; }
    _worktreeKey() { return `worktrees/${this.name}/WORKTREE`; }

    // --- WORKFLOW METHODS (Same API as before, different implementation) ---

    async add(filepath) { /* ... modifies this._indexKey() ... */ }
    async commit({ message, author }) {
        // 1. Create tree from this worktree's index
        const index = await this.storage.read(this._indexKey());
        const treeOid = await GitTree.write(this.repo, index); // Use repo to write object

        // 2. Get parent commit from this worktree's HEAD
        const parentOid = await this.repo.resolveRef(await this.storage.read(this._headKey()));

        // 3. Create and write commit object using the repo
        const commitOid = await GitCommit.write(this.repo, { /* ... */ tree: treeOid, parent: [parentOid] });
        
        // 4. Update the actual branch ref in the shared repo
        const currentBranchRef = (await this.storage.read(this._headKey())).substring(5);
        await this.repo.writeRef(currentBranchRef, commitOid);

        return commitOid;
    }
    async status() { /* ... compares HEAD, INDEX, and WORKTREE for this session ... */ }
    async writeFile(filepath, content) {
        // Writes blob to the shared repo
        const blobOid = await GitBlob.write(this.repo, content);
        // Updates this worktree's WORKTREE state
        const worktree = await this.storage.read(this._worktreeKey());
        // ... update worktree with new blobOid ...
        await this.storage.write(this._worktreeKey(), worktree);
    }
    /**
     * Switches this worktree to a branch, applying sparse checkout rules if configured.
     * @param {string} branchName
     */
    async switchBranch(branchName) {
        const branchRef = `refs/heads/${branchName}`;
        const oid = await this.repo.resolveRef(branchRef);
        if (!oid) throw new Error(`Branch not found: ${branchName}`);

        const commit = await this.repo.readObject(oid);
        // Get the full tree from the commit.
        const fullTree = await this.repo.readObject(commit.tree);

        let worktreeState;
        if (this.sparseConfig) {
            // Apply the sparse filter to the full tree.
            console.log(`Applying sparse filter for paths:`, this.sparseConfig);
            worktreeState = fullTree.filter(entry => {
            // Simple prefix-based filtering. A real implementation is more complex (cone patterns).
            return this.sparseConfig.some(prefix => entry.path.startsWith(prefix));
            });
        } else {
            // If not sparse, the worktree state is the full tree.
            worktreeState = fullTree;
        }

        // Update this worktree's state in storage.
        await this.storage.write(this._headKey(), `ref: ${branchRef}`);
        await this.storage.write(this._indexKey(), worktreeState); // Index can also be sparse
        await this.storage.write(this._worktreeKey(), worktreeState);
    }
    /**
     * Initializes submodules by reading the .gitmodules file and updating the repository's configuration.
     * This step is required before submodules can be cloned.
     *
     * @returns {Promise<void>}
     */
    async submoduleInit() {
        console.log(`[${this.name}] Initializing submodules...`);
        const worktree = await this.storage.read(this._worktreeKey());
        const gitmodulesEntry = worktree.find(e => e.path === '.gitmodules');

        if (!gitmodulesEntry) {
            console.log(`[${this.name}] No .gitmodules file found.`);
            return;
        }

        const gitmodulesBlob = await this.repo.readObject(gitmodulesEntry.oid);
        const submoduleConfigs = parseGitmodules(gitmodulesBlob.object); // Assumes a parser

        for (const config of submoduleConfigs) {
            // Write the submodule's URL to the shared repository config.
            // Git stores this so it knows where to clone from.
            await this.repo.setConfig(`submodule.${config.path}.url`, config.url);
            console.log(`   - Configured submodule '${config.path}' with URL ${config.url}`);
        }
    }

    /**
     * Clones and checks out all configured submodules to the commit specified by the parent repository.
     * This is the primary method for fetching submodule content.
     *
     * @param {object} options
     * @param {(path: string) => GitStorage} options.storageFactory - A function that returns a new, empty storage instance for a given submodule path.
     * @returns {Promise<void>}
     */
    async submoduleUpdate({ storageFactory }) {
        console.log(`[${this.name}] Updating submodules...`);
        const worktree = await this.storage.read(this._worktreeKey());

        for (const entry of worktree) {
            if (entry.mode !== '160000') continue; // Only process gitlink entries

            const path = entry.path;
            const commitOid = entry.oid; // The commit the parent wants this submodule to be at

            // 1. Get the submodule's URL from the config we set in `init`.
            const url = await this.repo.getConfig(`submodule.${path}.url`);
            if (!url) {
            console.warn(`Skipping submodule '${path}': not initialized. Run submoduleInit() first.`);
            continue;
            }

            console.log(`   - Updating submodule '${path}' to commit ${commitOid.slice(0, 7)}`);
            
            // 2. Get a dedicated storage instance for this submodule.
            // THIS IS CRUCIAL to prevent object collision with the parent.
            const submoduleStorage = storageFactory(path);

            // 3. Clone the submodule repository (this is a network operation).
            // We only need the single commit we're checking out, so it's a shallow clone.
            const subBareRepo = await GitBareRepository.clone({
            url,
            storage: submoduleStorage,
            singleBranch: false, // We don't care about branches, we want a specific commit
            depth: 1, // A shallow clone is most efficient
            want: [commitOid] // Tell the server the exact commit we need
            });

            // 4. Create a worktree for the submodule and check it out to the correct commit.
            const subWorktree = await subBareRepo.createWorktree(`detached-HEAD-for-${path}`);
            await subWorktree.checkoutCommit(commitOid); // New method needed for this

            // 5. Cache the live submodule worktree instance for later access.
            this.submodules.set(path, subWorktree);
        }
    }

    /**
     * Helper method to checkout a specific commit (detached HEAD state).
     * @param {string} commitOid
     */
    async checkoutCommit(commitOid) {
        const commit = await this.repo.readObject(commitOid);
        const tree = await this.repo.readObject(commit.tree);
        await this.storage.write(this._headKey(), commitOid); // Detached HEAD
        await this.storage.write(this._indexKey(), tree);
        await this.storage.write(this._worktreeKey(), tree);
    }
}