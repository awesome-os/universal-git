// RefManager import removed - using Repository.resolveRef/writeRef methods instead
import { WorkdirManager } from '../git/worktree/WorkdirManager.ts'
import { readObject } from '../git/objects/readObject.ts'
import { parse as parseCommit } from './parsers/Commit.ts'
import { SparseCheckoutManager } from './filesystem/SparseCheckoutManager.ts'
import { CheckoutConflictError } from '../errors/CheckoutConflictError.ts'
// StagingArea removed - use Repository.readIndexDirect/writeIndexDirect directly
import type { Repository } from './Repository.ts'
import type { ProgressCallback } from '../git/remote/types.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'

/**
 * Worktree - Represents a working tree (linked worktrees support)
 * Encapsulates the working directory and its associated git directory
 * Each worktree has its own staging area (index) and cache context
 * 
 * This class is a thin wrapper that delegates to GitWorktreeBackend implementations,
 * enabling chainable operations and backend-agnostic worktree operations.
 */
export class Worktree {
  private readonly repo: Repository
  private readonly backend: GitWorktreeBackend | null
  public readonly dir: string
  private _gitdir: string | null
  private _name: string | null
  // StagingArea removed - Worktree is now stateless, delegates to Repository

  constructor(
    repo: Repository,
    dir: string,
    gitdir: string | null = null,
    name: string | null = null,
    backend: GitWorktreeBackend | null = null
  ) {
    this.repo = repo
    this.dir = dir
    this._gitdir = gitdir
    this._name = name
    this.backend = backend
  }

  /**
   * Gets the Repository instance this worktree belongs to
   */
  get repository(): Repository {
    return this.repo
  }

  /**
   * Gets the git directory for this worktree
   * For main worktree: returns main repo's .git
   * For linked worktree: returns .git/worktrees/<name>
   */
  async getGitdir(): Promise<string> {
    if (this._gitdir) {
      return this._gitdir
    }
    // Resolve from repository
    this._gitdir = await this.repo.getGitdir()
    return this._gitdir
  }

  /**
   * Gets the git directory as a property
   */
  get gitdir(): Promise<string> {
    return this.getGitdir()
  }

  /**
   * Gets the worktree name
   * Returns null for the main worktree
   */
  getName(): string | null {
    return this._name
  }

  /**
   * Checks if this is the main worktree
   */
  async isMain(): Promise<boolean> {
    const mainGitdir = await this.repo.getGitdir()
    const worktreeGitdir = await this.getGitdir()
    return worktreeGitdir === mainGitdir
  }


