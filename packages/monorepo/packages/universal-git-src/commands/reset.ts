import { checkout } from './checkout.ts'
import { writeRef } from './writeRef.ts'
import { resolveRef } from './resolveRef.ts'
import { _currentBranch } from './currentBranch.ts'
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { assertParameter } from '../utils/assertParameter.ts'
import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { join } from '../utils/join.ts'
import { rmRecursive } from '../utils/rmRecursive.ts'
import { Repository } from '../core-utils/Repository.ts'
import type { FileSystem } from '../models/FileSystem.ts'
import { listFiles } from './listFiles.ts'
import { resolveFilepath } from '../utils/resolveFilepath.ts'
import { GitIndex } from '../git/index/GitIndex.ts'
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

    // Step 1: Resolve the commit OID from the ref
    const commitOid = await resolveRef({ fs, gitdir: effectiveGitdir, ref })

    // Step 2: Determine the branch name
    let branchName = branch
    if (!branchName) {
      // Try to get the current branch using Repository
      try {
        // First try to read HEAD as a symbolic ref
        const { readSymbolicRef } = await import('../git/refs/readRef.ts')
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
      
      // If still no branch, use default
      if (!branchName) {
        // Try to get default branch from config using Repository
        let defaultBranch = 'main'
        try {
          const configService = await repo.getConfig()
          const initDefaultBranch = await configService.get('init.defaultBranch')
          if (initDefaultBranch && typeof initDefaultBranch === 'string') {
            defaultBranch = initDefaultBranch
          }
        } catch {
          // Config doesn't exist or can't be read, use 'main'
        }
        branchName = defaultBranch
      }
    }

    // Step 3: Read old branch OID for reflog before updating
    let oldBranchOid: string | undefined
    try {
      oldBranchOid = await resolveRef({ fs, gitdir: effectiveGitdir, ref: `refs/heads/${branchName}` })
    } catch {
      // Branch doesn't exist yet, use zero OID
      oldBranchOid = undefined
    }

    // Step 4: Update the branch ref to point to the commit
    // This is the "reset --hard" part for the ref
    await writeRef({
      fs,
      gitdir: effectiveGitdir,
      ref: `refs/heads/${branchName}`,
      value: commitOid,
      force: true,
    })

    // Step 5: Add descriptive reflog entry for branch reset
    if (oldBranchOid && oldBranchOid !== commitOid) {
      const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
      const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
      
      // Use appropriate reflog message based on reset mode
      let reflogMessage: string
      if (mode === 'soft') {
        reflogMessage = REFLOG_MESSAGES.RESET_SOFT(ref)
      } else if (mode === 'mixed') {
        reflogMessage = REFLOG_MESSAGES.RESET_MIXED(ref)
      } else {
        reflogMessage = REFLOG_MESSAGES.RESET_HARD(ref)
      }
      
      await logRefUpdate({
        fs,
        gitdir: effectiveGitdir,
        ref: `refs/heads/${branchName}`,
        oldOid: oldBranchOid,
        newOid: commitOid,
        message: reflogMessage,
      }).catch(() => {
        // Silently ignore reflog errors (Git's behavior)
      })
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
    await writeRef({
      fs,
      gitdir: effectiveGitdir,
      ref: 'HEAD',
      value: `refs/heads/${branchName}`,
      symbolic: true,
      force: true,
      oldOid: oldHeadOid, // Pass oldOid for HEAD reflog
    })

    // Step 8: Handle different reset modes
    if (mode === 'soft') {
      // Soft reset: Only update HEAD and branch ref, keep index and working directory unchanged
      // Nothing more to do
      return
    } else if (mode === 'mixed') {
      // Mixed reset: Update index to match the commit tree, but keep working directory changes
      if (effectiveDir) {
        await resetIndexToTree({
          fs,
          dir: effectiveDir,
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
      if (effectiveDir) {
        await cleanWorkdir(fs, effectiveDir)
      }

      // Step 8b: Checkout HEAD to restore the workdir and index to the correct state
      // This now checks out the branch, not a detached commit
      // Use repo parameter if available for consistency
      // Note: checkout requires dir, so if effectiveDir is undefined, we skip checkout
      if (effectiveDir) {
        await checkout({
          repo,
          fs,
          dir: effectiveDir,
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
  const { readObject } = await import('../git/objects/readObject.ts')
  const { parse: parseCommit } = await import('../core-utils/parsers/Commit.ts')
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
  const filePaths = await listFiles({ fs, dir, gitdir, ref: commitOid, cache })

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
async function cleanWorkdir(fs: FileSystem, dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir)
    if (!entries || entries.length === 0) return
    
    for (const entry of entries) {
      // Don't delete the .git directory!
      if (entry === '.git') continue
      
      const fullpath = join(dir, entry)
      
      try {
        const stat = await fs.lstat(fullpath)
        if (!stat) {
          // If stat returns null, file doesn't exist, skip it
          continue
        }
        
        if (statIsDirectory(stat)) {
          // Use rmRecursive for directories to handle nested files
          await rmRecursive(fs, fullpath)
        } else {
          // Remove files directly
          await fs.rm(fullpath)
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
          console.warn(`[resetToCommit] Warning: Could not remove ${fullpath}:`, err)
        }
        // If it's a not found error, that's fine - continue
      }
    }
  } catch (err) {
    // If readdir fails, the directory might not exist or be inaccessible
    // This is okay - we'll let checkout handle it
    console.warn(`[resetToCommit] Warning: Could not read directory ${dir}:`, err)
  }
}

