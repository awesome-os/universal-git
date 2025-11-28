import { checkout } from './checkout.ts'
import { WorkdirManager } from '../git/worktree/WorkdirManager.ts'
import { readCommit } from './readCommit.ts'
import { NotFoundError } from '../errors/NotFoundError.ts'
import { UnmergedPathsError } from '../errors/UnmergedPathsError.ts'
// GitRefManager import removed - using src/git/refs/ functions instead
import {
  getStashAuthor,
  readStashCommit,
  readStashReflogs,
  getStashRefPath,
  getStashReflogsPath,
  writeStashCommit,
  writeStashRef,
  writeStashReflogEntry,
} from "../git/refs/stash.ts"
// GitIndexManager import removed - using Repository.readIndexDirect/writeIndexDirect instead
import {
  writeTreeChanges,
  applyTreeChanges,
  acquireLock,
} from "../utils/walkerToTreeEntryMap.ts"

import { WalkerFactory } from '../models/Walker.ts'
import { _currentBranch } from './currentBranch.ts'
import { readCommit as _readCommit } from './readCommit.ts'
import { listFiles as _listFiles } from './listFiles.ts'
import { join } from '../utils/join.ts'
import { normalize as normalizePath } from '../core-utils/GitPath.ts'
import { InvalidRefNameError } from "../errors/InvalidRefNameError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

// ============================================================================
// STASH TYPES
// ============================================================================

/**
 * Stash operation type
 */
export type StashOp = 'push' | 'pop' | 'apply' | 'drop' | 'list' | 'clear' | 'create'

/**
 * Stash change type
 */
export type StashChangeType = 'equal' | 'modify' | 'add' | 'remove' | 'unknown'

/**
 * stash api, supports  {'push' | 'pop' | 'apply' | 'drop' | 'list' | 'clear' | 'create'} StashOp
 * _note_,
 * - all stash operations are done on tracked files only with loose objects, no packed objects
 * - when op === 'push', both working directory and index (staged) changes will be stashed, tracked files only
 * - when op === 'push', message is optional, and only applicable when op === 'push'
 * - when op === 'apply | pop', the stashed changes will overwrite the working directory, no abort when conflicts
 * - when op === 'create', creates a stash commit without modifying working directory or refs, returns the commit hash
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - [required] a file system client
 * @param {string} [args.dir] - [required] The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [optional] The [git directory](dir-vs-gitdir.md) path
 * @param {'push' | 'pop' | 'apply' | 'drop' | 'list' | 'clear' | 'create'} [args.op = 'push'] - [optional] name of stash operation, default to 'push'
 * @param {string} [args.message = ''] - [optional] message to be used for the stash entry, only applicable when op === 'push' or 'create'
 * @param {number} [args.refIdx = 0] - [optional - Number] stash ref index of entry, only applicable when op === ['apply' | 'drop' | 'pop'], refIdx >= 0 and < num of stash pushed
 * @returns {Promise<string | void>}  Resolves successfully when stash operations are complete. Returns commit hash for 'create' operation.
 *
 * @example
 * // stash changes in the working directory and index
 * let dir = '/tutorial'
 * await fs.promises.writeFile(`${dir}/a.txt`, 'original content - a')
 * await fs.promises.writeFile(`${dir}/b.js`, 'original content - b')
 * await git.add({ fs, dir, filepath: [`a.txt`,`b.txt`] })
 * let sha = await git.commit({
 *   fs,
 *   dir,
 *   author: {
 *     name: 'Mr. Stash',
 *     email: 'mstasher@stash.com',
 *   },
 *   message: 'add a.txt and b.txt to test stash'
 * })
 * console.log(sha)
 *
 * await fs.promises.writeFile(`${dir}/a.txt`, 'stashed chang- a')
 * await git.add({ fs, dir, filepath: `${dir}/a.txt` })
 * await fs.promises.writeFile(`${dir}/b.js`, 'work dir change. not stashed - b')
 *
 * await git.stash({ fs, dir }) // default gitdir and op
 *
 * console.log(await git.status({ fs, dir, filepath: 'a.txt' })) // 'unmodified'
 * console.log(await git.status({ fs, dir, filepath: 'b.txt' })) // 'unmodified'
 *
 * const refLog = await git.stash({ fs, dir, op: 'list' })
 * console.log(refLog) // [{stash{#} message}]
 *
 * await git.stash({ fs, dir, op: 'apply' }) // apply the stash
 *
 * console.log(await git.status({ fs, dir, filepath: 'a.txt' })) // 'modified'
 * console.log(await git.status({ fs, dir, filepath: 'b.txt' })) // '*modified'
 *
 * // create a stash commit without modifying working directory
 * const stashCommitHash = await git.stash({ fs, dir, op: 'create', message: 'my stash' })
 * console.log(stashCommitHash) // returns the stash commit hash
 */
