import { resolveCommit } from "../utils/resolveCommit.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { join } from "../utils/join.ts"
import { GitCommit } from "../models/GitCommit.ts"
import type { FileSystem } from "../models/FileSystem.ts"
import type { ReadCommitResult } from "../models/GitCommit.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Read a commit object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.oid - The SHA-1 object id to get. Annotated tags are peeled.
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<ReadCommitResult>} Resolves successfully with a git commit object
 * @see ReadCommitResult
 * @see CommitObject
 *
 * @example
 * // Read a commit object
 * let sha = await git.resolveRef({ fs, dir: '/tutorial', ref: 'main' })
 * console.log(sha)
 * let commit = await git.readCommit({ fs, dir: '/tutorial', oid: sha })
 * console.log(commit)
 *
 */
export type ReadCommitOptions = BaseCommandOptions & {
  oid: string
}

export async function readCommit({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  oid,
  cache = {},
}: ReadCommitOptions): Promise<ReadCommitResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      oid,
    })

    assertParameter('oid', oid)

    const { commit: commitObject, oid: commitOid } = await resolveCommit({
      fs,
      cache,
      gitdir: effectiveGitdir,
      oid,
    })
    // Convert CommitObject to GitCommit instance for payload generation
    const gitCommit = GitCommit.from(commitObject)
    const result: ReadCommitResult = {
      oid: commitOid,
      commit: commitObject,
      payload: gitCommit.withoutSignature(),
    }
    return result
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.readCommit'
    throw err
  }
}

