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
      fs: fs as any,
      cache: effectiveCache,
      gitdir: effectiveGitdir,
      oids,
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
  fs,
  cache,
  gitdir,
  oids,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oids: string[]
}): Promise<string[]> {
  // Note: right now, the tests are geared so that the output should match that of
  // `git merge-base --all --octopus`
  // because without the --octopus flag, git's output seems to depend on the ORDER of the oids,
  // and computing virtual merge bases is just too much for me to fathom right now.

  // If we start N independent walkers, one at each of the given `oids`, and walk backwards
  // through ancestors, eventually we'll discover a commit where each one of these N walkers
  // has passed through. So we just need to keep track of which walkers have visited each commit
  // until we find a commit that N distinct walkers has visited.
  const visits: Record<string, Set<number>> = {}
  const passes = oids.length
  let heads: Array<{ index: number; oid: string }> = oids.map((oid, index) => ({ index, oid }))
  while (heads.length) {
    // Count how many times we've passed each commit
    const result = new Set<string>()
    for (const { oid, index } of heads) {
      if (!visits[oid]) visits[oid] = new Set()
      visits[oid].add(index)
      if (visits[oid].size === passes) {
        result.add(oid)
      }
    }
    if (result.size > 0) {
      return [...result]
    }
    // We haven't found a common ancestor yet
    const newheads = new Map<string, { oid: string; index: number }>()
    for (const { oid, index } of heads) {
      try {
        const { object } = await readObject({ fs, cache, gitdir, oid })
        const commit = GitCommit.from(object)
        const { parent } = commit.parseHeaders()
        const parents = parent || []
        for (const parentOid of parents) {
          if (!visits[parentOid] || !visits[parentOid].has(index)) {
            newheads.set(parentOid + ':' + index, { oid: parentOid, index })
          }
        }
      } catch (err) {
        // do nothing
      }
    }
    heads = Array.from(newheads.values())
  }
  return []
}

