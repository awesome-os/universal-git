import { checkout } from './checkout.ts'
import { writeRef } from '../../../refs/writeRef.ts'
import { resolveRef } from './resolveRef.ts'
import { _currentBranch } from './currentBranch.ts'
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { assertParameter } from '../utils/assertParameter.ts'
import { MissingParameterError } from '../../../errors/MissingParameterError.ts'
import { join } from '../utils/join.ts'
import { Repository } from '../../../../core-utils/Repository.ts'
import type { FileSystem } from '../../../../models/FileSystem.ts'
import { listFiles } from './listFiles.ts'
import { resolveFilepath } from '../utils/resolveFilepath.ts'
import { GitIndex } from '../../../index/GitIndex.ts'
import { statIsDirectory } from '../utils/statHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'

export type ResetMode = 'soft' | 'mixed' | 'hard'

/**
 * Reset the repository to a specific commit.
 * 
 * Supports three reset modes:
 * - **soft**: Only updates HEAD and branch ref (keeps index and working directory unchanged)
 * - **mixed** (default): Updates HEAD, branch ref, and index (keeps working directory changes)
 * - **hard**: Updates HEAD, branch ref, index, and working directory (equivalent to `git reset --hard`)
 * 
 * @param {object} args
 * @param {FileSystem} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - Reference or OID to reset to (e.g., 'HEAD', 'HEAD~1', 'abc123...', 'refs/heads/main')
 * @param {string} [args.branch] - Branch name to reset (defaults to current branch or 'main')
 * @param {'soft'|'mixed'|'hard'} [args.mode='hard'] - Reset mode: 'soft', 'mixed', or 'hard' (default: 'hard')
 * @param {object} [args.cache={}] - Cache object to use for consistency across operations
 * 
 * @returns {Promise<void>} Resolves successfully when reset is complete
 * 
 * @example
 * // Hard reset to a specific commit (default)
 * await git.resetToCommit({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'abc123...'
 * })
 * 
 * @example
 * // Soft reset (keep changes staged)
 * await git.resetToCommit({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'HEAD~1',
 *   mode: 'soft'
 * })
 * 
 * @example
 * // Mixed reset (keep changes in working directory)
 * await git.resetToCommit({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'HEAD~1',
 *   mode: 'mixed'
 * })
 */
