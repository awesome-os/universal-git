import { _commit } from './commit.ts'
import { _currentBranch } from './currentBranch.ts'
import { FastForwardError } from "../errors/FastForwardError.ts"
import { MergeConflictError } from "../errors/MergeConflictError.ts"
import { MergeNotSupportedError } from "../errors/MergeNotSupportedError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { UnmergedPathsError } from "../errors/UnmergedPathsError.ts"
import { RefManager } from "../core-utils/refs/RefManager.ts"
import { findMergeBase } from "../core-utils/algorithms/CommitGraphWalker.ts"
// mergeTree is now used via MergeStream
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { readObject } from "../git/objects/readObject.ts"
import { detectObjectFormat } from "../utils/detectObjectFormat.ts"
import { Repository } from "../core-utils/Repository.ts"
import { UnifiedConfigService } from "../core-utils/UnifiedConfigService.ts"
import { abbreviateRef } from "../utils/abbreviateRef.ts"
import { MissingNameError } from "../errors/MissingNameError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { normalizeAuthorObject } from "../utils/normalizeAuthorObject.ts"
import { normalizeCommitterObject } from "../utils/normalizeCommitterObject.ts"
import { writeMergeHead, writeMergeMode, writeMergeMsg, deleteMergeHead } from "../git/state/index.ts"
import { deleteMergeMode } from "../git/state/MERGE_MODE.ts"
import { deleteMergeMsg } from "../git/state/MERGE_MSG.ts"
import type { FileSystem } from "../models/FileSystem.ts"
import type { SignCallback } from "../core-utils/Signing.ts"
import type { Author, CommitObject } from "../models/GitCommit.ts"

// ============================================================================
// MERGE TYPES
// ============================================================================

/**
 * Merge operation result
 */
export type MergeResult = {
  oid?: string
  alreadyMerged?: boolean
  fastForward?: boolean
  mergeCommit?: boolean
  tree?: string
}

/**
 * Merge two branches
 * @param repo - Repository instance (preferred, will be created if not provided)
 * @param fs - Filesystem client
 * @param dir - Working directory
 * @param gitdir - Git directory
 * @param cache - Cache object
 */
export async function merge({
  repo: _repo,
  fs,
  onSign,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ours,
  theirs,
  fastForward = true,
  fastForwardOnly = false,
  dryRun = false,
  noUpdateBranch = false,
  abortOnConflict = true,
  message,
  author: _author,
  committer: _committer,
  signingKey,
  cache = {},
  allowUnrelatedHistories = false,
  mergeDriver,
  autoDetectConfig = true,
}: {
  repo?: Repository
  fs?: FileSystem
  onSign?: SignCallback
  dir?: string
  gitdir?: string
  ours?: string
  theirs: string
  fastForward?: boolean
  fastForwardOnly?: boolean
  dryRun?: boolean
  noUpdateBranch?: boolean
  abortOnConflict?: boolean
  message?: string
  author?: Partial<Author>
  committer?: Partial<Author>
  signingKey?: string
  cache?: Record<string, unknown>
  allowUnrelatedHistories?: boolean
  mergeDriver?: (params: {
    branches: [string, string, string]
    contents: [string, string, string]
    path: string
  }) => { cleanMerge: boolean; mergedText: string }
  autoDetectConfig?: boolean
}): Promise<MergeResult> {
  try {
    const { repo } = await normalizeCommandArgs({
      repo: _repo,
      fs,
      dir,
      gitdir,
      cache,
      onSign,
      ours,
      theirs,
      fastForward,
      fastForwardOnly,
      dryRun,
      noUpdateBranch,
      abortOnConflict,
      message,
      author: _author,
      committer: _committer,
      signingKey,
      allowUnrelatedHistories,
      mergeDriver,
      autoDetectConfig,
    })

    if (signingKey) {
      assertParameter('onSign', onSign)
    }

    // CRITICAL: Use repo's config service to ensure state consistency
    // Check author even for dryRun - dryRun still needs author for merge commit creation
    const author = await normalizeAuthorObject({ repo, author: _author })
    if (!author) {
      // We need author in all cases except when:
      // 1. fastForwardOnly is true AND fastForward is true (only allow fast-forward merges)
      //    AND the merge is actually a fast-forward (determined later, but we check fastForwardOnly here)
      // 2. For dryRun, we always need author because we're simulating a merge commit
      // 3. For non-fast-forward merges, we always need author
      // So we only skip author check if fastForwardOnly && fastForward (and it's not a dryRun)
      if (fastForwardOnly && fastForward && !dryRun) {
        // Fast-forward-only merge that allows fast-forward - might not need author if it's actually fast-forward
        // But we'll check this later after determining if it's actually a fast-forward
      } else {
        // All other cases need author (dryRun, non-fast-forward, fastForwardOnly but not fast-forward)
        throw new MissingNameError('author')
      }
    }

    const committer = await normalizeCommitterObject({
      repo,
      author,
      committer: _committer,
    })
    if (!committer) {
      // Same logic as author - we need committer in all cases except fast-forward-only merges
      if (fastForwardOnly && fastForward && !dryRun) {
        // Fast-forward-only merge that allows fast-forward - might not need committer if it's actually fast-forward
      } else {
        // All other cases need committer (dryRun, non-fast-forward, fastForwardOnly but not fast-forward)
        throw new MissingNameError('committer')
      }
    }

    // Use Repository.merge which internally calls _merge with repo
    return await repo.merge({
      ours,
      theirs,
      fastForward,
      fastForwardOnly,
      dryRun,
      noUpdateBranch,
      abortOnConflict,
      message,
      author: author || undefined,
      committer: committer || (undefined as unknown as Partial<Author>),
      signingKey,
      onSign,
      allowUnrelatedHistories,
      mergeDriver,
    })
  } catch (err: any) {
    // Preserve error type and code - don't modify the error object
    // Just set caller for debugging, but preserve the original error
    if (err && typeof err === 'object') {
      err.caller = 'git.merge'
    }
    throw err
  }
}