export async function stash({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  op = 'push',
  message = '',
  refIdx = 0,
  cache = {},
  autoDetectConfig = true,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  op?: StashOp
  message?: string
  refIdx?: number
  cache?: Record<string, unknown>
  autoDetectConfig?: boolean
}): Promise<string | unknown[] | void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, dir: effectiveDir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      op,
      message,
      refIdx,
      autoDetectConfig,
    })

    assertParameter('op', op)

    const stashMap: Record<StashOp, Function> = {
      push: _stashPush,
      apply: _stashApply,
      drop: _stashDrop,
      list: _stashList,
      clear: _stashClear,
      pop: _stashPop,
      create: _stashCreate,
    }

    const opsNeedRefIdx: StashOp[] = ['apply', 'drop', 'pop']

    const folders = ['refs', 'logs', 'logs/refs']
    await Promise.all(
      folders
        .map(f => join(effectiveGitdir, f))
        .map(async folder => {
          if (!(await fs.exists(folder))) {
            await fs.mkdir(folder)
          }
        })
    )

    const opFunc = stashMap[op]
    if (opFunc) {
      if (opsNeedRefIdx.includes(op) && refIdx < 0) {
        throw new InvalidRefNameError(
          `stash@${refIdx}`,
          'number that is in range of [0, num of stash pushed]'
        )
      }
      return await opFunc({ fs, dir: effectiveDir, gitdir: effectiveGitdir, message, refIdx, cache, repo })
    }
    throw new Error(`To be implemented: ${op}`)
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.stash'
    throw err
  }
}

/**
 * Common logic for creating a stash commit
 * @private
 */
