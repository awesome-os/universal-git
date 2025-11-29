import type { Repository } from './Repository.ts'
import type { ProgressCallback } from '../git/remote/types.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'

/**
 * Checks out a branch, tag, or commit
 */
export async function checkout(
  this: Repository,
  refOrWorktree: string | GitWorktreeBackend,
  options: {
    ref?: string
    filepaths?: string[]
    force?: boolean
    noCheckout?: boolean
    noUpdateHead?: boolean
    dryRun?: boolean
    sparsePatterns?: string[]
    onProgress?: ProgressCallback
    remote?: string
    track?: boolean
  } = {}
): Promise<void> {
  const repo = this as any
  const opts = options || {}
  
  // Overload: checkout(WorktreeBackend, options)
  if (typeof refOrWorktree !== 'string') {
    const worktreeBackend = refOrWorktree
    const gitdir = await this.getGitdir()
    
    // Set the WorktreeBackend as the main worktree
    repo._worktreeBackend = worktreeBackend
    if (worktreeBackend.setRepository) {
      (worktreeBackend as any).setRepository(this)
    }
    
    // Create Worktree instance
    const { Worktree } = await import('../core-utils/Worktree.ts')
    repo._worktree = new Worktree(this, '', gitdir, null, worktreeBackend)

    // Ensure index file exists when converting from bare to non-bare
    try {
      await repo._gitBackend.readIndex()
    } catch {
      // Index file doesn't exist, create an empty one
      const { GitIndex } = await import('../git/index/GitIndex.ts')
      const emptyIndex = new GitIndex()
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      const buffer = await emptyIndex.toBuffer(await repo._gitBackend.getObjectFormat(repo.cache))
      await repo._gitBackend.writeIndex(buffer)
    }

    // Determine which ref to checkout
    let targetRef: string
    if (opts.ref) {
      targetRef = opts.ref
    } else {
      // Try to get current branch from HEAD
      try {
        const headRef = await repo._gitBackend.readSymbolicRef('HEAD')
        if (headRef && headRef.startsWith('refs/heads/')) {
          targetRef = headRef
        } else {
          // HEAD is detached or doesn't exist, use default branch
          let defaultBranch = 'master'
          try {
            const configValue = await this.getConfig().then((c: any) => c.get('init.defaultBranch'))
            if (configValue) {
              defaultBranch = configValue as string
            }
          } catch {
            // Use default
          }
          targetRef = defaultBranch
        }
      } catch {
        // HEAD doesn't exist, use default branch
        let defaultBranch = 'master'
        try {
          const configValue = await this.getConfig().then((c: any) => c.get('init.defaultBranch'))
          if (configValue) {
            defaultBranch = configValue as string
          }
        } catch {
          // Use default
        }
        targetRef = defaultBranch
      }
    }
    
    // Normalize ref (e.g., 'main' -> 'refs/heads/main')
    const normalizedRef = targetRef.startsWith('refs/') ? targetRef : `refs/heads/${targetRef}`
    
    // Check if repository is empty (no commits)
    let isEmpty = false
    try {
      const refOid = await this.resolveRef(normalizedRef)
      if (refOid) {
        // Check if commit exists
        try {
          await repo._gitBackend.readObject(refOid, 'content')
          isEmpty = false
        } catch {
          isEmpty = true
        }
      } else {
        isEmpty = true
      }
    } catch {
      isEmpty = true
    }
    
    if (isEmpty) {
      // Empty repository: create clean staging area
      const { GitIndex } = await import('../git/index/GitIndex.ts')
      const emptyIndex = new GitIndex()
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      const buffer = await emptyIndex.toBuffer(await repo._gitBackend.getObjectFormat(repo.cache))
      await repo._gitBackend.writeIndex(buffer)
      
      // Set HEAD to point to the specified ref
      if (normalizedRef.startsWith('refs/heads/')) {
        await repo._gitBackend.writeSymbolicRef('HEAD', `ref: ${normalizedRef}`)
      } else {
        await repo._gitBackend.writeSymbolicRef('HEAD', normalizedRef)
      }
    } else {
      // Repository has commits: perform normal checkout
      const { _checkout } = await import('../commands/checkout.ts')
      
      await _checkout({
        gitBackend: repo._gitBackend,
        worktreeBackend: worktreeBackend,
        fs: repo.fs,
        cache: repo.cache,
        gitdir,
        ref: targetRef,
        filepaths: options.filepaths,
        force: options.force,
        noCheckout: options.noCheckout,
        noUpdateHead: options.noUpdateHead,
        dryRun: options.dryRun,
        sparsePatterns: options.sparsePatterns,
        onProgress: options.onProgress,
        remote: options.remote || 'origin',
        track: options.track !== false,
      })
    }
    
    return
  }
  
  // Overload: checkout(ref, options)
  const ref = refOrWorktree
  // We need to implement isBare check
  if (!repo._worktreeBackend) {
    throw new Error('Cannot checkout: worktreeBackend is required')
  }
  await repo._gitBackend.checkout(repo._worktreeBackend, ref, opts)
}

/**
 * Create a new branch
 */
export async function branch(
  this: Repository,
  branch: string,
  options: {
    checkout?: boolean
    ref?: string
    force?: boolean
  } = {}
): Promise<void> {
  const { branch: _branch } = await import('../commands/branch.ts')
  const gitdir = await this.getGitdir()
  return _branch({
    repo: this,
    fs: this.fs,
    gitdir,
    cache: this.cache,
    ref: branch,
    checkout: options.checkout,
    startPoint: options.ref,
    force: options.force,
  })
}

/**
 * Get the current branch name
 */
export async function currentBranch(this: Repository): Promise<string | null> {
  const { currentBranch: _currentBranch } = await import('../commands/currentBranch.ts')
  const gitdir = await this.getGitdir()
  return _currentBranch({
    repo: this,
    fs: this.fs,
    gitdir,
    cache: this.cache,
  })
}

/**
 * List all branches
 */
export async function listBranches(
  this: Repository,
  options: {
    remote?: boolean
  } = {}
): Promise<string[]> {
  const { listBranches: _listBranches } = await import('../commands/listBranches.ts')
  const gitdir = await this.getGitdir()
  return _listBranches({
    repo: this,
    fs: this.fs,
    gitdir,
    cache: this.cache,
    remote: options.remote,
  })
}

/**
 * Resolve a reference to an OID
 */
export async function resolveRef(this: Repository, ref: string): Promise<string> {
  const oid = await (this as any)._gitBackend.readRef(ref)
  if (!oid) {
    const { NotFoundError } = await import('../errors/NotFoundError.ts')
    throw new NotFoundError(ref)
  }
  return oid
}

/**
 * Expand a shortened ref to a full ref
 */
export async function expandRef(this: Repository, ref: string): Promise<string> {
  return await (this as any)._gitBackend.expandRef(ref)
}

/**
 * Reads a symbolic ref without resolving to OID
 */
export async function readSymbolicRef(this: Repository, ref: string): Promise<string | null> {
  return await (this as any)._gitBackend.readSymbolicRef(ref)
}

/**
 * Writes a direct ref (OID) to a ref file
 */
export async function writeRef(
  this: Repository, 
  ref: string, 
  value: string, 
  skipReflog: boolean = false
): Promise<void> {
  return await (this as any)._gitBackend.writeRef(ref, value, skipReflog, this.cache)
}

