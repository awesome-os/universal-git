import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { GitCommit } from "../models/GitCommit.ts"
import { readObject } from "../git/objects/readObject.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Find the merge base for a set of commits
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string[]} args.oids - Which commits
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 */
export type FindMergeBaseOptions = BaseCommandOptions & {
  oids: string[]
}

export async function findMergeBase({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  oids,
  cache = {},
}: FindMergeBaseOptions): Promise<string | undefined> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      oids,
    })

    assertParameter('oids', oids)

    const result = await _findMergeBase({
      repo,
      oids,
      cache: effectiveCache,
    })
    // Return first result if array, or undefined if empty array, or the result itself if not an array
    if (Array.isArray(result)) {
      return result.length > 0 ? (result[0] as string) : undefined
    }
    return result as string | undefined
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.findMergeBase'
    throw err
  }
}

/**
 * Find the merge base of multiple commits
 */
export async function _findMergeBase({
  repo,
  oids,
  cache = {},
}: {
  repo: Repository
  oids: string[]
  cache?: Record<string, unknown>
}): Promise<string[]> {
  // Use GitBackend to read commits - no fs needed
  const gitBackend = repo.gitBackend
  if (!gitBackend) {
    throw new Error('Repository must have a GitBackend for findMergeBase')
  }
  
  const { parse: parseCommit } = await import('../core-utils/parsers/Commit.ts')
  const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
  
  const readCommit = async (oid: string) => {
    const result = await gitBackend.readObject(oid, 'content', cache)
    return parseCommit(UniversalBuffer.from(result.object))
  }
  
  // Use the refactored findMergeBase from CommitGraphWalker
  const { findMergeBase: findMergeBaseInternal } = await import('../core-utils/algorithms/CommitGraphWalker.ts')
  return await findMergeBaseInternal({
    commits: oids,
    readCommit,
  })
}