async function _createStashCommit({ fs, dir, gitdir, message = '', cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; message?: string; cache?: Record<string, unknown>; repo?: Repository }) {
  // CRITICAL: Check for author FIRST - this must be the very first thing we do
  // This ensures we throw MissingNameError before any other errors (NotFoundError, etc.)
  // This matches git's behavior where it checks for author before checking for changes
  // DO NOT call repo.getGitdir() or any other repo methods before this check
  // Use the provided gitdir directly to avoid any HEAD resolution or other operations
  try {
    await getStashAuthor({ fs, gitdir, repo }) // ensure there is an author
  } catch (err) {
    // If author check fails, throw immediately (don't check for changes, don't resolve HEAD, etc.)
    throw err
  }
  
  // Now that author check passed, we can safely resolve gitdir through repo if needed
  let effectiveGitdir: string
  try {
    effectiveGitdir = repo ? await repo.getGitdir() : gitdir
  } catch {
    // If getGitdir fails, this shouldn't happen but handle it gracefully
    effectiveGitdir = gitdir // Fallback to provided gitdir
  }
  // Ensure effectiveGitdir is defined (TypeScript guard)
  if (!effectiveGitdir) {
    throw new MissingParameterError('gitdir')
  }
  // TypeScript now knows effectiveGitdir is string
  const finalEffectiveGitdir: string = effectiveGitdir
  // Ensure dir is defined (default to empty string if not provided)
  const finalDir: string = dir || ''

  // Use Repository's cache and gitdir if available
  // IMPORTANT: Use the provided cache directly - Repository uses the same cache instance if provided
  // This ensures add() and stash() share the same cache for index synchronization
  const effectiveCache = cache // Always use the provided cache to ensure consistency with add()

  // CRITICAL: Check for changes BEFORE resolving HEAD
  // This ensures we throw "nothing to stash" error before trying to resolve HEAD
  // which might fail with NotFoundError in a fresh repository
  // Ensure index is read from disk before writeTreeChanges
  if (repo) {
    // Force fresh read to bypass cache
    if (repo.gitBackend) {
      try {
        await repo.gitBackend.readIndex()
      } catch {
        // Index doesn't exist, that's okay
      }
    }
  } else {
    // Fallback: use direct readIndex for backward compatibility
    const { readIndex } = await import('../git/index/readIndex.ts')
    await readIndex({ fs, gitdir: finalEffectiveGitdir })
  }

  // Check for staged changes (HEAD vs INDEX) - but don't resolve HEAD yet
  // We'll use writeTreeChanges which will handle HEAD resolution internally
  // If HEAD doesn't exist, writeTreeChanges will throw NotFoundError, which we catch
  let indexTree: string | null = null
  try {
    indexTree = await writeTreeChanges({
      fs,
      dir: finalDir,
      gitdir: finalEffectiveGitdir,
      cache: effectiveCache,
      treePair: [WalkerFactory.tree({ ref: 'HEAD' }), 'stage'],
    })
  } catch (err) {
    // If HEAD doesn't exist, treat it as no staged changes
    // This can happen in a fresh repository
    // GitWalkerRepo already handles missing HEAD by using empty tree, so this shouldn't happen
    // But if it does, catch it and treat as no changes
    if (err instanceof NotFoundError) {
      // Check if the error is about HEAD or a ref
      const errorMsg = (err as any).message || (err as any).data?.what || ''
      if (errorMsg.includes('HEAD') || errorMsg.includes('ref')) {
        indexTree = null
      } else {
        throw err
      }
    } else {
      throw err
    }
  }

  // Check for worktree changes (HEAD/STAGE vs WORKDIR)
  // If HEAD doesn't exist and no staged changes, compare empty tree vs WORKDIR
  const workDirCompareBase = indexTree ? WalkerFactory.stage() : WalkerFactory.tree({ ref: 'HEAD' })
  let worktreeTree: string | null = null
  try {
    worktreeTree = await writeTreeChanges({
      fs,
      dir: finalDir,
      gitdir: finalEffectiveGitdir,
      cache: effectiveCache,
      treePair: [workDirCompareBase, 'workdir'],
    })
  } catch (err) {
    // If HEAD doesn't exist, treat it as no worktree changes
    // This can happen in a fresh repository
    // GitWalkerRepo already handles missing HEAD by using empty tree, so this shouldn't happen
    // But if it does, catch it and treat as no changes
    if (err instanceof NotFoundError) {
      // Check if the error is about HEAD or a ref
      const errorMsg = (err as any).message || (err as any).data?.what || ''
      if (errorMsg.includes('HEAD') || errorMsg.includes('ref')) {
        worktreeTree = null
      } else {
        throw err
      }
    } else {
      throw err
    }
  }

  // If no changes found, throw error BEFORE trying to resolve HEAD
  if (!worktreeTree && !indexTree) {
    throw new NotFoundError('changes, nothing to stash')
  }

  // NOW we can safely resolve HEAD - we know there are changes to stash
  // prepare the stash commit: first parent is the current branch HEAD
  // Use Repository.resolveRefDirect() or direct resolveRef() for consistency
  // Handle the case where HEAD doesn't exist (fresh repo with no commits)
  let headCommit: string
  try {
    if (repo) {
      headCommit = await repo.resolveRefDirect('HEAD')
    } else {
      const { resolveRef } = await import('../git/refs/readRef.ts')
      headCommit = await resolveRef({ fs, gitdir: effectiveGitdir, ref: 'HEAD' })
    }
  } catch (err) {
    // HEAD doesn't exist - this means there are no commits yet
    // Stash requires at least one commit, so throw an appropriate error
    throw new NotFoundError('HEAD')
  }

  // Now that we know HEAD exists, get the branch name
  const branch = await _currentBranch({
    fs,
    gitdir: effectiveGitdir,
    fullname: false
  }) || 'HEAD' // Fallback to 'HEAD' if branch is undefined (detached HEAD)

  const headCommitObj = await readCommit({ fs, dir, gitdir: effectiveGitdir, oid: headCommit })
  const headMsg = headCommitObj.commit.message

  // Native git stash structure:
  // - Parent 1: HEAD commit
  // - Parent 2: Index commit (if staged changes exist) - this commit's tree = index state
  // - Stash commit tree: Worktree state (working directory)
  
  const stashCommitParents: string[] = [headCommit]
  let indexCommitOid: string | null = null

  // Step 1: Create index commit if staged changes exist
  // We already computed indexTree above, so use it
  if (indexTree) {
    // Create index commit: tree = index state, parent = [HEAD]
    // This commit's tree represents the INDEX state
    indexCommitOid = await writeStashCommit({
      fs,
      gitdir: effectiveGitdir,
      message: `index on ${branch}`,
      tree: indexTree,
      parent: [headCommit],
      repo,
    })
    stashCommitParents.push(indexCommitOid)
  }

  // Step 2: Use the worktree tree we already computed above
  // The worktree tree represents the WORKING DIRECTORY state
  // We already checked for changes above, so worktreeTree or indexTree must exist

  // Step 3: Create stash commit with tree = worktree state
  // Parents: [HEAD, indexCommit] (if index commit exists)
  const stashMsg =
    (message.trim() || `WIP on ${branch}`) +
    `: ${headCommit.substring(0, 7)} ${headMsg}`

  // If no worktree changes but index changes exist, use index tree as worktree tree
  // (This matches git's behavior when only staged changes exist)
  const stashCommitTree = worktreeTree || indexTree!

  const stashCommit = await writeStashCommit({
    fs,
    gitdir: effectiveGitdir,
    message: stashMsg,
    tree: stashCommitTree,
    parent: stashCommitParents,
    repo,
  })

  return { stashCommit, stashMsg, branch }
}

