import { resolveRef } from "../git/refs/readRef.ts"
import { writeRef } from "../git/refs/writeRef.ts"
import { readObject } from "../git/objects/readObject.ts"
import { writeCommit } from "./writeCommit.ts"
import { parse as parseCommit, serialize as serializeCommit } from "../core-utils/parsers/Commit.ts"
import { mergeTrees } from "../git/merge/mergeTrees.ts"
import { findMergeBase } from "../core-utils/algorithms/CommitGraphWalker.ts"
import { topologicalSort } from "../core-utils/algorithms/CommitGraphWalker.ts"
import {
  isRebaseInProgress,
  initRebase,
  nextRebaseCommand,
  readRebaseOnto,
  readRebaseHead,
  completeRebase,
  abortRebase,
} from "../core-utils/algorithms/SequencerManager.ts"
import { writeOrigHead } from "../git/state/index.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommitObject } from "../models/GitCommit.ts"

// ============================================================================
// REBASE TYPES
// ============================================================================

/**
 * Rebase operation result
 */
export type RebaseResult = {
  oid: string
  conflicts?: string[]
}

/**
 * Re-applies commits on top of another base tip
 * Similar to `git rebase`
 */
export async function rebase({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  upstream,
  branch,
  interactive = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  upstream: string
  branch?: string
  interactive?: boolean
  cache?: Record<string, unknown>
}): Promise<RebaseResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      upstream,
      branch,
      interactive,
    })

    assertParameter('upstream', upstream)

    // Check if rebase is already in progress
    if (await isRebaseInProgress({ fs, gitdir: effectiveGitdir })) {
      // Continue existing rebase
      return await continueRebase({ fs, gitdir: effectiveGitdir, cache })
    }

    // Resolve upstream to OID
    const upstreamOid = await repo.resolveRef(upstream)

    // Get current branch or specified branch
    let currentBranch: string
    let currentHead: string
    if (branch) {
      // Expand branch name to full ref path (e.g., "master" -> "refs/heads/master")
      currentBranch = branch.startsWith('refs/') ? branch : `refs/heads/${branch}`
      currentHead = await repo.resolveRef(currentBranch)
    } else {
      // Get current branch from HEAD
      const headRef = await repo.resolveRef('HEAD')
      // Check if HEAD is a symbolic ref
      try {
        const headRefValue = await resolveRef({ fs, gitdir: effectiveGitdir, ref: 'HEAD', depth: 2 })
        if (headRefValue.startsWith('ref: ')) {
          currentBranch = headRefValue.slice('ref: '.length)
          currentHead = await repo.resolveRef(currentBranch)
        } else {
          // Detached HEAD
          currentHead = headRef
          currentBranch = 'HEAD'
        }
      } catch {
        // If resolve with depth fails, use the resolved OID
        currentHead = headRef
        currentBranch = 'HEAD'
      }
    }
    
    // Ensure currentBranch is always a full ref path for reflog operations
    // (HEAD is already a full ref, but branch names need expansion)
    if (currentBranch !== 'HEAD' && !currentBranch.startsWith('refs/')) {
      currentBranch = `refs/heads/${currentBranch}`
    }

    // Find merge base
    const mergeBases = await findMergeBase({
      fs,
      cache,
      gitdir: effectiveGitdir,
      commits: [currentHead, upstreamOid],
    })

    if (mergeBases.length === 0) {
      throw new Error('No common ancestor found between branches')
    }
    const baseOid = mergeBases[0]

    // Get commits to rebase (commits in current branch but not in upstream)
    // This is commits reachable from currentHead but not from upstreamOid
    const commitsToRebase = await getCommitsToRebase({
      repo,
      from: currentHead,
      to: baseOid,
      cache,
    })

    if (commitsToRebase.length === 0) {
      // Already up to date
      return { oid: currentHead }
    }

    // Run pre-rebase hook (before rebase operation)
    try {
      const { runHook } = await import('../git/hooks/runHook.ts')
      const worktree = repo.getWorktree()
      
      // Pre-rebase hook receives upstream branch name as first argument
      // and branch name as second argument (if rebasing a specific branch)
      await runHook({
        fs: repo.fs,
        gitdir: effectiveGitdir,
        hookName: 'pre-rebase',
        context: {
          gitdir: effectiveGitdir,
          workTree: worktree?.dir ?? undefined,
          branch: currentBranch !== 'HEAD' ? currentBranch.replace('refs/heads/', '') : undefined,
        },
        args: [upstream, branch || currentBranch !== 'HEAD' ? currentBranch.replace('refs/heads/', '') : ''],
      })
    } catch (hookError: any) {
      // Pre-rebase hook failures abort the rebase
      if (hookError.exitCode !== undefined && hookError.exitCode !== 0) {
        const { UserCanceledError } = await import('../errors/UserCanceledError.ts')
        const error = hookError instanceof Error ? hookError : new Error(hookError.stderr || hookError.message || 'Unknown error')
        throw new UserCanceledError(error)
      }
      // If it's a spawn/environment error, wrap it to include hook context
      if (hookError.code === 'ENOENT' || hookError.message?.includes('spawn')) {
        const { UserCanceledError } = await import('../errors/UserCanceledError.ts')
        const error = hookError instanceof Error ? hookError : new Error(hookError.message || 'Unknown error')
        throw new UserCanceledError(error)
      }
      // Re-throw other errors
      throw hookError
    }

    // Initialize rebase sequencer
    await initRebase({
      fs,
      gitdir: effectiveGitdir,
      headName: currentBranch,
      onto: upstreamOid,
      commands: commitsToRebase.map(commit => ({
        action: 'pick',
        oid: commit.oid,
        message: commit.message,
      })),
    })

    // Save ORIG_HEAD
    await writeOrigHead({ fs, gitdir: effectiveGitdir, oid: currentHead })

    // Read old branch OID for reflog before resetting
    let oldBranchOid: string | undefined
    try {
      oldBranchOid = await repo.resolveRef(currentBranch)
    } catch {
      // Branch doesn't exist yet
      oldBranchOid = undefined
    }

    // Reset branch to upstream
    // NOTE: writeRef automatically creates a reflog entry with message "update by writeRef"
    // We add a descriptive entry below to provide more context about why the ref was updated
    await repo.writeRef(currentBranch, upstreamOid)
    
    // Add descriptive reflog entry for rebase start
    // 
    // BEHAVIOR: writeRef (called above) automatically creates a reflog entry with message "update by writeRef".
    // We add a descriptive entry here to provide more context about why the ref was updated.
    // 
    // EXPECTED RESULT: Both entries will exist in the reflog:
    //   1. "update by writeRef" (from writeRef's automatic logging)
    //   2. "rebase: rebasing onto <upstream>" (from this descriptive entry)
    // 
    // WHY TWO ENTRIES: Git's behavior is that commands performing complex operations (like rebase)
    // add descriptive reflog entries to help users understand what happened when reviewing the reflog.
    // The automatic entry from writeRef provides the basic "what changed", while this entry provides
    // the "why it changed" context.
    // 
    // TECHNICAL DETAILS:
    // - We use the same oldOid/newOid as writeRef used, but with a descriptive message
    // - logRefUpdate will append a new entry even if an entry with the same OIDs already exists
    // - Reflog entries are append-only, so multiple entries can have the same OIDs
    // - logRefUpdate checks if oldOid === newOid and returns early if they're the same
    //   (In our case, oldBranchOid !== upstreamOid, so this check will pass)
    // - logRefUpdate respects core.logAllRefUpdates config (defaults to true for non-bare repos)
    // 
    // ERROR HANDLING: We silently ignore reflog errors (Git's behavior) because:
    // - Reflog is a convenience feature, not critical to the rebase operation
    // - Reflog might be disabled (core.logAllRefUpdates = false)
    // - Reflog file might not be writable (permissions, disk full, etc.)
    // - gitdir path might be invalid
    if (oldBranchOid && oldBranchOid !== upstreamOid) {
      const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
      const { abbreviateRef } = await import('../utils/abbreviateRef.ts')
      const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
      await logRefUpdate({
        fs,
        gitdir: effectiveGitdir,
        ref: currentBranch,
        oldOid: oldBranchOid,
        newOid: upstreamOid,
        message: REFLOG_MESSAGES.REBASE_START(abbreviateRef(upstream)),
      }).catch(() => {
        // Silently ignore reflog errors (Git's behavior)
      })
    }

    // Apply each commit
    let lastOid = upstreamOid
    const conflicts: string[] = []

    for (const commit of commitsToRebase) {
      // Apply commit using cherry-pick logic
      const result = await applyRebaseCommit({
        fs,
        cache,
        gitdir: effectiveGitdir,
        commitOid: commit.oid,
        baseOid: commit.parent[0] || baseOid,
        ontoOid: lastOid,
      })

      if (result.conflicts && result.conflicts.length > 0) {
        conflicts.push(...result.conflicts)
        // Stop on first conflict
        break
      }

      lastOid = result.oid
    }

    if (conflicts.length > 0) {
      // Rebase in progress, conflicts need to be resolved
      return {
        oid: lastOid,
        conflicts,
      }
    }

    // Read old branch OID for reflog before updating to final commit
    let oldBranchOidBeforeFinal: string | undefined
    try {
      oldBranchOidBeforeFinal = await repo.resolveRef(currentBranch)
    } catch {
      // Branch doesn't exist yet
      oldBranchOidBeforeFinal = undefined
    }

    // Update branch to final commit
    // NOTE: writeRef automatically creates a reflog entry with message "update by writeRef"
    // We add a descriptive entry below to provide more context about why the ref was updated
    await repo.writeRef(currentBranch, lastOid)
    
    // Add descriptive reflog entry for rebase completion
    // 
    // BEHAVIOR: writeRef (called above) automatically creates a reflog entry with message "update by writeRef".
    // We add a descriptive entry here to provide more context about why the ref was updated.
    // 
    // EXPECTED RESULT: Both entries will exist in the reflog:
    //   1. "update by writeRef" (from writeRef's automatic logging)
    //   2. "rebase finished: returning to <branch>" (from this descriptive entry)
    // 
    // WHY TWO ENTRIES: Git's behavior is that commands performing complex operations (like rebase)
    // add descriptive reflog entries to help users understand what happened when reviewing the reflog.
    // The automatic entry from writeRef provides the basic "what changed", while this entry provides
    // the "why it changed" context.
    // 
    // TECHNICAL DETAILS:
    // - We use the same oldOid/newOid as writeRef used, but with a descriptive message
    // - logRefUpdate will append a new entry even if an entry with the same OIDs already exists
    // - Reflog entries are append-only, so multiple entries can have the same OIDs
    // - logRefUpdate checks if oldOid === newOid and returns early if they're the same
    //   (In our case, oldBranchOidBeforeFinal !== lastOid, so this check will pass)
    // - logRefUpdate respects core.logAllRefUpdates config (defaults to true for non-bare repos)
    // 
    // ERROR HANDLING: We silently ignore reflog errors (Git's behavior) because:
    // - Reflog is a convenience feature, not critical to the rebase operation
    // - Reflog might be disabled (core.logAllRefUpdates = false)
    // - Reflog file might not be writable (permissions, disk full, etc.)
    // - gitdir path might be invalid
    if (oldBranchOidBeforeFinal && oldBranchOidBeforeFinal !== lastOid) {
      const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
      const { abbreviateRef } = await import('../utils/abbreviateRef.ts')
      const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
      await logRefUpdate({
        fs,
        gitdir: effectiveGitdir,
        ref: currentBranch,
        oldOid: oldBranchOidBeforeFinal,
        newOid: lastOid,
        message: REFLOG_MESSAGES.REBASE_FINISH(abbreviateRef(currentBranch)),
      }).catch(() => {
        // Silently ignore reflog errors (Git's behavior)
      })
    }

    // Complete rebase
    await completeRebase({ fs, gitdir: effectiveGitdir })

    return {
      oid: lastOid,
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.rebase'
    throw err
  }
}

