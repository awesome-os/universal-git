import { listTagRefs } from "../git/refs/tags/tags.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * List tags
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 *
 * @returns {Promise<Array<string>>} Resolves successfully with an array of tag names
 *
 * @example
 * let tags = await git.listTags({ fs, dir: '/tutorial' })
 * console.log(tags)
 *
 */
export async function listTags({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
}): Promise<string[]> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: {},
    })

    return listTagRefs({ fs, gitdir: effectiveGitdir })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.listTags'
    throw err
  }
}