  /**
   * Checks out a branch, tag, or commit in this worktree
   * Updates HEAD, working directory, and index
   * 
   * @param ref - Branch name, tag name, or commit SHA
   * @param options - Checkout options
   */
  async checkout(
    ref: string,
    options: {
      filepaths?: string[]
      force?: boolean
      noCheckout?: boolean
      noUpdateHead?: boolean
      dryRun?: boolean
      sparsePatterns?: string[]
      onProgress?: ProgressCallback
      remote?: string
      track?: boolean
      oldOid?: string // Optional old HEAD OID for reflog (from checkout command)
    } = {}
  ): Promise<void> {
    // CRITICAL: Use main repository's gitdir for object access
    // Worktrees share the same object database as the main repository
    const mainGitdir = await this.repo.getGitdir()
    const worktreeGitdir = await this.getGitdir()
    const {
      filepaths,
      force = false,
      noCheckout = false,
      noUpdateHead = false,
      dryRun = false,
      sparsePatterns,
      onProgress,
      remote = 'origin',
      track = true,
      oldOid: providedOldOid,
    } = options

    // Resolve ref to commit OID using Repository methods
    let oid: string
    let createdFromRemote = false
    try {
      // First check if it exists as a local branch (refs/heads/...)
      let localBranchExists = false
      try {
        oid = await this.repo.resolveRef(`refs/heads/${ref}`)
        localBranchExists = true
      } catch {
        // Local branch doesn't exist, try to resolve as-is (might be a tag, remote branch, etc.)
        oid = await this.repo.resolveRef(ref)
        // Check if it resolved to a remote tracking branch
        try {
          const remoteRef = `refs/remotes/${remote}/${ref}`
          const remoteOid = await this.repo.resolveRef(remoteRef)
          if (remoteOid === oid) {
            // The ref resolved to a remote tracking branch, create local branch and set up tracking
            createdFromRemote = true
            if (track) {
              // Set up remote tracking branch
              const { ConfigAccess } = await import('../utils/configAccess.ts')
              const configAccess = new ConfigAccess(this.repo.fs, mainGitdir)
              await configAccess.setConfigValue(`branch.${ref}.remote`, remote, 'local')
              await configAccess.setConfigValue(`branch.${ref}.merge`, `refs/heads/${ref}`, 'local')
            }
            // Create a new branch that points at that same commit
            if (process.env.DEBUG_CLONE_REFS === 'true') {
              console.log(`[DEBUG Worktree.checkout] Creating branch 'refs/heads/${ref}' from remote tracking branch 'refs/remotes/${remote}/${ref}' (oid: ${oid.substring(0, 8)})`)
            }
            await this.repo.writeRef(`refs/heads/${ref}`, oid)
          }
        } catch {
          // Not a remote tracking branch, continue with normal resolution
        }
      }
      
      // If local branch exists, check if we should set up tracking config
      if (localBranchExists && track) {
        try {
          const remoteRef = `refs/remotes/${remote}/${ref}`
          const remoteOid = await this.repo.resolveRef(remoteRef)
          // Check if tracking config is already set (using worktree-aware function)
          const { getBranchTracking, setBranchTracking } = await import('../git/config/branchTracking.ts')
          const gitdir = await this.getGitdir()
          const existing = await getBranchTracking({ fs: this.repo.fs, gitdir, branchName: ref })
          if (!existing) {
            // Tracking config not set, set it up (automatically uses worktree config if in worktree)
            await setBranchTracking({
              fs: this.repo.fs,
              gitdir,
              branchName: ref,
              remote,
              merge: `refs/heads/${ref}`,
            })
          }
        } catch {
          // Remote tracking branch doesn't exist, that's okay
        }
      }
    } catch (err) {
      if (ref === 'HEAD') throw err
      // If `ref` doesn't exist, try to create a new remote tracking branch
      const remoteRef = `${remote}/${ref}`
      try {
        oid = await this.repo.resolveRef(remoteRef)
        createdFromRemote = true
        if (track) {
          // Set up remote tracking branch (automatically uses worktree config if in worktree)
          const { setBranchTracking } = await import('../git/config/branchTracking.ts')
          const worktreeGitdir = await this.getGitdir()
          await setBranchTracking({
            fs: this.repo.fs,
            gitdir: worktreeGitdir,
            branchName: ref,
            remote,
            merge: `refs/heads/${ref}`,
          })
        }
        // Create a new branch that points at that same commit
        if (process.env.DEBUG_CLONE_REFS === 'true') {
          console.log(`[DEBUG Worktree.checkout] Creating branch 'refs/heads/${ref}' from remote ref '${remoteRef}' (oid: ${oid.substring(0, 8)})`)
        }
        await this.repo.writeRef(`refs/heads/${ref}`, oid)
      } catch (remoteErr) {
        throw err
      }
    }

    // Get commit to get tree OID
    // Use main gitdir for object access (worktrees share object database)
    const { object: commitObject } = await readObject({ fs: this.repo.fs, cache: this.repo.cache, gitdir: mainGitdir, oid })
    const commit = parseCommit(commitObject)
    const treeOid = commit.tree

    // Load sparse checkout patterns if enabled
    let finalSparsePatterns = sparsePatterns
    if (!finalSparsePatterns) {
      try {
        const patterns = await SparseCheckoutManager.loadPatterns({ fs: this.repo.fs, gitdir: worktreeGitdir })
        if (patterns.length > 0) {
          finalSparsePatterns = patterns
        }
      } catch {
        // Sparse checkout not enabled
      }
    }

    // Update HEAD in worktree's gitdir (not main repo's HEAD)
    if (!noUpdateHead) {
      // Special case: if ref is 'HEAD', preserve the current HEAD state
      // (either symbolic or detached) since we're already on HEAD
      if (ref === 'HEAD') {
        // Check if HEAD is currently a symbolic ref
        const { readSymbolicRef } = await import('../git/refs/readRef.ts')
        try {
          const symbolicTarget = await readSymbolicRef({ fs: this.repo.fs, gitdir: worktreeGitdir, ref: 'HEAD' })
          if (symbolicTarget) {
            // HEAD is symbolic, preserve it
            // No need to update since we're already on HEAD
          } else {
            // HEAD is detached or doesn't exist, set it to the OID
            await this.repo.writeRef('HEAD', oid)
          }
        } catch {
          // HEAD doesn't exist, set it to the OID
          await this.repo.writeRef('HEAD', oid)
        }
      } else {
        // Check if ref is a tag, branch, or OID
        let isTag = false
        let isBranch = false
        
        if (ref.startsWith('refs/tags/')) {
          isTag = true
        } else if (ref.startsWith('refs/heads/') || ref.startsWith('refs/remotes/')) {
          isBranch = true
        } else if (ref.match(/^[0-9a-f]{40}$/)) {
          // It's an OID, set as detached HEAD
          isTag = false
          isBranch = false
        } else {
          // Try to determine if it's a tag or branch by checking what exists
          try {
            // Check if it's a tag
            await this.repo.resolveRef(`refs/tags/${ref}`)
            isTag = true
          } catch {
            // Not a tag, check if it's a branch
            try {
              await this.repo.resolveRef(`refs/heads/${ref}`)
              isBranch = true
            } catch {
              // Neither tag nor branch exists, but we already resolved it above
              // If we got here, it might be a remote tracking branch or something else
              // Default to treating as branch if it looks like a branch name
              if (!ref.startsWith('refs/')) {
                isBranch = true
              }
            }
          }
        }
        
        if (isTag) {
          // For tags, set HEAD as detached (direct OID)
          await this.repo.writeRef('HEAD', oid)
        } else if (isBranch) {
          // Set HEAD as symbolic ref pointing to the branch
          // Use provided oldOid if available (from checkout command), otherwise read it
          // CRITICAL: We must read oldOid BEFORE any HEAD modifications, so use providedOldOid if available
          // IMPORTANT: If providedOldOid is passed, use it directly - don't try to read HEAD again
          // The checkout command already read oldOid before any modifications
          const oldOidToUse = providedOldOid
          // Pass oldOid to writeSymbolicRefDirect (even if undefined, it will handle it)
          await this.repo.writeSymbolicRefDirect('HEAD', `refs/heads/${ref}`, oldOidToUse)
        } else {
          // For full refs or OIDs, set HEAD as detached (direct OID)
          await this.repo.writeRef('HEAD', oid)
        }
      }
    }

    // Update working directory and index
    if (!noCheckout) {
      // Read the index once to pass to analyzeCheckout
      // Use worktree gitdir for index (each worktree has its own index)
      const gitIndex = await this.repo.readIndexDirect(false, true, worktreeGitdir)
      
      if (dryRun) {
        // Just analyze, don't execute
        // Use main gitdir for object access (worktrees share object database)
        const operations = await WorkdirManager.analyzeCheckout({
          fs: this.repo.fs,
          dir: this.dir,
          gitdir: mainGitdir, // Use main gitdir for object access
          treeOid,
          filepaths,
          force,
          sparsePatterns: finalSparsePatterns,
          cache: this.repo.cache,
          index: gitIndex,
        })
        const conflicts = operations.filter(op => op[0] === 'conflict').map(op => op[1] as string)
        if (conflicts.length > 0) {
          throw new CheckoutConflictError(conflicts)
        }
      } else {
        // Use main gitdir for object access (worktrees share object database)
        await WorkdirManager.checkout({
          fs: this.repo.fs,
          dir: this.dir,
          gitdir: mainGitdir, // Use main gitdir for object access
          treeOid,
          filepaths,
          force,
          sparsePatterns: finalSparsePatterns,
          cache: this.repo.cache,
          onProgress,
        })
        
        // Run post-checkout hook (after successful checkout)
        try {
          const { runHook } = await import('../git/hooks/runHook.ts')
          
          // Determine if this was a branch checkout (1) or file checkout (0)
          const isBranchCheckout = filepaths == null || filepaths.length === 0 ? 1 : 0
          
          // Get branch name if it's a branch checkout
          let branchName: string | undefined
          if (isBranchCheckout && ref) {
            branchName = ref.startsWith('refs/heads/') 
              ? ref.replace('refs/heads/', '')
              : ref.startsWith('refs/')
              ? ref.replace(/^refs\/[^/]+\//, '')
              : ref
          }
          
          // Read old HEAD OID for post-checkout hook if not provided
          let oldOidForHook: string | undefined = providedOldOid
          if (!oldOidForHook) {
            try {
              oldOidForHook = await this.repo.resolveRef('HEAD')
            } catch {
              // HEAD doesn't exist, use zero OID
              oldOidForHook = '0000000000000000000000000000000000000000'
            }
          }
          
          await runHook({
            fs: this.repo.fs,
            gitdir: worktreeGitdir,
            hookName: 'post-checkout',
            context: {
              gitdir: worktreeGitdir,
              workTree: this.dir,
              previousHead: oldOidForHook || '0000000000000000000000000000000000000000',
              newHead: oid,
              branch: branchName,
            },
          })
        } catch (hookError: any) {
          // Post-checkout hook failures don't abort the checkout (it's already done)
          // But we log the error for debugging
          if (process.env.DEBUG_HOOKS === 'true') {
            console.warn(`post-checkout hook failed: ${hookError.stderr || hookError.message}`)
          }
        }
      }
    }
  }

  // ============================================================================
  // Backend Delegation Methods (Phase 0A.1)
  // ============================================================================
  // These methods delegate to GitWorktreeBackend when available,
  // falling back to direct command calls for backward compatibility

  /**
   * Initialize sparse checkout
   * @param cone - Use cone mode (default: false)
   * @returns This worktree instance for chaining
   */
  async sparseCheckoutInit(cone: boolean = false): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      await this.backend.sparseCheckoutInit(gitdir, cone)
    } else {
      // Fallback to direct command call
      const { sparseCheckout } = await import('../commands/sparseCheckout.ts')
      await sparseCheckout({
        repo: this.repo,
        gitdir,
        init: true,
        cone,
      })
    }
    return this // Return self for chaining
  }

  /**
   * Set sparse checkout patterns
   * @param patterns - Array of patterns to include/exclude
   * @param cone - Use cone mode (optional, uses config if not provided)
   * @returns This worktree instance for chaining
   */
  async sparseCheckoutSet(patterns: string[], cone?: boolean): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      const headOid = await this.repo.resolveRef('HEAD')
      const { object: commitObject } = await readObject({
        fs: this.repo.fs,
        cache: this.repo.cache,
        gitdir,
        oid: headOid,
      })
      const commit = parseCommit(commitObject)
      await this.backend.sparseCheckoutSet(gitdir, patterns, commit.tree, cone)
    } else {
      // Fallback to direct command call
      const { sparseCheckout } = await import('../commands/sparseCheckout.ts')
      await sparseCheckout({
        repo: this.repo,
        gitdir,
        set: patterns,
        cone,
      })
    }
    return this // Return self for chaining
  }

  /**
   * List current sparse checkout patterns
   * @returns Array of patterns
   */
  async sparseCheckoutList(): Promise<string[]> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      return await this.backend.sparseCheckoutList(gitdir)
    } else {
      // Fallback to direct command call
      const { sparseCheckout } = await import('../commands/sparseCheckout.ts')
      return await sparseCheckout({
        repo: this.repo,
        gitdir,
        list: true,
      })
    }
  }

  /**
   * Add files to the staging area
   * @param filepaths - Files or directories to add
   * @param options - Add options (force, update, etc.)
   * @returns This worktree instance for chaining
   */
  async add(
    filepaths: string | string[],
    options?: { force?: boolean; update?: boolean }
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      await this.backend.add(gitdir, filepaths, options)
    } else {
      // Fallback to direct command call
      const { add } = await import('../commands/add.ts')
      await add({
        repo: this.repo,
        dir: this.dir,
        gitdir,
        filepath: filepaths,
        ...options,
      })
    }
    return this // Return self for chaining
  }

  /**
   * Remove files from the staging area and working directory
   * @param filepaths - Files to remove
   * @param options - Remove options (cached, force, etc.)
   * @returns This worktree instance for chaining
   */
  async remove(
    filepaths: string | string[],
    options?: { cached?: boolean; force?: boolean }
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      await this.backend.remove(gitdir, filepaths, options)
    } else {
      // Fallback to direct command call
      const { remove } = await import('../commands/remove.ts')
      await remove({
        repo: this.repo,
        dir: this.dir,
        gitdir,
        filepath: filepaths,
        ...options,
      })
    }
    return this // Return self for chaining
  }

  /**
   * Create a commit from the current staging area
   * @param message - Commit message
   * @param options - Commit options (author, committer, noVerify, etc.)
   * @returns Commit OID
   */
  async commit(
    message: string,
    options?: {
      author?: Partial<import('../models/GitCommit.ts').Author>
      committer?: Partial<import('../models/GitCommit.ts').Author>
      noVerify?: boolean
      amend?: boolean
      ref?: string
      parent?: string[]
      tree?: string
    }
  ): Promise<string> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      return await this.backend.commit(gitdir, message, options)
    } else {
      // Fallback to direct command call
      const { commit } = await import('../commands/commit.ts')
      return await commit({
        repo: this.repo,
        dir: this.dir,
        gitdir,
        message,
        ...options,
      })
    }
  }

  /**
   * Switch to a different branch (alias for checkout with branch switching)
   * @param branch - Branch name to switch to
   * @param options - Switch options (create, force, etc.)
   * @returns This worktree instance for chaining
   */
  async switch(
    branch: string,
    options?: {
      create?: boolean
      force?: boolean
      track?: boolean
      remote?: string
    }
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      await this.backend.switch(gitdir, branch, options)
    } else {
      // Fallback to checkout with branch switching logic
      // For now, just use checkout - a proper switch command can be added later
      await this.checkout(branch, {
        force: options?.force,
        track: options?.track,
        remote: options?.remote,
      })
    }
    return this // Return self for chaining
  }

  /**
   * Get the status of a single file in the working directory
   * @param filepath - File path relative to working directory root
   * @returns File status
   */
  async status(filepath: string): Promise<import('../commands/status.ts').FileStatus> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      return await this.backend.status(gitdir, filepath)
    } else {
      // Fallback to direct command call
      const { status } = await import('../commands/status.ts')
      return await status({
        repo: this.repo,
        dir: this.dir,
        gitdir,
        filepath,
      })
    }
  }

  /**
   * Get status matrix (more detailed than status) for multiple files
   * @param options - Status matrix options (filepaths, etc.)
   * @returns Status matrix array
   */
  async statusMatrix(
    options?: { filepaths?: string[] }
  ): Promise<import('../commands/statusMatrix.ts').StatusRow[]> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      return await this.backend.statusMatrix(gitdir, options)
    } else {
      // Fallback to direct command call
      const { statusMatrix } = await import('../commands/statusMatrix.ts')
      return await statusMatrix({
        repo: this.repo,
        dir: this.dir,
        gitdir,
        ...options,
      })
    }
  }

  /**
   * Reset the working directory and/or index to a specific commit
   * @param ref - Commit to reset to (default: HEAD)
   * @param mode - Reset mode: 'soft', 'mixed', 'hard' (default: 'mixed')
   * @returns This worktree instance for chaining
   */
  async reset(
    ref: string = 'HEAD',
    mode: 'soft' | 'mixed' | 'hard' = 'mixed'
  ): Promise<Worktree> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      await this.backend.reset(gitdir, ref, mode)
    } else {
      // Fallback to direct command call
      const { reset } = await import('../commands/reset.ts')
      await reset({
        repo: this.repo,
        dir: this.dir,
        gitdir,
        ref,
        mode,
      })
    }
    return this // Return self for chaining
  }

  /**
   * Show changes between commits, commit and working tree, etc.
   * @param options - Diff options
   * @returns Diff result
   */
  async diff(
    options?: {
      ref?: string
      filepaths?: string[]
      cached?: boolean
    }
  ): Promise<import('../commands/diff.ts').DiffResult> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      return await this.backend.diff(gitdir, options)
    } else {
      // Fallback to direct command call
      const { diff } = await import('../commands/diff.ts')
      return await diff({
        repo: this.repo,
        dir: this.dir,
        gitdir,
        ...options,
      })
    }
  }

  /**
   * Merge trees with index management and worktree file writing
   * @param ourOid - Our tree OID
   * @param baseOid - Base tree OID
   * @param theirOid - Their tree OID
   * @param options - Merge options
   * @returns Merged tree OID or MergeConflictError
   */
  async mergeTree(
    ourOid: string,
    baseOid: string,
    theirOid: string,
    options?: {
      ourName?: string
      baseName?: string
      theirName?: string
      dryRun?: boolean
      abortOnConflict?: boolean
      mergeDriver?: import('../git/merge/types.ts').MergeDriverCallback
    }
  ): Promise<string | import('../errors/MergeConflictError.ts').MergeConflictError> {
    const gitdir = await this.getGitdir()
    if (this.backend) {
      return await this.backend.mergeTree(gitdir, ourOid, baseOid, theirOid, options)
    } else {
      // Fallback to direct command call
      const { mergeTree } = await import('../git/merge/mergeTree.ts')
      const index = await this.repo.readIndexDirect(false, true, gitdir)
      return await mergeTree({
        repo: this.repo,
        index,
        ourOid,
        baseOid,
        theirOid,
        ...options,
      })
    }
  }
}

