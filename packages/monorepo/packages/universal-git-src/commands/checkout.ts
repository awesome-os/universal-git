import { CheckoutConflictError } from "../errors/CheckoutConflictError.ts"
import { CommitNotFetchedError } from "../errors/CommitNotFetchedError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
// RefManager import removed - using Repository.resolveRef/writeRef methods instead
import { SparseCheckoutManager } from "../core-utils/filesystem/SparseCheckoutManager.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { readObject } from "../git/objects/readObject.ts"
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { parse as parseConfig, serialize as serializeConfig } from "../core-utils/ConfigParser.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystem } from "../models/FileSystem.ts"
import type { ProgressCallback } from "../git/remote/types.ts"

// ============================================================================
// CHECKOUT TYPES
// ============================================================================

/**
 * Post-checkout hook parameters
 */
export type PostCheckoutParams = {
  previousHead: string // SHA-1 object id of HEAD before checkout
  newHead: string // SHA-1 object id of HEAD after checkout
  type: 'branch' | 'file' // Flag determining whether a branch or set of files was checked
}

/**
 * Post-checkout callback
 */
export type PostCheckoutCallback = (args: PostCheckoutParams) => void | Promise<void>

/**
 * Checkout a branch
 *
 * If the branch already exists it will check out that branch. Otherwise, it will create a new remote tracking branch set to track the remote branch of that name.
 *
 * @param {object} args
 * @param {FileSystem} args.fs - a file system implementation
 * @param {ProgressCallback} [args.onProgress] - optional progress event callback
 * @param {PostCheckoutCallback} [args.onPostCheckout] - optional post-checkout hook callback
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} [args.ref = 'HEAD'] - Source to checkout files from
 * @param {string[]} [args.filepaths] - Limit the checkout to the given files and directories
 * @param {string} [args.remote = 'origin'] - Which remote repository to use
 * @param {boolean} [args.noCheckout = false] - If true, will update HEAD but won't update the working directory
 * @param {boolean} [args.noUpdateHead] - If true, will update the working directory but won't update HEAD. Defaults to `false` when `ref` is provided, and `true` if `ref` is not provided.
 * @param {boolean} [args.dryRun = false] - If true, simulates a checkout so you can test whether it would succeed.
 * @param {boolean} [args.force = false] - If true, conflicts will be ignored and files will be overwritten regardless of local changes.
 * @param {boolean} [args.track = true] - If false, will not set the remote branch tracking information. Defaults to true.
 * @param {object} [args.cache] - a [cache](cache.md) object
 * @param {boolean} [args.nonBlocking = false] - If true, will use non-blocking file system operations to allow for better performance in certain environments (For example, in Browsers)
 * @param {number} [args.batchSize = 100] - If args.nonBlocking is true, batchSize is the number of files to process at a time avoid blocking the executing thread. The default value of 100 is a good starting point.
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * // switch to the main branch
 * await git.checkout({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'main'
 * })
 * console.log('done')
 *
 * @example
 * // restore the 'docs' and 'src/docs' folders to the way they were, overwriting any changes
 * await git.checkout({
 *   fs,
 *   dir: '/tutorial',
 *   force: true,
 *   filepaths: ['docs', 'src/docs']
 * })
 * console.log('done')
 *
 * @example
 * // restore the 'docs' and 'src/docs' folders to the way they are in the 'develop' branch, overwriting any changes
 * await git.checkout({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'develop',
 *   noUpdateHead: true,
 *   force: true,
 *   filepaths: ['docs', 'src/docs']
 * })
 * console.log('done')
 */