export async function resetToCommit({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  branch,
  mode = 'hard',
  cache: inputCache = {},
}: {
  repo?: Repository
  fs?: FileSystem
  dir?: string
  gitdir?: string
  ref: string
  branch?: string
  mode?: ResetMode
  cache?: Record<string, unknown>
  }): Promise<void> {
  try {
    const { repo, fs, dir: effectiveDir, gitdir: effectiveGitdir, cache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: inputCache,
      ref,
      branch,
      mode,
    })

    assertParameter('ref', ref)
    
    // Get dir from repo if not provided and repo has worktree backend
    let finalDir = effectiveDir
    if (!finalDir && repo) {
      const repoAny = repo as any
      if (repo.worktreeBackend && repo.worktreeBackend.getDirectory) {
        finalDir = repo.worktreeBackend.getDirectory() || undefined
      } else if (repoAny.__dir) {
        finalDir = repoAny.__dir
      }
    }

    // Step 1: Determine the branch name FIRST (before resolving ref, in case ref is a branch name)
    let branchName = branch
    if (!branchName) {
      // Try to get the current branch using Repository
      try {
        // First try to read HEAD as a symbolic ref
        const { readSymbolicRef } = await import('../../../refs/readRef.ts')
        const symbolicRef = await readSymbolicRef({ fs, gitdir: effectiveGitdir, ref: 'HEAD' })
        if (symbolicRef && symbolicRef.startsWith('refs/heads/')) {
          branchName = symbolicRef.replace('refs/heads/', '')
        }
      } catch {
        // HEAD is detached or doesn't exist - try to get branch from currentBranch
        try {
          const { currentBranch } = await import('./currentBranch.ts')
          const currentBranchName = await currentBranch({ fs, dir: effectiveDir, gitdir: effectiveGitdir, fullname: true })
          if (currentBranchName && currentBranchName.startsWith('refs/heads/')) {
            branchName = currentBranchName.replace('refs/heads/', '')
          }
        } catch {
          // Current branch doesn't exist or HEAD is detached
        }
      }
      
      // If still no branch, try to resolve ref to see if it's a branch name
      if (!branchName) {
        // Try to resolve the ref as a branch name first
        try {
          const { resolveRef: resolveRefDirect } = await import('../../../refs/readRef.ts')
          const resolved = await resolveRefDirect({ fs, gitdir: effectiveGitdir, ref: `refs/heads/${ref}` })
          if (resolved) {
            branchName = ref
          }
        } catch {
          // Not a branch name, continue
        }
        
        // If still no branch, try to get default branch from config
        if (!branchName) {
          // Try to get default branch from config using Repository
          let defaultBranch = 'main'
          try {
            if (repo) {
              const configService = await repo.getConfig()
              const initDefaultBranch = await configService.get('init.defaultBranch')
              if (initDefaultBranch && typeof initDefaultBranch === 'string') {
                defaultBranch = initDefaultBranch
              }
            } else {
              // Try to read config directly
              const { getConfig } = await import('../../../config.ts')
              const initDefaultBranch = await getConfig({ fs, gitdir: effectiveGitdir, path: 'init.defaultBranch' })
              if (initDefaultBranch && typeof initDefaultBranch === 'string') {
                defaultBranch = initDefaultBranch
              }
            }
          } catch {
            // Config doesn't exist or can't be read, use 'main'
          }
          branchName = defaultBranch
          
          // If default branch doesn't exist, try 'master' as fallback
          const { resolveRef: resolveRefDirect } = await import('../../../refs/readRef.ts')
          try {
            await resolveRefDirect({ fs, gitdir: effectiveGitdir, ref: `refs/heads/${branchName}` })
          } catch {
            // Default branch doesn't exist, try 'master'
            try {
              await resolveRefDirect({ fs, gitdir: effectiveGitdir, ref: 'refs/heads/master' })
              branchName = 'master'
            } catch {
              // Neither exists, use defaultBranch anyway (will create it)
            }
          }
        }
      }
    }

    // Step 2: Resolve the commit OID from the ref (after determining branch name)
    const commitOid = await resolveRef({ fs, gitdir: effectiveGitdir, ref })

    // Step 3: Read old branch OID for reflog before updating
    // Important: Read the OID of the branch being reset (branchName), not the target ref
    // This must be done BEFORE we update the ref, so we capture the current state
    let oldBranchOid: string | undefined
    try {
      // Use readRef to get the OID directly (not through Repository which might cache)
      // Use default depth (5) to handle symbolic refs, but we want the final OID
      const { readRef } = await import('../../../refs/readRef.ts')
      const { NotFoundError } = await import('../../../errors/NotFoundError.ts')
      try {
        const resolved = await readRef({ fs, gitdir: effectiveGitdir, ref: `refs/heads/${branchName}` })
        // Ensure we have a valid 40-char OID (not a ref path)
        if (resolved && resolved.length === 40 && /^[0-9a-f]{40}$/i.test(resolved)) {
          oldBranchOid = resolved
        } else {
          oldBranchOid = undefined
        }
      } catch (err) {
        // Only treat NotFoundError as "branch doesn't exist" - rethrow other errors
        if (err instanceof NotFoundError) {
          oldBranchOid = undefined
        } else {
          throw err
        }
      }
    } catch (err) {
      // If we can't read the ref for any reason, use zero OID
      // This ensures reflog entry is still created
      oldBranchOid = undefined
    }

    // Step 4: Update the branch ref to point to the commit
    // This is the "reset --hard" part for the ref
    // Use skipReflog=true because we'll add a descriptive reflog entry below
    if (repo) {
      await repo.writeRef(`refs/heads/${branchName}`, commitOid, true) // skipReflog=true: we'll add descriptive entry below
    } else {
      await writeRef({
        fs,
        gitdir: effectiveGitdir,
        ref: `refs/heads/${branchName}`,
        value: commitOid,
        skipReflog: true, // skipReflog=true: we'll add descriptive entry below
      })
    }

    // Step 5: Add descriptive reflog entry for branch reset
    // Use zero OID if branch didn't exist before
    const effectiveOldOid = oldBranchOid || '0000000000000000000000000000000000000000'
    
    // Always create reflog entry for reset operations
    // logRefUpdate will handle early return if oldOid === newOid, but for reset we should always have different OIDs
    const { logRefUpdate } = await import('../../../logs/logRefUpdate.ts')
    const { REFLOG_MESSAGES } = await import('../../../logs/messages.ts')
    
    // Use appropriate reflog message based on reset mode
    let reflogMessage: string
    if (mode === 'soft') {
      reflogMessage = REFLOG_MESSAGES.RESET_SOFT(ref)
    } else if (mode === 'mixed') {
      reflogMessage = REFLOG_MESSAGES.RESET_MIXED(ref)
    } else {
      reflogMessage = REFLOG_MESSAGES.RESET_HARD(ref)
    }
    
    // Get fs from repo if available
    // Use the fs that was passed in or from the repo's gitBackend if it's GitBackendFs
    const reflogFs = repo && 'getFs' in repo.gitBackend && typeof repo.gitBackend.getFs === 'function' 
      ? repo.gitBackend.getFs() 
      : fs
    // Use effectiveGitdir for consistency with test fixtures (which use the same gitdir)
    // repo.getGitdir() might return a normalized path that differs from the test's gitdir
    const reflogGitdir = effectiveGitdir
    
    // Create reflog entry (logRefUpdate will return early if oldOid === newOid, but that shouldn't happen for reset)
    // Add debugging to understand why reflog entries might not be created
    if (process.env.DEBUG_REFLOG === 'true') {
      console.log('[DEBUG] Creating reflog entry:', {
        ref: `refs/heads/${branchName}`,
        oldOid: effectiveOldOid,
        newOid: commitOid,
        message: reflogMessage,
        gitdir: reflogGitdir,
      })
    }
    try {
      await logRefUpdate({
        fs: reflogFs,
        gitdir: reflogGitdir,
        ref: `refs/heads/${branchName}`,
        oldOid: effectiveOldOid,
        newOid: commitOid,
        message: reflogMessage,
      })
      if (process.env.DEBUG_REFLOG === 'true') {
        console.log('[DEBUG] Reflog entry created successfully')
      }
    } catch (err) {
      // Log error for debugging but don't throw (Git's behavior)
      // Reflog is a convenience feature, not critical for operations
      if (process.env.DEBUG_REFLOG === 'true') {
        console.error('[DEBUG] Reflog update failed:', err)
      }
    }

    // Step 6: Read old HEAD OID for reflog before updating
    let oldHeadOid: string | undefined
    try {
      oldHeadOid = await resolveRef({ fs, gitdir: effectiveGitdir, ref: 'HEAD' })
    } catch {
      // HEAD doesn't exist yet
      oldHeadOid = undefined
    }

    // Step 7: Update HEAD to point to that branch (ensures HEAD is not detached)
    // Pass commitOid as newOid so writeSymbolicRef doesn't need to resolve it again
    const { writeSymbolicRef } = await import('../../../refs/writeRef.ts')
    if (repo) {
      await writeSymbolicRef({
        gitBackend: repo.gitBackend,
        ref: 'HEAD',
        value: `refs/heads/${branchName}`,
        oldOid: oldHeadOid, // Pass oldOid for HEAD reflog
        newOid: commitOid, // Pass commitOid as newOid
      })
    } else {
      await writeSymbolicRef({
        fs,
        gitdir: effectiveGitdir,
        ref: 'HEAD',
        value: `refs/heads/${branchName}`,
        oldOid: oldHeadOid, // Pass oldOid for HEAD reflog
        newOid: commitOid, // Pass commitOid as newOid
      })
    }

    // Step 8: Handle different reset modes
    if (mode === 'soft') {
      // Soft reset: Only update HEAD and branch ref, keep index and working directory unchanged
      // Nothing more to do
      return
    } else if (mode === 'mixed') {
      // Mixed reset: Update index to match the commit tree, but keep working directory changes
      if (finalDir) {
        await resetIndexToTree({
          fs,
          dir: finalDir,
          gitdir: effectiveGitdir,
          commitOid,
          repo,
          cache,
        })
      }
      // Working directory is left unchanged
      return
    } else {
      // Hard reset: Update index and working directory to match the commit
      // Step 8a: Clean the working directory (removes all untracked files)
      // This is critical because git checkout does NOT remove untracked files
      if (repo.worktreeBackend) {
        await cleanWorkdir(repo.worktreeBackend)
      }

      // Step 8b: Checkout HEAD to restore the workdir and index to the correct state
      // This now checks out the branch, not a detached commit
      // Use repo parameter if available for consistency
      // Note: checkout requires dir, so if finalDir is undefined, we skip checkout
      if (finalDir) {
        await checkout({
          repo,
          fs,
          dir: finalDir,
          gitdir: effectiveGitdir,
          ref: 'HEAD',
          force: true,
          cache,
        })
      } else {
        // If dir is not provided, we can't checkout, but the ref has been updated
        // This is acceptable for bare repositories or when only updating refs
        // However, for non-bare repos, this is unusual - throw an error to match expected behavior
        throw new Error('dir is required for checkout step in resetToCommit')
      }
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.resetToCommit'
    throw err
  }
}

