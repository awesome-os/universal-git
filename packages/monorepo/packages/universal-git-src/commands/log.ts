import { NotFoundError } from "../errors/NotFoundError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { resolveRef } from "../git/refs/readRef.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { readObject } from "../git/objects/readObject.ts"
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { parse as parseTree } from "../core-utils/parsers/Tree.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { ReadCommitResult } from "../models/GitCommit.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Get commit descriptions from the git history
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string=} args.filepath optional get the commit for the filepath only
 * @param {string} [args.ref = 'HEAD'] - The commit to begin walking backwards through the history from
 * @param {number=} [args.depth] - Limit the number of commits returned. No limit by default.
 * @param {Date} [args.since] - Return history newer than the given date. Can be combined with `depth` to get whichever is shorter.
 * @param {boolean=} [args.force=false] do not throw error if filepath is not exist (works only for a single file). defaults to false
 * @param {boolean=} [args.follow=false] Continue listing the history of a file beyond renames (works only for a single file). defaults to false
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<Array<ReadCommitResult>>} Resolves to an array of ReadCommitResult objects
 * @see ReadCommitResult
 * @see CommitObject
 *
 * @example
 * let commits = await git.log({
 *   fs,
 *   dir: '/tutorial',
 *   depth: 5,
 *   ref: 'main'
 * })
 * console.log(commits)
 *
 */
export type LogOptions = BaseCommandOptions & {
  ref?: string
  filepath?: string
  depth?: number
  since?: Date
  force?: boolean
  follow?: boolean
}

export async function log({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  ref = 'HEAD',
  depth,
  since,
  force,
  follow,
  cache = {},
}: LogOptions): Promise<ReadCommitResult[]> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      filepath,
      ref,
      depth,
      since,
      force,
      follow,
    })

    assertParameter('ref', ref)

    return await _log({
      fs,
      cache,
      gitdir: effectiveGitdir,
      filepath,
      ref,
      depth,
      since,
      force,
      follow,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.log'
    throw err
  }
}

/**
 * Internal log implementation
 */
async function _log({
  fs,
  cache,
  gitdir,
  filepath,
  ref,
  depth,
  since,
  force,
  follow,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  filepath?: string
  ref: string
  depth?: number
  since?: Date
  force?: boolean
  follow?: boolean
}): Promise<ReadCommitResult[]> {
  const sinceTimestamp =
    typeof since === 'undefined'
      ? undefined
      : Math.floor(since.valueOf() / 1000)
  
  const commits: ReadCommitResult[] = []
  const oid = await resolveRef({ fs, gitdir, ref })
  const visited = new Set<string>()
  const queue: string[] = [oid]
  
  // Helper to read commit
  async function readCommit(commitOid: string): Promise<ReadCommitResult> {
    const { object: commitObject } = await readObject({ fs, cache, gitdir, oid: commitOid })
    const commit = parseCommit(commitObject)
    return {
      oid: commitOid,
      commit,
      payload: '', // Will be populated if needed
    }
  }
  
  // Helper to resolve filepath in tree
  async function resolveFilepathInTree(treeOid: string, path: string): Promise<string | null> {
    const parts = path.split('/').filter(Boolean)
    let currentTreeOid = treeOid
    
    for (const part of parts) {
      const { object: treeObject } = await readObject({ fs, cache, gitdir, oid: currentTreeOid })
      const treeEntries = parseTree(treeObject)
      const entry = treeEntries.find(e => e.path === part)
      if (!entry) return null
      if (entry.type === 'tree') {
        currentTreeOid = entry.oid
      } else {
        return entry.oid
      }
    }
    return currentTreeOid
  }
  
  while (queue.length > 0 && (depth === undefined || commits.length < depth)) {
    const commitOid = queue.shift()!
    if (visited.has(commitOid)) continue
    visited.add(commitOid)
    
    const commitData = await readCommit(commitOid)
    const commit = commitData.commit
    
    // Stop the log if we've hit the age limit
    if (
      sinceTimestamp !== undefined &&
      commit.committer.timestamp <= sinceTimestamp
    ) {
      break
    }
    
    // Filter by filepath if specified
    if (filepath) {
      try {
        const fileOid = await resolveFilepathInTree(commit.tree, filepath)
        if (fileOid) {
          commits.push(commitData)
        }
      } catch (e) {
        if (!force && !follow) {
          // File doesn't exist in this commit
          continue
        }
      }
    } else {
      commits.push(commitData)
    }
    
    // Add parents to queue
    for (const parentOid of commit.parent) {
      if (!visited.has(parentOid)) {
        queue.push(parentOid)
      }
    }
  }
  
  return commits
}

