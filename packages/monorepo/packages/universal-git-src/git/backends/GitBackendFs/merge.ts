import { UniversalBuffer } from './utils/UniversalBuffer.ts'
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Merge operation for GitBackendFs
 */

export async function merge(
  this: GitBackendFs,
  ours: string,
  theirs: string,
  options?: {
    message?: string
    author?: Partial<import('../../../models/GitCommit.ts').Author>
    committer?: Partial<import('../../../models/GitCommit.ts').Author>
    fastForward?: boolean
    fastForwardOnly?: boolean
    abortOnConflict?: boolean
    dryRun?: boolean
    noUpdateBranch?: boolean
    allowUnrelatedHistories?: boolean
    cache?: Record<string, unknown>
  }
): Promise<
  | { oid: string; tree: string; mergeCommit: boolean; fastForward?: boolean; alreadyMerged?: boolean }
  | import('../../../git/errors/MergeConflictError.ts').MergeConflictError
> {
  const cache = options?.cache || {}
  const fastForward = options?.fastForward !== false
  const fastForwardOnly = options?.fastForwardOnly || false
  const dryRun = options?.dryRun || false
  const noUpdateBranch = options?.noUpdateBranch || false
  const abortOnConflict = options?.abortOnConflict !== false
  const allowUnrelatedHistories = options?.allowUnrelatedHistories || false
  const message = options?.message
  const author = options?.author
  const committer = options?.committer

  // Import required functions
  const { expandRef } = await import('../../../git/refs/expandRef.ts')
  const { abbreviateRef } = await import('./utils/abbreviateRef.ts')
  const { FastForwardError } = await import('../../../git/errors/FastForwardError.ts')
  const { MergeNotSupportedError } = await import('../../../git/errors/MergeNotSupportedError.ts')
  const { MergeConflictError } = await import('../../../git/errors/MergeConflictError.ts')
  const { UnmergedPathsError } = await import('../../../git/errors/UnmergedPathsError.ts')

  // Expand refs to full ref names using GitBackend
  const ourRef = await this.expandRef(ours, cache)
  const theirRef = await this.expandRef(theirs, cache)

  // Resolve refs to OIDs
  const ourOid = await this.readRef(ourRef, 5, cache)
  const theirOid = await this.readRef(theirRef, 5, cache)
  
  if (!ourOid || !theirOid) {
    throw new Error(`Cannot merge: refs not found (ours: ${ours}, theirs: ${theirs})`)
  }

  // Find merge base using the internal algorithm
  const objectFormat = await this.getObjectFormat(cache)
  const { findMergeBase: findMergeBaseInternal } = await import('../../../core-utils/algorithms/CommitGraphWalker.ts')
  const { parse: parseCommitInternal } = await import('../../../core-utils/parsers/Commit.ts')
  
  // Create readCommit function that uses GitBackend
  const readCommit = async (oid: string) => {
    const result = await this.readObject(oid, 'content', cache)
    return parseCommitInternal(UniversalBuffer.from(result.object))
  }
  
  const baseOids = await findMergeBaseInternal({
    commits: [ourOid, theirOid],
    readCommit,
  })

  if (baseOids.length !== 1) {
    if (baseOids.length === 0 && allowUnrelatedHistories) {
      // Empty tree for unrelated histories
      baseOids.push('4b825dc642cb6eb9a060e54bf8d69288fbee4904')
    } else {
      throw new MergeNotSupportedError()
    }
  }
  const baseOid = baseOids[0]

  // Handle fast-forward cases
  if (baseOid === theirOid) {
    // Already merged
    const ourCommitResult = await this.readObject(ourOid, 'content', cache)
    if (ourCommitResult.type !== 'commit') {
      throw new Error('Expected commit object')
    }
    const { parse: parseCommit } = await import('../../../core-utils/parsers/Commit.ts')
    const ourCommit = parseCommit(ourCommitResult.object)
    const ourTreeOid = ourCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    return {
      oid: ourOid,
      tree: ourTreeOid,
      mergeCommit: false,
      alreadyMerged: true,
    }
  }

  if (fastForward && baseOid === ourOid) {
    // Fast-forward merge
    if (!dryRun && !noUpdateBranch) {
      await this.writeRef(ourRef, theirOid, false, cache)
      
      // Add reflog entry
      const oldOid = await this.readRef(ourRef, 5, cache)
      if (oldOid && oldOid !== theirOid) {
        const { logRefUpdate } = await import('../../../git/logs/logRefUpdate.ts')
        const { REFLOG_MESSAGES } = await import('../../../git/logs/messages.ts')
        await logRefUpdate({
          fs: this.getFs(),
          gitdir: this.getGitdir(),
          ref: ourRef,
          oldOid,
          newOid: theirOid,
          message: REFLOG_MESSAGES.MERGE_FF(abbreviateRef(theirRef)),
        }).catch(() => {
          // Silently ignore reflog errors
        })
      }
    }
    
    const theirCommitResult = await this.readObject(theirOid, 'content', cache)
    if (theirCommitResult.type !== 'commit') {
      throw new Error('Expected commit object')
    }
    const { parse: parseCommit } = await import('../../../core-utils/parsers/Commit.ts')
    const theirCommit = parseCommit(theirCommitResult.object)
    const theirTreeOid = theirCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    return {
      oid: theirOid,
      tree: theirTreeOid,
      mergeCommit: false,
      fastForward: true,
    }
  }

  // Not a fast-forward merge
  if (fastForwardOnly) {
    throw new FastForwardError()
  }

  // Write merge state files
  if (!dryRun) {
    const { writeMergeHead } = await import('../../../git/state/MERGE_HEAD.ts')
    const { writeMergeMode } = await import('../../../git/state/MERGE_MODE.ts')
    const { writeMergeMsg } = await import('../../../git/state/MERGE_MSG.ts')
    
    await writeMergeHead({ fs: this.getFs(), gitdir: this.getGitdir(), oid: theirOid })
    const mergeMode = fastForward ? '' : 'no-ff'
    await writeMergeMode({ fs: this.getFs(), gitdir: this.getGitdir(), mode: mergeMode })
    const mergeMessage = message || `Merge branch '${abbreviateRef(theirRef)}' into ${abbreviateRef(ourRef)}`
    await writeMergeMsg({ fs: this.getFs(), gitdir: this.getGitdir(), message: mergeMessage })
  }

  // Get tree OIDs from commits
  const ourCommitResult = await this.readObject(ourOid, 'content', cache)
  const theirCommitResult = await this.readObject(theirOid, 'content', cache)
  const baseCommitResult = await this.readObject(baseOid, 'content', cache)

  if (ourCommitResult.type !== 'commit' || theirCommitResult.type !== 'commit' || baseCommitResult.type !== 'commit') {
    throw new Error('Expected commit objects')
  }

  // Use parseCommitInternal already imported above
  const ourCommit = parseCommitInternal(ourCommitResult.object)
  const theirCommit = parseCommitInternal(theirCommitResult.object)
  const baseCommit = parseCommitInternal(baseCommitResult.object)

  const ourTreeOid = ourCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  const theirTreeOid = theirCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  const baseTreeOid = baseCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

  // Read index
  const { GitIndex } = await import('../../../git/index/GitIndex.ts')
  const indexBuffer = await this.readIndex()
  const index = indexBuffer.length > 0 
    ? await GitIndex.fromBuffer(indexBuffer, objectFormat)
    : new GitIndex(null, undefined, 2)

  // Check for unmerged paths
  if (index.unmergedPaths.length > 0) {
    throw new UnmergedPathsError(Array.from(index.unmergedPaths))
  }

  // Create a minimal Repository wrapper for MergeStream
  // MergeStream needs repo for reading objects during merge
  const { Repository } = await import('../../../core-utils/Repository.ts')
  const repo = await Repository.open({
    fs: this.getFs(),
    gitdir: this.getGitdir(),
    cache,
  })

  // Perform tree merge using MergeStream
  const { MergeStream } = await import('../../../core-utils/MergeStream.ts')
  const mergeResult = await MergeStream.execute({
    gitBackend: this,
    index,
    ourOid: ourTreeOid,
    baseOid: baseTreeOid,
    theirOid: theirTreeOid,
    abortOnConflict,
    dryRun,
    cache,
    gitdir: this.getGitdir(),
  })

  // Write index if merge succeeded or conflicts are allowed
  if (typeof mergeResult === 'string' || !abortOnConflict) {
    const updatedIndexBuffer = await index.toObject()
    await this.writeIndex(updatedIndexBuffer)
  }

  // Check for conflicts
  // CRITICAL: Always throw MergeConflictError when conflicts are detected, even if abortOnConflict=false
  // When abortOnConflict=false, the index is written with conflicts, but the error should still be thrown
  if (typeof mergeResult !== 'string') {
    const conflictError = mergeResult as any
    const filepaths = conflictError?.data?.filepaths || []
    const bothModified = conflictError?.data?.bothModified || []
    const deleteByUs = conflictError?.data?.deleteByUs || []
    const deleteByTheirs = conflictError?.data?.deleteByTheirs || []
    
    const error = new MergeConflictError(filepaths, bothModified, deleteByUs, deleteByTheirs)
    // Always throw the error - abortOnConflict only affects whether we write the index
    throw error
  }

  // Create merge commit
  const mergeMessage = message || `Merge branch '${abbreviateRef(theirRef)}' into ${abbreviateRef(ourRef)}`
  
  const { writeCommit: _writeCommit } = await import('../../../git/backends/GitBackendFs/commands/writeCommit.ts')
  const { normalizeCommitterObject } = await import('../../../utils/normalizeCommitterObject.ts')
  const { normalizeAuthorObject } = await import('../../../utils/normalizeAuthorObject.ts')
  
  const normalizedAuthor = author ? await normalizeAuthorObject({ repo, author }) : undefined
  const normalizedCommitter = committer 
    ? await normalizeCommitterObject({ repo, author: normalizedAuthor, committer })
    : normalizedAuthor

  if (!normalizedAuthor || !normalizedCommitter) {
    throw new Error('Author and committer are required for merge commit')
  }

  // Create commit object (using parseCommitInternal already imported above)
  const commitObject = {
    tree: mergeResult,
    parent: [ourOid, theirOid],
    author: normalizedAuthor,
    committer: normalizedCommitter,
    message: mergeMessage,
  }
  
  const oid = await _writeCommit({
    repo,
    fs: this.getFs(),
    gitdir: this.getGitdir(),
    commit: commitObject,
    dryRun,
    cache,
  })
  
  // Update ref if not dry run and not noUpdateBranch
  if (!dryRun && !noUpdateBranch) {
    await this.writeRef(ourRef, oid, false, cache)
  }

  // Clean up merge state files
  if (!dryRun) {
    const { deleteMergeHead } = await import('../../../git/state/MERGE_HEAD.ts')
    const { deleteMergeMode } = await import('../../../git/state/MERGE_MODE.ts')
    const { deleteMergeMsg } = await import('../../../git/state/MERGE_MSG.ts')
    
    await Promise.all([
      deleteMergeHead({ fs: this.getFs(), gitdir: this.getGitdir() }),
      deleteMergeMode({ fs: this.getFs(), gitdir: this.getGitdir() }),
      deleteMergeMsg({ fs: this.getFs(), gitdir: this.getGitdir() }),
    ])
  }

  return {
    oid,
    tree: mergeResult,
    mergeCommit: true,
  }
}