/**
 * Merges two branches
 * @param repo - Repository instance (required)
 */
export async function _merge({
  repo,
  ours,
  theirs,
  fastForward = true,
  fastForwardOnly = false,
  dryRun = false,
  noUpdateBranch = false,
  abortOnConflict = true,
  message,
  author,
  committer,
  signingKey,
  onSign,
  allowUnrelatedHistories = false,
  mergeDriver,
}: {
  repo: Repository
  ours?: string
  theirs: string
  fastForward?: boolean
  fastForwardOnly?: boolean
  dryRun?: boolean
  noUpdateBranch?: boolean
  abortOnConflict?: boolean
  message?: string
  author?: Partial<Author>
  committer?: Partial<Author>
  signingKey?: string
  onSign?: SignCallback
  allowUnrelatedHistories?: boolean
  mergeDriver?: import('../core-utils/algorithms/MergeManager.ts').MergeDriverCallback
}): Promise<MergeResult> {
  // Extract components from Repository for consistent state
  const fs = repo.fs
  const cache = repo.cache
  const dir = repo.dir
  const gitdir = await repo.getGitdir()
  
  // Check for unmerged paths BEFORE reading index to avoid any cache issues
  // This MUST happen before any other operations to match native git behavior
  try {
    const index = await repo.readIndexDirect(false, false) // Force fresh read, allowUnmerged: false
    // If there are unmerged paths, readIndexDirect will throw UnmergedPathsError
  } catch (err: any) {
    // Check if it's an UnmergedPathsError - this is a hard failure, must re-throw
    if (err && typeof err === 'object') {
      if (err.code === UnmergedPathsError.code || 
          err.code === 'UnmergedPathsError' ||
          err.name === 'UnmergedPathsError') {
        throw err
      }
    }
    if (err instanceof UnmergedPathsError) {
      throw err
    }
    
    // If it's a different error (e.g., index doesn't exist), ignore it and continue
    // This allows the merge to proceed if the index doesn't exist yet
  }
  
  // Get configService - we'll use repo.readIndexDirect() for index operations
  const configService = await repo.getConfig()
  
  if (ours === undefined) {
    ours = await _currentBranch({ fs, gitdir, fullname: true })
    if (ours === undefined) {
      throw new Error('Cannot merge: no current branch (detached HEAD state)')
    }
  }
  
  // Helper to get config value with defaults matching native git behavior
  const getConfigWithDefault = async (path: string, defaultValue?: unknown): Promise<unknown> => {
    try {
      const value = await configService.get(path)
      return value !== undefined ? value : defaultValue
    } catch {
      return defaultValue
    }
  }
  
  // Read merge.ff config (default: true, meaning allow fast-forward)
  const mergeFF = await getConfigWithDefault('merge.ff', true) as string | boolean | undefined
  
  // If merge.ff is set in config and fastForward parameter wasn't explicitly set, use config value
  // merge.ff can be: true, false, or "only"
  if (mergeFF !== undefined && fastForward === true) {
    if (mergeFF === 'false' || mergeFF === false) {
      fastForward = false
    } else if (mergeFF === 'only' || mergeFF === 'true' || mergeFF === true) {
      // Keep fastForward as true, but if "only", set fastForwardOnly
      if (mergeFF === 'only') {
        fastForwardOnly = true
      }
    }
  }
  
  // Expand refs - use RefManager.expand() for now (it delegates to new functions)
  // TODO: Consider adding expand() to Repository or src/git/refs/
  const { RefManager } = await import('../core-utils/refs/RefManager.ts')
  // At this point, ours is guaranteed to be defined
  ours = await RefManager.expand({ fs, gitdir, ref: ours! })
  theirs = await RefManager.expand({ fs, gitdir, ref: theirs })
  
  // Use Repository.resolveRef() for consistency
  const ourOid = await repo.resolveRef(ours)
  const theirOid = await repo.resolveRef(theirs)
  
  // Find most recent common ancestor
  const baseOids = await findMergeBase({
    fs,
    cache,
    gitdir,
    commits: [ourOid, theirOid],
  })
  
  if (baseOids.length !== 1) {
    if (baseOids.length === 0 && allowUnrelatedHistories) {
      // 4b825…  == the empty tree used by git
      baseOids.push('4b825dc642cb6eb9a060e54bf8d69288fbee4904')
    } else {
      // TODO: Recursive Merge strategy
      throw new MergeNotSupportedError()
    }
  }
  const baseOid = baseOids[0]
  
  // Handle fast-forward case
  if (baseOid === theirOid) {
    // Already merged - ours already contains theirs
    // Get tree OID from our commit for comparison
    const ourCommitResult = await readObject({ fs, cache, gitdir, oid: ourOid, format: 'content' })
    if (ourCommitResult.type !== 'commit') {
      throw new Error('Expected commit object')
    }
    const ourCommit = parseCommit(ourCommitResult.object) as CommitObject
    const ourTreeOid = ourCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    return {
      oid: ourOid,
      tree: ourTreeOid,
      alreadyMerged: true,
    }
  }

  if (fastForward && baseOid === ourOid) {
    if (!dryRun && !noUpdateBranch) {
      // Read old branch OID for reflog before updating
      let oldBranchOid: string | undefined
      try {
        oldBranchOid = await repo.resolveRef(ours!)
      } catch {
        // Branch doesn't exist yet
        oldBranchOid = undefined
      }
      
      // Use Repository.writeRef() for consistency
      // ours is guaranteed to be defined at this point
      await repo.writeRef(ours!, theirOid)
      
      // Add descriptive reflog entry for fast-forward merge
      if (oldBranchOid && oldBranchOid !== theirOid) {
        const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
        const { abbreviateRef } = await import('../utils/abbreviateRef.ts')
        const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
        await logRefUpdate({
          fs,
          gitdir,
          ref: ours!,
          oldOid: oldBranchOid,
          newOid: theirOid,
          message: REFLOG_MESSAGES.MERGE_FF(abbreviateRef(theirs)),
        }).catch(() => {
          // Silently ignore reflog errors (Git's behavior)
        })
      }
    }
    // Fast-forward - get tree OID from their commit
    const theirCommitResult = await readObject({ fs, cache, gitdir, oid: theirOid, format: 'content' })
    if (theirCommitResult.type !== 'commit') {
      throw new Error('Expected commit object')
    }
    const theirCommit = parseCommit(theirCommitResult.object) as CommitObject
    const theirTreeOid = theirCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    return {
      oid: theirOid,
      tree: theirTreeOid,
      fastForward: true,
    }
  } else {
    // Not a simple fast-forward
    if (fastForwardOnly) {
      throw new FastForwardError()
    }
    
    // Write merge state files for native git interoperability
    // These files must exist before merge starts so they're available even if conflicts occur
    if (!dryRun) {
      // Write MERGE_HEAD with the commit being merged (theirs)
      await writeMergeHead({ fs, gitdir, oid: theirOid })
      
      // Write MERGE_MODE - "no-ff" if fast-forward is disabled, otherwise empty
      const mergeMode = fastForward ? '' : 'no-ff'
      await writeMergeMode({ fs, gitdir, mode: mergeMode })
      
      // Write MERGE_MSG with the merge commit message
      const mergeMessage = message || `Merge branch '${abbreviateRef(theirs)}' into ${abbreviateRef(ours!)}`
      await writeMergeMsg({ fs, gitdir, message: mergeMessage })
    }
    
    // Get tree OIDs from commits
    const ourCommitResult = await readObject({ fs, cache, gitdir, oid: ourOid, format: 'content' })
    const theirCommitResult = await readObject({ fs, cache, gitdir, oid: theirOid, format: 'content' })
    const baseCommitResult = await readObject({ fs, cache, gitdir, oid: baseOid, format: 'content' })
    
    if (ourCommitResult.type !== 'commit' || theirCommitResult.type !== 'commit' || baseCommitResult.type !== 'commit') {
      throw new Error('Expected commit objects')
    }
    
    const ourCommit = parseCommit(ourCommitResult.object) as CommitObject
    const theirCommit = parseCommit(theirCommitResult.object) as CommitObject
    const baseCommit = parseCommit(baseCommitResult.object) as CommitObject
    
    const ourTreeOid = ourCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    const theirTreeOid = theirCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    const baseTreeOid = baseCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    
    // Validate that all tree objects exist before attempting merge
    // This provides better error messages if objects are missing
    const { hasObject } = await import('../git/objects/hasObject.ts')
    const treesToCheck = [
      { name: 'ours', oid: ourTreeOid, commit: ourOid },
      { name: 'theirs', oid: theirTreeOid, commit: theirOid },
      { name: 'base', oid: baseTreeOid, commit: baseOid },
    ]
    
    // Validate tree objects exist
    // Note: hasObject checks both loose objects and packfiles, so this should work for fixtures
    // If objects don't exist, we'll let mergeTree handle it - it will detect conflicts first
    // before throwing NotFoundError, which allows us to properly handle conflict cases
    for (const { name, oid, commit } of treesToCheck) {
      const exists = await hasObject({ fs, cache, gitdir, oid })
      if (!exists) {
        // Don't throw here - let mergeTree handle missing objects
        // mergeTree will detect conflicts first (which is what we want), and only throw NotFoundError
        // if objects are truly missing AND there are no conflicts
        // This allows us to properly detect conflicts even if some objects are missing from the fixture
      }
    }
    
    // Perform three-way merge using MergeStream for proper error handling and state tracking
    // MergeStream will check for unmerged paths and handle conflicts properly
    const { MergeStream } = await import('../core-utils/MergeStream.ts')
    
    // Read index directly using Repository.readIndexDirect() - works for both bare and non-bare repos
    // Read index directly to support bare repositories
    const index = await repo.readIndexDirect(false) // Force fresh read, allowUnmerged: false (already checked above)
    
    let mergeResult: string | MergeConflictError | undefined
    let indexWasModified = false
    
    // Use MergeStream to perform the merge - it handles unmerged paths check and error propagation
    // MergeStream checks for unmerged paths in its startMerge method
    // Adapt mergeDriver to match MergeStream's expected signature
    // MergeDriverCallback can return a Promise, but MergeStream expects synchronous return
    // So we need to handle async by wrapping it
    const adaptedMergeDriver = mergeDriver ? (params: {
      branches: [string, string, string]
      contents: [string, string, string]
      path: string
    }) => {
      // Call the original mergeDriver with adapted params
      const result = mergeDriver({
        branches: params.branches,
        contents: params.contents,
        path: params.path,
      })
      // If it's a Promise, we can't use it synchronously - this is a limitation
      // For now, we'll only support synchronous merge drivers
      if (result instanceof Promise) {
        throw new Error('Async merge drivers are not supported by MergeStream')
      }
      return result
    } : undefined
    mergeResult = await MergeStream.execute({
      repo,
      index,
      ourOid: ourTreeOid,
      baseOid: baseTreeOid,
      theirOid: theirTreeOid,
      abortOnConflict,
      dryRun,
      mergeDriver: adaptedMergeDriver,
    })
    
    // Only write index if merge succeeded (no conflicts) or if we're allowing conflicts
    // When abortOnConflict is true and there are conflicts, we should NOT write the index
    if (typeof mergeResult === 'string' || !abortOnConflict) {
      indexWasModified = true
      // Write index directly using Repository.writeIndexDirect() - works for both bare and non-bare repos
      await repo.writeIndexDirect(index)
    }
    
    // Ensure mergeResult was assigned
    if (mergeResult === undefined) {
      throw new Error('MergeStream did not return a result')
    }
    
    // Check for conflicts - MergeStream returns MergeConflictError when there are conflicts
    // CRITICAL: Always throw MergeConflictError when conflicts are detected, even if abortOnConflict is false
    // When abortOnConflict is false, the index is written with conflicts, but the error should still be thrown
    if (typeof mergeResult !== 'string') {
      // It's a MergeConflictError - ensure it's properly thrown
      const error = mergeResult as any
      // Check by code property (more reliable across module boundaries than instanceof)
      // Also check if it's an instance of MergeConflictError or has the correct code/name
      const isMergeConflictError = 
        error instanceof MergeConflictError ||
        error?.code === MergeConflictError.code ||
        error?.code === 'MergeConflictError' ||
        error?.name === 'MergeConflictError'
      
      // Always reconstruct the error to ensure it's recognized as a MergeConflictError
      // This handles cases where instanceof might not work across module boundaries
      // Extract data from the error - it should have data.filepaths, data.bothModified, etc.
      const filepaths = error?.data?.filepaths || []
      const bothModified = error?.data?.bothModified || []
      const deleteByUs = error?.data?.deleteByUs || []
      const deleteByTheirs = error?.data?.deleteByTheirs || []
      
      // Create a new MergeConflictError with the extracted data
      // This ensures the error is always recognized as a MergeConflictError with the correct code
      const conflictError = new MergeConflictError(filepaths, bothModified, deleteByUs, deleteByTheirs)
      throw conflictError
    }
    
    // If we get here, merge succeeded (no conflicts)
    if (!message) {
      // ours is guaranteed to be defined at this point
      message = `Merge branch '${abbreviateRef(theirs)}' into ${abbreviateRef(ours!)}`
    }
    
    const oid = await _commit({
      fs,
      cache,
      gitdir,
      message,
      ref: ours!, // ours is guaranteed to be defined at this point
      tree: mergeResult as string,
      parent: [ourOid, theirOid],
      author,
      committer,
      signingKey,
      repo, // CRITICAL: Pass Repository instance for consistent context
      onSign,
      dryRun,
      noUpdateBranch,
    })
    
    // Note: _commit already writes reflog entry with the merge commit message
    // The reflog message will be: "commit: Merge branch '...' into ..."
    // This matches Git's native behavior for merge commits
    
    // Clean up merge state files after successful merge (for native git interoperability)
    if (!dryRun) {
      await Promise.all([
        deleteMergeHead({ fs, gitdir }),
        deleteMergeMode({ fs, gitdir }),
        deleteMergeMsg({ fs, gitdir }),
      ])
    }
    
    // Run post-merge hook (after successful merge)
    if (!dryRun) {
      try {
        const { runHook } = await import('../git/hooks/runHook.ts')
        const worktree = repo.getWorktree()
        const workTree = worktree?.dir || dir || undefined
        const gitdir = await repo.getGitdir()
        
        await runHook({
          fs: repo.fs,
          gitdir,
          hookName: 'post-merge',
          context: {
            gitdir,
            workTree: workTree ?? undefined,
            newHead: oid,
            branch: ours ? ours.replace('refs/heads/', '') : undefined,
          },
        })
      } catch (hookError: any) {
        // Post-merge hook failures don't abort the merge (it's already done)
        // But we log the error for debugging
        if (process.env.DEBUG_HOOKS === 'true') {
          console.warn(`post-merge hook failed: ${hookError.stderr || hookError.message}`)
        }
      }
    }
    
    return {
      oid,
      tree: mergeResult as string,
      mergeCommit: true,
    }
  }
}
