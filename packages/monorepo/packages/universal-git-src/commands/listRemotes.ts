import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * List remotes
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 *
 * @returns {Promise<Array<{remote: string, url: string}>>} Resolves successfully with an array of `{remote, url}` objects
 *
 * @example
 * let remotes = await git.listRemotes({ fs, dir: '/tutorial' })
 * console.log(remotes)
 *
 */
export async function listRemotes({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  cache = {},
}: BaseCommandOptions): Promise<Array<{ remote: string; url: string }>> {
  try {
    const { repo } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
    })

    const result = await _listRemotes({
      repo,
      fs: repo.fs,
      gitdir: await repo.getGitdir(),
    })
    return result.map(({ remote, url }) => ({
      remote: remote || '',
      url: String(url || ''),
    }))
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.listRemotes'
    throw err
  }
}

/**
 * Internal listRemotes implementation
 * @internal - Exported for use by other commands
 */
export async function _listRemotes({
  repo: _repo,
  fs: _fs,
  gitdir: _gitdir,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  gitdir?: string
}): Promise<Array<{ remote: string; url: string | undefined }>> {
  // Use normalizeCommandArgs for consistency
  const { repo } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitdir: _gitdir,
    cache: {},
  })

  const config = await repo.getConfig()
  const remoteNames = await config.getSubsections('remote')
  const remotes = await Promise.all(
    remoteNames.map(async remote => {
      const url = await config.get(`remote.${remote}.url`)
      return { remote: remote || '', url: url as string | undefined }
    })
  )
  return remotes.filter(r => r.remote !== '')
}
