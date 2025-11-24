import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { isIgnored as isIgnoredInternal } from "../git/info/isIgnored.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithFilepathOptions } from "../types/commandOptions.ts"

/**
 * Test whether a filepath should be ignored (because of .gitignore or .git/exclude)
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.filepath - The filepath to test
 *
 * @returns {Promise<boolean>} Resolves to true if the file should be ignored
 *
 * @example
 * await git.isIgnored({ fs, dir: '/tutorial', filepath: 'docs/add.md' })
 *
 */
export async function isIgnored({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  cache = {},
}: CommandWithFilepathOptions): Promise<boolean> {
  try {
    const { repo, fs, dir: effectiveDir, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      filepath,
    })

    assertParameter('filepath', filepath)

    if (!effectiveDir) {
      throw new MissingParameterError('dir')
    }

    return isIgnoredInternal({
      fs,
      dir: effectiveDir,
      gitdir: effectiveGitdir,
      filepath,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.isIgnored'
    throw err
  }
}