export async function _stashPush({ fs, dir, gitdir, message = '', cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; message?: string; cache?: Record<string, unknown>; repo?: Repository }): Promise<string> {
  // CRITICAL: Check for author FIRST - before any other operations
  // This ensures we throw MissingNameError before any other errors (NotFoundError, etc.)
  // This matches git's behavior where it checks for author before checking for changes
  try {
    await getStashAuthor({ fs, gitdir, repo }) // ensure there is an author
  } catch (err) {
    // If author check fails, throw immediately (don't check for unmerged paths, don't read index, etc.)
    throw err
  }
  
  // IMPORTANT: Always use the provided cache directly to ensure consistency with add()
  // Repository.open uses the provided cache if given, so repo.cache === cache
  // But to be safe, always use the provided cache parameter
  const effectiveCache = cache
  const effectiveGitdir = repo ? await repo.getGitdir() : gitdir
  
  // Check for unmerged paths before stashing
  if (repo) {
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    let indexBuffer: UniversalBuffer
    if (repo.gitBackend) {
      try {
        indexBuffer = await repo.gitBackend.readIndex()
      } catch {
        indexBuffer = UniversalBuffer.alloc(0)
      }
    } else {
      throw new Error('gitBackend is required')
    }
    
    let index: GitIndex
    if (indexBuffer.length === 0) {
      index = new GitIndex()
    } else {
      const objectFormat = await detectObjectFormat(fs, effectiveGitdir, repo.cache, repo.gitBackend)
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
    
    // Check for unmerged paths
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }
  } else {
    // Fallback: use direct readIndex and check unmerged paths manually
    const { readIndex } = await import('../git/index/readIndex.ts')
    const index = await readIndex({ fs, gitdir: effectiveGitdir })
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }
  }
  
  const { stashCommit, stashMsg, branch } = await _createStashCommit({
    fs,
    dir,
    gitdir: effectiveGitdir,
    message,
    cache: effectiveCache,
    repo,
  })

  // next, write this commit into .git/refs/stash:
  await writeStashRef({ fs, gitdir: effectiveGitdir, stashCommit })

  // write the stash commit to the logs
  await writeStashReflogEntry({
    fs,
    gitdir: effectiveGitdir,
    stashCommit,
    message: stashMsg,
    repo,
  })

  // Finally, reset worktree and index to HEAD
  // Get HEAD commit to get tree OID, then use WorkdirManager.checkout directly
  // This ensures we're checking out the exact HEAD tree, not just the branch ref
  // Use Repository.resolveRefDirect() or direct resolveRef() for consistency
  // Note: We already resolved HEAD in _createStashCommit, so this should always succeed
  let headCommit: string
  try {
    if (repo) {
      headCommit = await repo.resolveRefDirect('HEAD')
    } else {
      const { resolveRef } = await import('../git/refs/readRef.ts')
      headCommit = await resolveRef({ fs, gitdir: effectiveGitdir, ref: 'HEAD' })
    }
  } catch (err) {
    // This should never happen since _createStashCommit already resolved HEAD
    // But if it does, re-throw with context
    throw new Error(`Failed to resolve HEAD after creating stash commit: ${err}`)
  }
  const headCommitObj = await readCommit({ fs, dir, gitdir: effectiveGitdir, oid: headCommit })
  const headTreeOid = headCommitObj.commit.tree
  
  // CRITICAL: Check index state before checkout to see what's staged
  if (repo) {
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    let indexBuffer: UniversalBuffer
    if (repo.gitBackend) {
      try {
        indexBuffer = await repo.gitBackend.readIndex()
      } catch {
        indexBuffer = UniversalBuffer.alloc(0)
      }
    } else {
      throw new Error('gitBackend is required')
    }
    
    let index: GitIndex
    if (indexBuffer.length === 0) {
      index = new GitIndex()
    } else {
      const objectFormat = await detectObjectFormat(fs, effectiveGitdir, repo.cache, repo.gitBackend)
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
    
    const indexFilepaths = Array.from(index.entriesMap.keys())
  }
  
  // Use WorkdirManager.checkout directly since we have a treeOid, not a ref
  // This ensures consistent cache, gitdir, and index synchronization
  // repo.checkout() expects a ref string, but we have a treeOid, so use WorkdirManager directly
  await WorkdirManager.checkout({
    fs,
    dir: dir || '',
    gitdir: effectiveGitdir,
    treeOid: headTreeOid,
    force: true, // force checkout to discard changes
    cache: effectiveCache,
  })

  return stashCommit
}

