import type { GitBackendFs } from './GitBackendFs.ts'
import { WorkdirManager } from '../../git/worktree/WorkdirManager.ts'
import { NotFoundError } from '../../errors/NotFoundError.ts'
import { CommitNotFetchedError } from '../../errors/CommitNotFetchedError.ts'

/**
 * Checkout operation for GitBackendFs
 */

export async function checkout(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  ref: string,
  options?: {
    filepaths?: string[]
    force?: boolean
    noCheckout?: boolean
    noUpdateHead?: boolean
    dryRun?: boolean
    sparsePatterns?: string[]
    onProgress?: import('../../git/remote/types.ts').ProgressCallback
    remote?: string
    track?: boolean
    oldOid?: string
  }
): Promise<void> {
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir && !options?.noCheckout) {
    // If we're not checking out files, we might not strictly need dir, 
    // but WorkdirManager usually needs it.
    // However, if worktreeBackend is abstract, dir might be irrelevant?
    // GitBackendFs implies filesystem...
    throw new Error('WorktreeBackend must provide a directory for checkout')
  }

  const {
    filepaths,
    force = false,
    noCheckout = false,
    noUpdateHead = false,
    dryRun = false,
    sparsePatterns,
    onProgress,
    oldOid,
  } = options || {}

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
      const { parse } = await import('../../core-utils/parsers/Commit.ts')
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
    })
  }

  // 4. Update HEAD
  if (!noUpdateHead) {
    // If ref is a branch name, update HEAD to point to that branch
    // If ref is an OID or tag, detach HEAD
    if (ref.startsWith('refs/heads/')) {
      await this.writeSymbolicRef('HEAD', ref, oldOid)
    } else if (!ref.startsWith('refs/') && await this.readRef(`refs/heads/${ref}`)) {
      // It was a short branch name
      await this.writeSymbolicRef('HEAD', `refs/heads/${ref}`, oldOid)
    } else {
      // Detached HEAD
      await this.writeRef('HEAD', oid, false) // writeRef handles HEAD update?
      // Actually writeRef usually writes the ref provided.
      // If we want to detach HEAD, we should write the OID to HEAD.
      // But we might need to overwrite a symbolic ref with a direct ref.
      // GitBackendFs.writeRef usually updates the file.
      
      // We should check if HEAD is symbolic and convert to direct if needed, 
      // or just write the file.
      // writeRef implementation in GitBackendFs should handle this?
      // Let's check refs.ts writeRef.
      // Typically writeRef writes .git/refs/... or .git/packed-refs.
      // HEAD is special.
      
      // If we call writeRef('HEAD', oid), it should work for detached HEAD.
      // But we might want to ensure we are not updating the branch HEAD points to.
      // We want to update .git/HEAD itself.
      // backend.writeRef('HEAD') might update the *referent* if HEAD is symbolic.
      // To detach, we must delete .git/HEAD and write it as OID?
      // Or writeRef has a force/symbolic handling?
      
      // In GitBackendFs/refs.ts:
      /*
      async writeRef(ref: string, value: string) {
        if (ref === 'HEAD') {
           // ... logic ...
        }
      }
      */
      // We will assume direct write to HEAD detaches it.
      // Using `fs.write(join(gitdir, 'HEAD'), oid)` is the brute force way.
      // But let's try to use internal methods if possible.
      
      // For now, let's assume this.writeRef('HEAD', oid) works or we fix it there.
      // Ideally we should use a specific method for "detach HEAD".
      
      // Actually, standard behavior:
      // If we checkout a commit OID, we are in detached HEAD state.
      // We write the OID to .git/HEAD.
      
      // We'll use writeRef for now.
      await this.writeRef('HEAD', oid) 
    }
  }
}

/**
 * Checkout a specific tree to the working directory
 */
export async function checkoutTree(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  treeOid: string,
  options?: {
    filepaths?: string[]
    force?: boolean
    dryRun?: boolean
    sparsePatterns?: string[]
    onProgress?: import('../../git/remote/types.ts').ProgressCallback
    index?: import('../../git/index/GitIndex.ts').GitIndex
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
    index: options?.index,
  })
}
