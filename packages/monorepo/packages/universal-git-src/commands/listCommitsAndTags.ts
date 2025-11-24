import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { ObjectTypeError } from "../errors/ObjectTypeError.ts"
import { resolveRef } from "../git/refs/readRef.ts"
import { readShallow } from "../git/shallow.ts"
import { GitAnnotatedTag } from "../models/GitAnnotatedTag.ts"
import { GitCommit } from "../models/GitCommit.ts"
import { readObject } from "../git/objects/readObject.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * @param {object} args
 * @param {import('../types.ts').FileSystemProvider} args.fs
 * @param {any} args.cache
 * @param {string} [args.dir]
 * @param {string} args.gitdir
 * @param {Iterable<string>} args.start
 * @param {Iterable<string>} args.finish
 * @returns {Promise<Set<string>>}
 */
export type ListCommitsAndTagsOptions = BaseCommandOptions & {
  start: Iterable<string>
  finish: Iterable<string>
}

export async function listCommitsAndTags({
  repo: _repo,
  fs: _fs,
  cache = {},
  dir = '',
  gitdir = dir ? join(dir, '.git') : undefined,
  start,
  finish,
}: ListCommitsAndTagsOptions): Promise<Set<string>> {
  const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    dir,
    gitdir,
    cache,
    start,
    finish,
  })

  const shallows = await readShallow({ fs, gitdir: effectiveGitdir })
  const startingSet = new Set<string>()
  const finishingSet = new Set<string>()
  for (const ref of start) {
    startingSet.add(await resolveRef({ fs, gitdir: effectiveGitdir, ref }))
  }
  for (const ref of finish) {
    // We may not have these refs locally so we must try/catch
    try {
      const oid = await resolveRef({ fs, gitdir: effectiveGitdir, ref })
      finishingSet.add(oid)
    } catch (err) {
      // Ignore errors for refs we don't have locally
    }
  }
  const visited = new Set<string>()
  // Because git commits are named by their hash, there is no
  // way to construct a cycle. Therefore we won't worry about
  // setting a default recursion limit.
  async function walk(oid: string): Promise<void> {
    visited.add(oid)
    const { type, object } = await readObject({ fs, cache, gitdir: effectiveGitdir, oid })
    // Recursively resolve annotated tags
    if (type === 'tag') {
      const tag = GitAnnotatedTag.from(object)
      const commit = tag.headers().object
      if (!commit) {
        throw new Error('Tag object missing commit reference')
      }
      return walk(commit)
    }
    if (type !== 'commit') {
      throw new ObjectTypeError(oid, type as 'blob' | 'commit' | 'tag' | 'tree', 'commit')
    }
    if (!shallows.has(oid)) {
      const commit = GitCommit.from(object)
      const parents = commit.headers().parent || []
      for (const parentOid of parents) {
        if (!finishingSet.has(parentOid) && !visited.has(parentOid)) {
          await walk(parentOid)
        }
      }
    }
  }
  // Let's go walking!
  for (const oid of startingSet) {
    await walk(oid)
  }
  return visited
}