export async function _stashCreate({ fs, dir, gitdir, message = '', cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; message?: string; cache?: Record<string, unknown>; repo?: Repository }): Promise<string> {
  // CRITICAL: Check for author FIRST - before any other operations
  // This ensures we throw MissingNameError before any other errors (NotFoundError, etc.)
  // This matches git's behavior where it checks for author before checking for changes
  try {
    await getStashAuthor({ fs, gitdir, repo }) // ensure there is an author
  } catch (err) {
    // If author check fails, throw immediately (don't check for unmerged paths, don't read index, etc.)
    throw err
  }
  
  // Check for unmerged paths before creating stash
  const effectiveGitdir = repo ? await repo.getGitdir() : gitdir
  if (repo) {
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    let indexBuffer: UniversalBuffer
    if (repo.gitBackend) {
      try {
        indexBuffer = await repo.gitBackend.readIndex()
      } catch {
        indexBuffer = UniversalBuffer.alloc(0)
      }
    } else {
      throw new Error('gitBackend is required')
    }
    
    let index: GitIndex
    if (indexBuffer.length === 0) {
      index = new GitIndex()
    } else {
      const objectFormat = await detectObjectFormat(fs, effectiveGitdir, repo.cache, repo.gitBackend)
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
    
    // Check for unmerged paths
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }
  } else {
    // Fallback: use direct readIndex and check unmerged paths manually
    const { readIndex } = await import('../git/index/readIndex.ts')
    const index = await readIndex({ fs, gitdir: effectiveGitdir })
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }
  }
  
  const { stashCommit } = await _createStashCommit({
    fs,
    dir,
    gitdir,
    message,
    cache,
    repo,
  })

  // Return the stash commit hash without modifying refs or working directory
  return stashCommit
}

