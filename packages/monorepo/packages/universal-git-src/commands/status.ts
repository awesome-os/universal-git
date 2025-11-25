import { IgnoreManager } from "../core-utils/filesystem/IgnoreManager.ts"
import { WorkdirManager } from "../git/worktree/WorkdirManager.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithFilepathOptions } from "../types/commandOptions.ts"

/**
 * Tell whether a file has been changed
 *
 * The possible resolve values are:
 *
 * | status                | description                                                                           |
 * | --------------------- | ------------------------------------------------------------------------------------- |
 * | `"ignored"`           | file ignored by a .gitignore rule                                                     |
 * | `"unmodified"`        | file unchanged from HEAD commit                                                       |
 * | `"*modified"`         | file has modifications, not yet staged                                                |
 * | `"*deleted"`          | file has been removed, but the removal is not yet staged                              |
 * | `"*added"`            | file is untracked, not yet staged                                                     |
 * | `"absent"`            | file not present in HEAD commit, staging area, or working dir                         |
 * | `"modified"`          | file has modifications, staged                                                        |
 * | `"deleted"`           | file has been removed, staged                                                         |
 * | `"added"`             | previously untracked file, staged                                                     |
 * | `"*unmodified"`       | working dir and HEAD commit match, but index differs                                  |
 * | `"*absent"`           | file not present in working dir or HEAD commit, but present in the index              |
 * | `"*undeleted"`        | file was deleted from the index, but is still in the working dir                      |
 * | `"*undeletemodified"` | file was deleted from the index, but is present with modifications in the working dir |
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.filepath - The path to the file to query
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<'ignored'|'unmodified'|'*modified'|'*deleted'|'*added'|'absent'|'modified'|'deleted'|'added'|'*unmodified'|'*absent'|'*undeleted'|'*undeletemodified'>} Resolves successfully with the file's git status
 *
 * @example
 * let status = await git.status({ fs, dir: '/tutorial', filepath: 'README.md' })
 * console.log(status)
 *
 */
export type FileStatus =
  | 'ignored'
  | 'unmodified'
  | '*modified'
  | '*deleted'
  | '*added'
  | 'absent'
  | 'modified'
  | 'deleted'
  | 'added'
  | '*unmodified'
  | '*absent'
  | '*undeleted'
  | '*undeletemodified'

export type StatusOptions = CommandWithFilepathOptions

export async function status({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  cache = {},
}: StatusOptions): Promise<FileStatus> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, dir: effectiveDir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      filepath,
    })

    // status requires a working directory
    if (!effectiveDir) {
      throw new MissingParameterError('dir')
    }

    assertParameter('filepath', filepath)

    // Check if ignored
    const ignored = await IgnoreManager.checkIgnored({
      fs,
      gitdir: effectiveGitdir,
      dir: effectiveDir,
      filepath,
    })
    if (ignored) {
      return 'ignored' as FileStatus
    }

    // Use WorkdirManager to get status - pass the Repository object directly
    const statusResult = await WorkdirManager.getFileStatus({
      repo,
      filepath,
    })
    return statusResult as FileStatus
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.status'
    throw err
  }
}