/**
 * Reset the index to match a specific commit's tree
 * This is used for mixed reset mode
 */
async function resetIndexToTree({
  fs,
  dir,
  gitdir,
  commitOid,
  repo,
  cache,
}: {
  fs: FileSystem
  dir: string
  gitdir: string
  commitOid: string
  repo: Repository
  cache: Record<string, unknown>
}): Promise<void> {
  // Get the commit's tree OID
  const { readObject } = await import('../../../objects/readObject.ts')
  const { parse: parseCommit } = await import('../../../../core-utils/parsers/Commit.ts')
  const commitResult = await readObject({ fs, cache, gitdir, oid: commitOid, format: 'content' })
  
  let targetTreeOid: string
  if (commitResult.type === 'commit') {
    const commit = parseCommit(commitResult.object)
    targetTreeOid = commit.tree
  } else {
    // If commitOid points directly to a tree
    targetTreeOid = commitOid
  }

  // Get all file paths from the tree
  // Use listFiles with the commit OID (it will resolve to the tree internally)
  // This ensures we use the same logic as other commands
  const filePaths = await listFiles({ repo, ref: commitOid })

  // Read current index and create a new one (this effectively clears the index)
  const index = new GitIndex()

  // Add all entries from the tree to the index
  const normalizedFs = createFileSystem(fs)
  for (const filepath of filePaths) {
    try {
      // Resolve the OID for this filepath in the tree
      const blobOid = await resolveFilepath({
        fs,
        cache,
        gitdir,
        oid: targetTreeOid,
        filepath,
      })
      
      // Get stats from working directory if file exists
      let stats
      try {
        stats = await normalizedFs.lstat(join(dir, filepath))
        if (!stats) {
          // If lstat returns null, use default stats
          stats = {
            ctime: new Date(0),
            mtime: new Date(0),
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 0,
          }
        }
      } catch {
        // File doesn't exist in workdir, use default stats
        stats = {
          ctime: new Date(0),
          mtime: new Date(0),
          dev: 0,
          ino: 0,
          mode: 0o100644,
          uid: 0,
          gid: 0,
          size: 0,
        }
      }
      
      // Insert into index
      index.insert({
        filepath,
        stats,
        oid: blobOid,
      })
    } catch (error) {
      // If we can't resolve the filepath, skip it
      // This can happen if the file was deleted or doesn't exist in the tree
      console.warn(`Could not resolve filepath ${filepath} in tree ${targetTreeOid}:`, error)
    }
  }

  // Write the index using Repository.writeIndexDirect() to ensure cache consistency
  // This replaces the entire index with the new one (files not in the tree are removed)
  await repo.writeIndexDirect(index)
}