export async function _stashApply({ fs, dir, gitdir, refIdx = 0, cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; refIdx?: number; cache?: Record<string, unknown>; repo?: Repository }): Promise<void> {
  // Use Repository's cache and gitdir if available
  const effectiveCache = repo ? repo.cache : cache
  let effectiveGitdir = repo ? await repo.getGitdir() : gitdir
  // Ensure effectiveGitdir is defined
  if (!effectiveGitdir) {
    throw new MissingParameterError('gitdir')
  }
  const finalEffectiveGitdir: string = effectiveGitdir
  // Ensure dir is defined (default to empty string if not provided)
  const finalDir: string = dir || ''
  
  // Check for unmerged paths before applying stash
  if (repo) {
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    let indexBuffer: UniversalBuffer
    if (repo.gitBackend) {
      try {
        indexBuffer = await repo.gitBackend.readIndex()
      } catch {
        indexBuffer = UniversalBuffer.alloc(0)
      }
    } else {
      throw new Error('gitBackend is required')
    }
    
    let index: GitIndex
    if (indexBuffer.length === 0) {
      index = new GitIndex()
    } else {
      const objectFormat = await detectObjectFormat(fs, effectiveGitdir, repo.cache, repo.gitBackend)
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
    
    // Check for unmerged paths
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }
  } else {
    // Fallback: use direct readIndex and check unmerged paths manually
    const { readIndex } = await import('../git/index/readIndex.ts')
    const index = await readIndex({ fs, gitdir: effectiveGitdir })
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }
  }
  
  // get the stash commit object
  const stashCommit = await readStashCommit({ fs, gitdir: effectiveGitdir, refIdx })
  const { parent: stashParents = null, tree: stashCommitTree } = stashCommit.commit
    ? stashCommit.commit
    : { parent: null, tree: null }
  if (!stashParents || !Array.isArray(stashParents) || !stashCommitTree) {
    return // no stash found
  }

  // Native git stash structure:
  // - Parent 1: HEAD commit (used for reference)
  // - Parent 2: Index commit (if exists) - this commit's tree = index state
  // - Stash commit tree: Worktree state (working directory)

  const headCommit = stashParents[0]
  const indexCommit = stashParents.length > 1 ? stashParents[1] : null

  // Step 1: Apply index changes (if index commit exists)
  // Compare index commit tree vs HEAD tree to get index changes
  if (indexCommit) {
    const indexCommitObj = await _readCommit({
      fs,
      cache: effectiveCache,
      gitdir: effectiveGitdir,
      oid: indexCommit,
    })
    // Apply index commit tree to index (stage the changes)
    await applyTreeChanges({
      fs,
      dir: finalDir,
      gitdir: finalEffectiveGitdir,
      cache: effectiveCache,
      stashCommit: indexCommit,
      parentCommit: headCommit,
      wasStaged: true, // This is the index commit, apply to index
    })
  }

  // Step 2: Apply worktree changes
  // The stash commit's tree represents the worktree state
  // We need to apply the stash commit tree to the workdir
  // Compare stash commit tree vs the base (HEAD if no index, or current worktree state)
  // Actually, we should apply the stash commit tree directly to workdir
  // by comparing it to what's currently in workdir (or HEAD if workdir is clean)
  
  // Get the current HEAD tree for comparison
  const headCommitObj = await _readCommit({
    fs,
    cache: effectiveCache,
    gitdir: finalEffectiveGitdir,
    oid: headCommit,
  })
  const headTreeOid = headCommitObj.commit.tree
  
  // Apply worktree changes: stash commit tree vs HEAD tree (or index tree if index was applied)
  // If index was applied, the workdir might have changed, so we compare stash tree vs current state
  // But actually, we should compare stash tree vs the base that was used when stashing
  const worktreeBaseCommit = indexCommit || headCommit
  await applyTreeChanges({
    fs,
    dir: finalDir,
    gitdir: finalEffectiveGitdir,
    cache: effectiveCache,
    stashCommit: stashCommit.oid, // Stash commit OID - its tree is the worktree state
    parentCommit: worktreeBaseCommit, // Base commit - compare stash tree vs this commit's tree
    wasStaged: false, // This is worktree, apply to workdir only
  })
}

