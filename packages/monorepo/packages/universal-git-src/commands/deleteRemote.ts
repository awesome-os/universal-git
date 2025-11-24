import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { parse as parseConfig, serialize as serializeConfig } from "../core-utils/ConfigParser.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

/**
 * Removes the local config entry for a given remote
 *
 * @param {Object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.remote - The name of the remote to delete
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.deleteRemote({ fs, dir: '/tutorial', remote: 'upstream' })
 * console.log('done')
 *
 */
export async function deleteRemote({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  remote,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  remote: string
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
    })

    assertParameter('remote', remote)

    let configBuffer: UniversalBuffer = UniversalBuffer.alloc(0)
    try {
      const configData = await fs.read(join(effectiveGitdir, 'config'))
      configBuffer = configData ? UniversalBuffer.from(configData as string | Uint8Array) : UniversalBuffer.alloc(0)
    } catch (err) {
      // Config doesn't exist
      return
    }
    const config = parseConfig(configBuffer)
    config.deleteSection('remote', remote)
    const updatedConfig = serializeConfig(config)
    await fs.write(join(effectiveGitdir, 'config'), updatedConfig)
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.deleteRemote'
    throw err
  }
}