/**
 * Continues an in-progress rebase
 */
async function continueRebase({
  fs,
  gitdir,
  cache,
}: {
  fs: FileSystemProvider
  gitdir: string
  cache: Record<string, unknown>
}): Promise<RebaseResult> {
  const ontoOid = await readRebaseOnto({ fs, gitdir })
  if (!ontoOid) {
    throw new Error('Rebase sequencer not properly initialized')
  }

  const headName = await readRebaseHead({ fs, gitdir })
  if (!headName) {
    throw new Error('Rebase head not found')
  }

  // Get current HEAD
  const currentHead = await resolveRef({ fs, gitdir, ref: 'HEAD' })

  // Continue with next command
  const command = await nextRebaseCommand({ fs, gitdir })
  if (!command) {
    // Rebase complete
    await completeRebase({ fs, gitdir })
    return { oid: currentHead }
  }

  // Apply the commit
  const commitResult = await readObject({ fs, cache, gitdir, oid: command.oid, format: 'content' })
  if (commitResult.type !== 'commit') {
    throw new Error(`Object ${command.oid} is not a commit`)
  }
  const commitObj = parseCommit(commitResult.object) as CommitObject

  const baseOid = commitObj.parent && commitObj.parent.length > 0 ? commitObj.parent[0] : ontoOid

  const result = await applyRebaseCommit({
    fs,
    cache,
    gitdir,
    commitOid: command.oid,
    baseOid,
    ontoOid: currentHead,
  })

  if (result.conflicts && result.conflicts.length > 0) {
    return {
      oid: result.oid,
      conflicts: result.conflicts,
    }
  }

  // Update HEAD
  await writeRef({ fs, gitdir, ref: 'HEAD', value: result.oid })

  // Continue with next commit
  return await continueRebase({ fs, gitdir, cache })
}

