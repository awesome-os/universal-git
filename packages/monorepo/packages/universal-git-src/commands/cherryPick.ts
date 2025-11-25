// RefManager import removed - not used in this file
import { readObject } from "../git/objects/readObject.ts"
import { writeCommit } from "./writeCommit.ts"
import { parse as parseCommit, serialize as serializeCommit } from "../core-utils/parsers/Commit.ts"
import { mergeTrees } from "../git/merge/mergeTrees.ts"
import { writeCherryPickHead, deleteCherryPickHead } from "../git/state/index.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommitObject } from "../models/GitCommit.ts"

// ============================================================================
// CHERRY-PICK TYPES
// ============================================================================

/**
 * Cherry-pick operation result
 */
export type CherryPickResult = {
  oid: string
  conflicts?: string[]
}

/**
 * Applies the changes introduced by some existing commits
 * Similar to `git cherry-pick`
 */
export async function cherryPick({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  commit,
  noCommit = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  commit: string
  noCommit?: boolean
  cache?: Record<string, unknown>
}): Promise<CherryPickResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      commit,
      noCommit,
    })

    assertParameter('commit', commit)

    // Resolve commit to OID
    const commitOid = await repo.resolveRef(commit)
    
    // Read the commit to cherry-pick
    const commitResult = await readObject({ fs, cache: effectiveCache, gitdir: effectiveGitdir, oid: commitOid, format: 'content' })
    if (commitResult.type !== 'commit') {
      throw new Error(`Object ${commitOid} is not a commit`)
    }
    const commitObj = parseCommit(commitResult.object) as CommitObject

    // Get current HEAD
    const headRef = await repo.resolveRef('HEAD')
    const headResult = await readObject({ fs, cache: effectiveCache, gitdir: effectiveGitdir, oid: headRef, format: 'content' })
    if (headResult.type !== 'commit') {
      throw new Error(`HEAD ${headRef} is not a commit`)
    }
    const headCommit = parseCommit(headResult.object) as CommitObject

    // Find merge base (the parent of the commit being cherry-picked)
    // For cherry-pick, we use the commit's first parent as the base
    const baseOid = commitObj.parent && commitObj.parent.length > 0 ? commitObj.parent[0] : null
    
    if (!baseOid) {
      throw new Error('Cannot cherry-pick a commit with no parent (root commit)')
    }

    // Get tree OIDs
    const ourTreeOid = headCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904' // empty tree
    const theirTreeOid = commitObj.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904' // empty tree
    
    // Get base tree from the commit's parent
    let baseTreeOid = '4b825dc642cb6eb9a060e54bf8d69288fbee4904' // empty tree
    if (baseOid) {
      const baseResult = await readObject({ fs, cache, gitdir: effectiveGitdir, oid: baseOid, format: 'content' })
      if (baseResult.type === 'commit') {
        const baseCommit = parseCommit(baseResult.object) as CommitObject
        baseTreeOid = baseCommit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
      }
    }

    // Perform three-way merge
    const mergeResult = await mergeTrees({
      fs,
      cache: effectiveCache,
      gitdir: effectiveGitdir,
      base: baseTreeOid,
      ours: ourTreeOid,
      theirs: theirTreeOid,
    })

    if (mergeResult.conflicts.length > 0 && !noCommit) {
      // Set CHERRY_PICK_HEAD for conflict resolution
      await writeCherryPickHead({ fs, gitdir: effectiveGitdir, oid: commitOid })
      throw new Error(`Cherry-pick conflict: ${mergeResult.conflicts.join(', ')}`)
    }

    if (noCommit) {
      // Update index with merged tree
      // Note: In a full implementation, we would:
      // 1. Read the merged tree
      // 2. Recursively walk the tree and update index entries
      // 3. Remove entries that are no longer in the tree
      // 4. Add new entries from the tree
      // 5. Mark conflict entries appropriately
      // For now, the index will be updated when the commit is made
      
      return {
        oid: mergeResult.mergedTreeOid,
        conflicts: mergeResult.conflicts.length > 0 ? mergeResult.conflicts : undefined,
      }
    }

    // Create new commit with merged tree
    const newCommit: CommitObject = {
      tree: mergeResult.mergedTreeOid,
      parent: [headRef],
      author: commitObj.author,
      committer: commitObj.committer,
      message: commitObj.message,
    }

    // Write commit object using writeCommit
    const newCommitOid = await writeCommit({
      fs,
      gitdir: effectiveGitdir,
      commit: newCommit,
    })

    // Update HEAD
    await repo.writeRef('HEAD', newCommitOid)

    // Clear CHERRY_PICK_HEAD if it was set
    await deleteCherryPickHead({ fs, gitdir: effectiveGitdir })

    return {
      oid: newCommitOid,
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.cherryPick'
    throw err
  }
}