export async function checkout({
  repo: _repo,
  fs: _fs,
  onProgress,
  onPostCheckout,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  remote = 'origin',
  ref: _ref,
  filepaths,
  noCheckout = false,
  noUpdateHead = _ref === undefined,
  dryRun = false,
  force = false,
  track = true,
  cache = {},
  nonBlocking = false,
  batchSize = 100,
}: {
  repo?: import('../core-utils/Repository.ts').Repository
  fs?: FileSystem
  onProgress?: ProgressCallback
  onPostCheckout?: PostCheckoutCallback
  dir?: string
  gitdir?: string
  remote?: string
  ref?: string
  filepaths?: string[]
  noCheckout?: boolean
  noUpdateHead?: boolean
  dryRun?: boolean
  force?: boolean
  track?: boolean
  cache?: Record<string, unknown>
  nonBlocking?: boolean
  batchSize?: number
}): Promise<void> {
  try {
    const { repo, fs, dir: effectiveDir, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      onProgress,
      onPostCheckout,
      remote,
      ref: _ref,
      filepaths,
      noCheckout,
      noUpdateHead: _ref === undefined ? true : noUpdateHead,
      dryRun,
      force,
      track,
      nonBlocking,
      batchSize,
    })

    const ref = _ref || 'HEAD'
    
    // Always use _checkout() to ensure consistent behavior and support for onPostCheckout
    // Repository.checkout() doesn't support onPostCheckout, so we use _checkout() for all cases
    if (!effectiveDir && !repo?.worktreeBackend) {
      // If dir is missing AND we don't have a worktree backend, throw MissingParameterError
      // The bare repository check will happen in _checkout() if needed
      throw new MissingParameterError('dir')
    }
    // Extract backends from repo if available, otherwise use fs/dir/gitdir
    return await _checkout({
      gitBackend: repo?.gitBackend,
      worktreeBackend: repo?.worktreeBackend || undefined,
      fs: fs ? createFileSystem(fs) as any : undefined,
      cache,
      onProgress,
      onPostCheckout,
      dir: effectiveDir,
      gitdir: effectiveGitdir,
      remote,
      ref,
      filepaths,
      noCheckout,
      noUpdateHead,
      dryRun,
      force,
      track,
      nonBlocking,
      batchSize,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.checkout'
    throw err
  }
}

/**
 * Internal checkout implementation
 * @internal - Exported for use by other commands (e.g., clone, pull)
 * 
 * This function accepts GitBackend and GitWorktreeBackend directly,
 * removing the need for direct fs usage.
 */
export async function _checkout({
  gitBackend: _gitBackend,
  worktreeBackend: _worktreeBackend,
  fs,
  cache,
  onProgress,
  onPostCheckout,
  dir,
  gitdir,
  remote,
  ref,
  filepaths,
  noCheckout,
  noUpdateHead,
  dryRun,
  force,
  track = true,
  nonBlocking = false,
  batchSize = 100,
}: {
  gitBackend?: import('../backends/GitBackend.ts').GitBackend
  worktreeBackend?: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  fs?: FileSystem
  cache: Record<string, unknown>
  onProgress?: ProgressCallback
  onPostCheckout?: PostCheckoutCallback
  dir?: string
  gitdir?: string
  remote: string
  ref: string
  filepaths?: string[]
  noCheckout: boolean
  noUpdateHead?: boolean
  dryRun?: boolean
  force?: boolean
  track?: boolean
  nonBlocking?: boolean
  batchSize?: number
}): Promise<void> {
  // Get backends - either provided directly or create from fs/dir/gitdir
  let gitBackend: import('../backends/GitBackend.ts').GitBackend
  let worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend | null = null
  let worktreeGitdir: string
  let worktreeDir: string
  let repo: import('../core-utils/Repository.ts').Repository | null = null
  
  const resolveWorktreeDir = (backend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend | null, fallback?: string): string => {
    if (backend) {
      if (typeof (backend as any).getDirectory === 'function') {
        const value = (backend as any).getDirectory()
        if (value) return value
      }
      if (typeof (backend as any).getDir === 'function') {
        const value = (backend as any).getDir()
        if (value) return value
      }
    }
    // Fallback to empty string if fallback is not provided, assuming relative paths or CWD
    if (fallback !== undefined) return fallback
    return '' 
  }

  const resolveWorktreeGitdir = (
    backend: import('../backends/GitBackend.ts').GitBackend | undefined,
    fallback?: string
  ): string => {
    if (backend && typeof (backend as any).getGitdir === 'function') {
      return (backend as any).getGitdir()
    }
    // Fallback to empty string if fallback is not provided, but gitdir is usually required
    if (fallback !== undefined) return fallback
    // If no gitdir can be resolved, we might be in trouble for FS operations
    // But for abstract backend operations it might be okay?
    // Let's assume fallback is required if backend doesn't provide it
    throw new MissingParameterError('gitdir (required when gitBackend does not provide getGitdir())')
  }

  if (_gitBackend && _worktreeBackend) {
    // Use provided backends - create Repository and Worktree from them
    gitBackend = _gitBackend
    worktreeBackend = _worktreeBackend
    
    // Get gitdir and dir from backends (try methods if available, otherwise use provided values)
    worktreeGitdir = resolveWorktreeGitdir(gitBackend, gitdir)
    worktreeDir = resolveWorktreeDir(worktreeBackend, dir)
    
    // Create Repository from backends
    const { Repository } = await import('../core-utils/Repository.ts')
    repo = new Repository({
      gitBackend,
      worktreeBackend,
      cache,
      autoDetectConfig: true,
    })
    
    // Create Worktree from Repository
  } else if (fs && dir && gitdir) {
    // Fallback: create Repository to get backends (for backward compatibility)
    // Dynamic import to avoid circular dependency
    const { createRepository } = await import('../core-utils/createRepository.ts')
    repo = await createRepository({ fs, dir, gitdir, cache, autoDetectConfig: true })
    const worktree = repo.getWorktree()
    if (!worktree) {
      throw new Error('Cannot checkout in bare repository')
    }
    
    gitBackend = repo.gitBackend
    // Get worktree backend from repository (it has a getter property)
    worktreeBackend = repo.worktreeBackend
    if (worktree.getGitdir) {
      worktreeGitdir = await worktree.getGitdir()
    } else {
      // Fallback if worktree.getGitdir is missing (e.g. if worktree is just the backend)
      worktreeGitdir = await repo.getGitdir()
    }
    worktreeDir = worktree.dir || (worktreeBackend.getDirectory ? worktreeBackend.getDirectory() : undefined) || dir
  } else {
    throw new MissingParameterError('gitBackend and worktreeBackend, or fs, dir, and gitdir')
  }
  
  if (!worktreeBackend) {
    throw new Error('Cannot checkout in bare repository')
  }
  
  // Read old HEAD OID for reflog (always, not just for onPostCheckout hook)
  let oldOid: string | undefined
  try {
    const headOid = await gitBackend.readRef('HEAD', 5, cache)
    oldOid = headOid || undefined
  } catch (err) {
    // HEAD doesn't exist yet, use undefined (will default to zero OID in writeSymbolicRef)
    oldOid = undefined
  }
  
  // Resolve ref to get oid for post-checkout hook
  let oid: string | null = null
  let originalErr: unknown = null
  try {
    oid = await gitBackend.readRef(ref, 5, cache)
    if (!oid) {
      throw new NotFoundError(`ref ${ref}`)
    }
  } catch (err) {
    originalErr = err
    // If ref doesn't start with 'refs/', try resolving as a branch name first
    if (ref !== 'HEAD' && !ref.startsWith('refs/') && !ref.match(/^[0-9a-f]{40}$/i)) {
      // Try resolving as a branch name (refs/heads/ref)
      try {
        oid = await gitBackend.readRef(`refs/heads/${ref}`, 5, cache)
        if (oid) {
          // Successfully resolved as branch, continue with this oid
          originalErr = null // Clear error since we successfully resolved
        } else {
          throw new NotFoundError(`ref refs/heads/${ref}`)
        }
      } catch (branchErr) {
        // Branch doesn't exist, keep originalErr for later handling
        oid = null
      }
    }
    
    // If we still don't have an oid, handle the error
    if (!oid) {
      if (ref === 'HEAD') {
        // HEAD doesn't exist - try to find default branch
        let defaultBranch = 'master'
        try {
          const initDefaultBranch = await gitBackend.getConfig('init.defaultBranch')
          if (initDefaultBranch && typeof initDefaultBranch === 'string') {
            defaultBranch = initDefaultBranch
          }
        } catch {
          // Config doesn't exist or can't be read, use 'master'
        }
        
        // Try to resolve the default branch
        try {
          oid = await gitBackend.readRef(`refs/heads/${defaultBranch}`, 5, cache)
          if (oid) {
            // Set HEAD to point to the default branch
            // Pass oldOid if available for reflog
            await gitBackend.writeSymbolicRef('HEAD', `refs/heads/${defaultBranch}`, oldOid, cache)
            originalErr = null // Clear error since we successfully resolved
          } else {
            throw new NotFoundError(`ref refs/heads/${defaultBranch}`)
          }
        } catch {
          // Default branch doesn't exist - try to list branches and use the first one
          try {
            const branches = await gitBackend.listRefs('refs/heads')
            if (branches.length > 0) {
              // Use the first branch
              const firstBranch = branches[0].replace('refs/heads/', '')
              oid = await gitBackend.readRef(`refs/heads/${firstBranch}`, 5, cache)
              if (oid) {
                // Set HEAD to point to the first branch
                // Pass oldOid if available for reflog
                await gitBackend.writeSymbolicRef('HEAD', `refs/heads/${firstBranch}`, oldOid, cache)
                originalErr = null // Clear error since we successfully resolved
              } else {
                throw new NotFoundError(`ref refs/heads/${firstBranch}`)
              }
            } else {
              // No branches exist, can't checkout HEAD
              throw originalErr || err
            }
          } catch {
            // Can't find any branches, re-throw original error
            throw originalErr || err
          }
        }
      } else {
        // If `ref` doesn't exist, try to create a new remote tracking branch
        const remoteRef = `refs/remotes/${remote}/${ref}`
        try {
          // Use gitBackend to resolve the remote ref
          oid = await gitBackend.readRef(remoteRef, 5, cache)
          if (oid) {
            if (track) {
              // Set up remote tracking branch using gitBackend config methods
              // Worktree config is handled by WorktreeBackend, but branch tracking is in main config
              await gitBackend.setConfig(`branch.${ref}.remote`, remote, 'local')
              await gitBackend.setConfig(`branch.${ref}.merge`, `refs/heads/${ref}`, 'local')
            }
            // Create a new branch that points at that same commit
            if (process.env.DEBUG_CLONE_REFS === 'true') {
              console.log(`[DEBUG checkout._checkout] Creating branch 'refs/heads/${ref}' from remote ref '${remoteRef}' (oid: ${oid.substring(0, 8)})`)
            }
            await gitBackend.writeRef(`refs/heads/${ref}`, oid, false, cache)
            originalErr = null // Clear error since we successfully resolved
          } else {
            throw new NotFoundError(`ref ${remoteRef}`)
          }
        } catch (remoteErr: any) {
          // If remote ref also doesn't exist, re-throw the original error
          // Only throw CommitNotFetchedError if we know the ref exists but the commit doesn't
          // (This would be detected in the worktree.checkout call below)
          throw originalErr || err
        }
      }
    }
  }
  
  // Ensure oid is not null at this point
  if (!oid) {
    throw originalErr || new NotFoundError(`ref ${ref}`)
  }

  // Use worktree.checkout() which handles ref resolution, HEAD update, and workdir checkout
  // This ensures all operations use the worktree's gitdir and staging area
  // Pass oldOid if available for reflog
  try {
    // Use gitBackend.checkout() with worktreeBackend for file operations
    if (!gitBackend) {
      throw new MissingParameterError('gitBackend (required for checkout operation)')
    }
    if (!worktreeBackend) {
      throw new MissingParameterError('worktreeBackend (required for checkout operation)')
    }

    await gitBackend.checkout(worktreeBackend, ref, {
      filepaths,
      force,
      noCheckout,
      noUpdateHead,
      dryRun,
      remote,
      track,
      onProgress,
      oldOid,
    })
  } catch (err) {
    if (err instanceof NotFoundError && (err as any).data && (err as any).data.what === oid) {
      throw new CommitNotFetchedError(ref, oid)
    }
    throw err
  }

  // Call manual post-checkout callback if provided (for backward compatibility)
  if (onPostCheckout) {
    await onPostCheckout({
      previousHead: oldOid || '0000000000000000000000000000000000000000',
      newHead: oid,
      type: filepaths != null && filepaths.length > 0 ? 'file' : 'branch',
    })
  }

  // Run automatic post-checkout hook (after successful checkout)
  // Use gitBackend.runHook() instead of direct runHook() call
  try {
    const workTree = worktreeDir || dir
    
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
    
    await gitBackend.runHook('post-checkout', {
      gitdir: worktreeGitdir,
      workTree,
      previousHead: oldOid || '0000000000000000000000000000000000000000',
      newHead: oid,
      branch: branchName,
    })
  } catch (hookError: any) {
    // Post-checkout hook failures don't abort the checkout (it's already done)
    // But we log the error for debugging
    if (process.env.DEBUG_HOOKS === 'true') {
      console.warn(`post-checkout hook failed: ${hookError.stderr || hookError.message}`)
    }
  }
}