/**
 * Applies a single commit during rebase (similar to cherry-pick)
 */
async function applyRebaseCommit({
  fs,
  cache,
  gitdir,
  commitOid,
  baseOid,
  ontoOid,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  commitOid: string
  baseOid: string
  ontoOid: string
}): Promise<{ oid: string; conflicts?: string[] }> {
  // Read the commit to apply
  const commitResult = await readObject({ fs, cache, gitdir, oid: commitOid, format: 'content' })
  if (commitResult.type !== 'commit') {
    throw new Error(`Object ${commitOid} is not a commit`)
  }
  const commitObj = parseCommit(commitResult.object) as CommitObject

  // Read onto commit
  const ontoResult = await readObject({ fs, cache, gitdir, oid: ontoOid, format: 'content' })
  if (ontoResult.type !== 'commit') {
    throw new Error(`Object ${ontoOid} is not a commit`)
  }
  const ontoCommit = parseCommit(ontoResult.object) as CommitObject

  // Read base commit
  const baseResult = await readObject({ fs, cache, gitdir, oid: baseOid, format: 'content' })
  if (baseResult.type !== 'commit') {
    throw new Error(`Object ${baseOid} is not a commit`)
  }
  const baseCommit = parseCommit(baseResult.object) as CommitObject

  // Get tree OIDs
  const ourTreeOid = ontoCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  const baseTreeOid = baseCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  const theirTreeOid = commitObj.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

  // Perform three-way merge
  const mergeResult = await mergeTrees({
    fs,
    cache,
    gitdir,
    base: baseTreeOid,
    ours: ourTreeOid,
    theirs: theirTreeOid,
  })

  if (mergeResult.conflicts.length > 0) {
    // Return the onto commit OID (no new commit created)
    return {
      oid: ontoOid,
      conflicts: mergeResult.conflicts,
    }
  }

  // Create new commit with merged tree
  const newCommit: CommitObject = {
    tree: mergeResult.mergedTreeOid,
    parent: [ontoOid],
    author: commitObj.author,
    committer: commitObj.committer,
    message: commitObj.message,
  }

  // Write commit object using writeCommit
  const newCommitOid = await writeCommit({
    fs,
    gitdir,
    commit: newCommit,
  })

  return {
    oid: newCommitOid,
  }
}