/**
 * Clean the working directory by removing all files and directories except .git
 */
async function cleanWorkdir(worktreeBackend: import('../../../worktree/GitWorktreeBackend.ts').GitWorktreeBackend): Promise<void> {
  try {
    const entries = await worktreeBackend.readdir('.')
    if (!entries || entries.length === 0) return
    
    for (const entry of entries) {
      // Don't delete the .git directory!
      if (entry === '.git') continue
      
      try {
        const stat = await worktreeBackend.lstat(entry)
        if (!stat) {
          // If stat returns null, file doesn't exist, skip it
          continue
        }
        
        if (stat.isDirectory()) {
          // Use recursive rm for directories
          await worktreeBackend.rm(entry, { recursive: true })
        } else {
          // Remove files directly
          await worktreeBackend.rm(entry)
        }
      } catch (err: any) {
        // If we can't stat or remove a file, check if it's a "not found" error
        // If it's not found, that's fine - the file is already gone
        // Otherwise, log a warning but continue
        const isNotFound = 
          err?.code === 'ENOENT' || 
          err?.errno === -2 || 
          err?.code === 'ENOTFOUND' ||
          (typeof err === 'object' && err !== null && 'code' in err && String(err.code).includes('ENOENT'))
        if (!isNotFound) {
          console.warn(`[resetToCommit] Warning: Could not remove ${entry}:`, err)
        }
        // If it's a not found error, that's fine - continue
      }
    }
  } catch (err) {
    // If readdir fails, the directory might not exist or be inaccessible
    // This is okay - we'll let checkout handle it
    console.warn(`[resetToCommit] Warning: Could not read directory:`, err)
  }
}

