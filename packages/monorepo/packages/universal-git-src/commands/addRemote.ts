import cleanGitRef from 'clean-git-ref'

import { AlreadyExistsError } from '../errors/AlreadyExistsError.ts'
import { InvalidRefNameError } from '../errors/InvalidRefNameError.ts'
import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import validRef from "../utils/isValidRef.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Add or update a remote
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.remote - The name of the remote
 * @param {string} args.url - The URL of the remote
 * @param {boolean} [args.force = false] - Instead of throwing an error if a remote named `remote` already exists, overwrite the existing remote.
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.addRemote({
 *   fs,
 *   dir: '/tutorial',
 *   remote: 'upstream',
 *   url: 'https://github.com/awesome-os/universal-git'
 * })
 * console.log('done')
 *
 */
export async function addRemote({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  remote,
  url,
  force = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  remote: string
  url: string
  force?: boolean
  cache?: Record<string, unknown>
}): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      remote,
      url,
      force,
    })

    assertParameter('remote', remote)
    assertParameter('url', url)

    if (!validRef(remote, true)) {
      throw new InvalidRefNameError(remote, cleanGitRef.clean(remote))
    }
    
    const config = await repo.getConfig()
    
    if (!force) {
      // Check that setting it wouldn't overwrite.
      const remoteNames = await config.getSubsections('remote')
      if (remoteNames.includes(remote)) {
        // Throw an error if it would overwrite an existing remote,
        // but not if it's simply setting the same value again.
        const existingUrl = await config.get(`remote.${remote}.url`)
        if (url !== existingUrl) {
          throw new AlreadyExistsError('remote', remote)
        }
      }
    }
    await config.set(`remote.${remote}.url`, url, 'local', false)
    await config.set(
      `remote.${remote}.fetch`,
      `+refs/heads/*:refs/remotes/${remote}/*`,
      'local',
      false
    )
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.addRemote'
    throw err
  }
}