/**
 * Gets commits to rebase (commits in 'from' but not in 'to')
 */
async function getCommitsToRebase({
  repo,
  from,
  to,
  cache = {},
}: {
  repo: Repository
  from: string
  to: string
  cache?: Record<string, unknown>
}): Promise<Array<{ oid: string; message: string; parent: string[] }>> {
  // Use GitBackend to read commits - no fs needed
  const gitBackend = repo.gitBackend
  if (!gitBackend) {
    throw new Error('Repository must have a GitBackend for rebase operations')
  }
  
  const { parse: parseCommit } = await import('../core-utils/parsers/Commit.ts')
  const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
  
  const readCommit = async (oid: string) => {
    const result = await gitBackend.readObject(oid, 'content', cache)
    return parseCommit(UniversalBuffer.from(result.object))
  }
  
  // Get all commits reachable from 'from'
  const fromCommits = await topologicalSort({
    heads: [from],
    readCommit,
  })

  // Get all commits reachable from 'to'
  const toCommits = new Set(
    await topologicalSort({
      heads: [to],
      readCommit,
    })
  )

  // Filter to commits in 'from' but not in 'to'
  // topologicalSort returns oldest first, which is what we want for rebasing
  const commitsToRebase: Array<{ oid: string; message: string; parent: string[] }> = []

  for (const oid of fromCommits) {
    if (!toCommits.has(oid)) {
      const commit = await readCommit(oid)
      commitsToRebase.push({
        oid,
        message: commit.message,
        parent: commit.parent || [],
      })
    }
  }

  // topologicalSort already returns oldest first, which is correct for rebasing
  return commitsToRebase
}