export async function _stashDrop({ fs, dir, gitdir, refIdx = 0, cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; refIdx?: number; cache?: Record<string, unknown>; repo?: Repository }): Promise<void> {
  const stashCommit = await readStashCommit({ fs, gitdir, refIdx })
  if (!stashCommit.commit) {
    return // no stash found
  }
  // remove stash ref first
  const stashRefPath = getStashRefPath(gitdir)
  await acquireLock(stashRefPath, async () => {
    if (await fs.exists(stashRefPath)) {
      await fs.rm(stashRefPath)
    }
  })

  // read from stash reflog and list the stash commits
  const reflogEntries = await readStashReflogs({ fs, gitdir, parsed: false })
  if (!reflogEntries.length) {
    return // no stash reflog entry
  }

  // remove the specified stash reflog entry from reflogEntries, then update the stash reflog
  reflogEntries.splice(refIdx, 1)

  const stashReflogPath = getStashReflogsPath(gitdir)
  await acquireLock({ filepath: stashReflogPath }, async () => {
    if (reflogEntries.length) {
      // Reflog entries are stored newest-first, so no need to reverse
      // Join entries with newlines and ensure file ends with newline
      await fs.write(
        stashReflogPath,
        (reflogEntries as string[]).join('\n') + '\n',
        'utf8'
      )
      // First entry (index 0) is the newest/most recent stash
      const firstStashCommit =
        (reflogEntries as string[])[0].split(' ')[1]
      await writeStashRef({ fs, gitdir, stashCommit: firstStashCommit })
    } else {
      // remove the stash reflog file if no entry left
      await fs.rm(stashReflogPath)
    }
  })
}

export async function _stashList({ fs, dir, gitdir, cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; cache?: Record<string, unknown>; repo?: Repository }): Promise<unknown[]> {
  return readStashReflogs({ fs, gitdir, parsed: true })
}

export async function _stashClear({ fs, dir, gitdir, cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; cache?: Record<string, unknown>; repo?: Repository }): Promise<void> {
  const stashRefPath = [getStashRefPath(gitdir), getStashReflogsPath(gitdir)]

  // acquireLock expects a single ref, so we need to acquire locks sequentially
  await acquireLock({ filepath: getStashRefPath(gitdir) }, async () => {
    await acquireLock({ filepath: getStashReflogsPath(gitdir) }, async () => {
      await Promise.all(
        stashRefPath.map(async path => {
          if (await fs.exists(path)) {
            return fs.rm(path)
          }
        })
      )
    })
  })
}

export async function _stashPop({ fs, dir, gitdir, refIdx = 0, cache = {}, repo }: { fs: FileSystemProvider; dir?: string; gitdir: string; refIdx?: number; cache?: Record<string, unknown>; repo?: Repository }): Promise<void> {
  await _stashApply({ fs, dir, gitdir, refIdx, cache, repo })
  await _stashDrop({ fs, dir, gitdir, refIdx, cache, repo })
}
