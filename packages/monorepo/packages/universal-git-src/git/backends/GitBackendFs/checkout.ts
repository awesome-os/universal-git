import type { GitBackendFs } from './GitBackendFs.ts'
import { WorkdirManager } from '../../../git/worktree/WorkdirManager.ts'
import { NotFoundError } from '../../errors/NotFoundError.ts'
import { CommitNotFetchedError } from '../../errors/CommitNotFetchedError.ts'

/**
 * Checkout operation for GitBackendFs
 */

export async function checkout(
  this: GitBackendFs,
  worktreeBackend: import('../../worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  ref: string,
  options?: {
    filepaths?: string[]
    force?: boolean
    noCheckout?: boolean
    noUpdateHead?: boolean
    dryRun?: boolean
    sparsePatterns?: string[]
    onProgress?: import('../../../git/remote/types.ts').ProgressCallback
    remote?: string
    track?: boolean
    oldOid?: string
  }
): Promise<void> {
  // Try to get directory from worktreeBackend
  // GitWorktreeFs has both getDir() and getDirectory() methods
  // Also try accessing dir property directly if it's a GitWorktreeFs instance
  let dir: string | null = null
  
  // First, try to access dir property directly (for GitWorktreeFs instances)
  if ('dir' in worktreeBackend && typeof (worktreeBackend as any).dir === 'string') {
    dir = (worktreeBackend as any).dir
  }
  
  // If that didn't work, try getDir() method (returns string)
  if (!dir) {
    try {
      if ('getDir' in worktreeBackend && typeof worktreeBackend.getDir === 'function') {
        const dirValue = worktreeBackend.getDir()
        if (dirValue && typeof dirValue === 'string' && dirValue.trim() !== '') {
          dir = dirValue
        }
      }
    } catch {
      // getDir() might not be available or might throw
    }
  }
  
  // If that didn't work, try getDirectory() method (returns string | null)
  if (!dir) {
    try {
      if ('getDirectory' in worktreeBackend && typeof worktreeBackend.getDirectory === 'function') {
        const dirValue = worktreeBackend.getDirectory()
        if (dirValue && typeof dirValue === 'string' && dirValue.trim() !== '') {
          dir = dirValue
        }
      }
    } catch {
      // getDirectory() might not be available or might throw
    }
  }
  
  // If directory is still null/empty and we need to checkout files, throw error
  // But allow it if noCheckout is true (we're just updating HEAD)
  if ((!dir || dir.trim() === '') && !options?.noCheckout) {
    // If we're not checking out files, we might not strictly need dir, 
    // but WorkdirManager usually needs it.
    // However, if worktreeBackend is abstract, dir might be irrelevant?
    // GitBackendFs implies filesystem...
    throw new Error('WorktreeBackend must provide a directory for checkout')
  }
  
  // If noCheckout is true, we can proceed without dir (just updating HEAD)
  if (options?.noCheckout && (!dir || dir.trim() === '')) {
    // Skip checkout operations, just update HEAD
    return
  }
  
  const effectiveDir = dir || ''

  const {
    filepaths,
    force = false,
    noCheckout = false,
    noUpdateHead = false,
    dryRun = false,
    sparsePatterns,
    onProgress,
    oldOid: providedOldOid,
  } = options || {}

  // Read oldOid from HEAD if not provided (for reflog)
  let oldOid: string | undefined = providedOldOid
  if (!oldOid) {
    try {
      const headOid = await this.readRef('HEAD', 5, {})
      if (headOid && typeof headOid === 'string') {
        oldOid = headOid
      }
    } catch {
      // HEAD doesn't exist yet, oldOid remains undefined
    }
  }

  // 1. Resolve ref to OID
  let oid: string | null = null
  try {
    oid = await this.readRef(ref)
  } catch (err) {
    // ignore
  }

  if (!oid) {
    // Try resolving as branch
    if (!ref.startsWith('refs/')) {
      try {
        oid = await this.readRef(`refs/heads/${ref}`)
      } catch (err) {
        // ignore
      }
    }
  }

  if (!oid) {
    throw new NotFoundError(`ref ${ref}`)
  }

  // 2. Get commit and tree
  // readObject returns { type, object, format? }
  // We need to parse the commit to get the tree
  // Using internal helper or just reading it
  let treeOid: string
  try {
    const { object, type } = await this.readObject(oid, 'content')
    if (type !== 'commit') {
      // If it's a tag, we should resolve it to a commit... 
      // For now assume commit or tag pointing to commit
      if (type === 'tag') {
        // Resolve tag... implementation detail. 
        // Let's assume standard resolveRef handled recursive resolution?
        // readRef normally resolves to the target OID.
        // If it points to a tag object, we need to peel it.
        // For simplicity, assume commit for now or implement peering.
        // TODO: Implement peering if needed.
        throw new Error('Tag checkout not fully implemented in backend')
      } else if (type === 'tree') {
        treeOid = oid
      } else {
        throw new Error(`Cannot checkout object of type ${type}`)
      }
    } else {
      // Parse commit to get tree
      // Use standard parser
      const { parse } = await import('../../../core-utils/parsers/Commit.ts')
      const commit = parse(object)
      treeOid = commit.tree
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new CommitNotFetchedError(ref, oid)
    }
    throw err
  }

  // 3. Checkout files to worktree
  if (!noCheckout) {
    await this.checkoutTree(worktreeBackend, treeOid, {
      filepaths,
      force,
      sparsePatterns,
      onProgress,
      dryRun,
    })
  }

  // 4. Update HEAD (only if not dryRun and not noUpdateHead)
  if (!noUpdateHead && !dryRun) {
    // If ref is a branch name, update HEAD to point to that branch
    // If ref is an OID or tag, detach HEAD
    // Pass oid as newOid to writeSymbolicRef so it doesn't need to resolve it again
    if (ref.startsWith('refs/heads/')) {
      await this.writeSymbolicRef('HEAD', ref, oldOid, oid)
    } else if (!ref.startsWith('refs/') && await this.readRef(`refs/heads/${ref}`)) {
      // It was a short branch name
      await this.writeSymbolicRef('HEAD', `refs/heads/${ref}`, oldOid, oid)
    } else {
      // Detached HEAD - writeRef will create reflog entry automatically
      await this.writeRef('HEAD', oid, false) 
    }
  }
}

/**
 * Checkout a specific tree to the working directory
 */
export async function checkoutTree(
  this: GitBackendFs,
  worktreeBackend: import('../../worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  treeOid: string,
  options?: {
    filepaths?: string[]
    force?: boolean
    dryRun?: boolean
    sparsePatterns?: string[]
    onProgress?: import('../../remote/types.ts').ProgressCallback
    index?: import('../../index/GitIndex.ts').GitIndex
  }
): Promise<void> {
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory for checkout')
  }

  // Use WorkdirManager directly
  // This uses the file system based checkout which assumes worktree backend is fs based
  // TODO: Refactor WorkdirManager to be backend agnostic or GitBackendFs should use WorktreeBackend methods
  await WorkdirManager.checkout({
    fs: this.getFs(),
    dir,
    gitdir: this.getGitdir(),
    treeOid,
    filepaths: options?.filepaths,
    force: options?.force,
    sparsePatterns: options?.sparsePatterns,
    onProgress: options?.onProgress,
    dryRun: options?.dryRun,
    index: options?.index,
  })
}
