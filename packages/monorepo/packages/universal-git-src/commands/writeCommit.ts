import { GitCommit } from "../models/GitCommit.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { writeObject as writeObjectInternal } from "../git/objects/writeObject.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommitObject } from "../models/GitCommit.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Write a commit object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {CommitObject} args.commit - The object to write
 * @param {boolean} [args.dryRun=false] - If true, compute the OID without writing to disk
 *
 * @returns {Promise<string>} Resolves successfully with the SHA-1 object id of the newly written object
 * @see CommitObject
 *
 */
export type WriteCommitOptions = BaseCommandOptions & {
  commit: CommitObject
  dryRun?: boolean
}

export async function writeCommit({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  commit,
  dryRun = false,
  cache = {},
}: WriteCommitOptions): Promise<string> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      commit,
      dryRun,
    })

    assertParameter('commit', commit)

    // Convert object to buffer
    const object = GitCommit.from(commit).toObject()
    const oid = await writeObjectInternal({
      fs,
      gitdir: effectiveGitdir,
      type: 'commit',
      object,
      format: 'content',
      dryRun,
    })
    return oid
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.writeCommit'
    throw err
  }
}

