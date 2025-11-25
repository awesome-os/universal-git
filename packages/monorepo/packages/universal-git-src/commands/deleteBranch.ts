import { _currentBranch } from "./currentBranch.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { NotFoundError } from '../errors/NotFoundError.ts'
import { resolveRef } from "../git/refs/readRef.ts"
import { writeRef } from "../git/refs/writeRef.ts"
import { deleteRef } from "../git/refs/deleteRef.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { parse as parseConfig, serialize as serializeConfig } from "../core-utils/ConfigParser.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { abbreviateRef } from "../utils/abbreviateRef.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { CommandWithRefOptions } from "../types/commandOptions.ts"

/**
 * Delete a local branch
 *
 * > Note: This only deletes loose branches - it should be fixed in the future to delete packed branches as well.
 *
 * @param {Object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - The branch to delete
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.deleteBranch({ fs, dir: '/tutorial', ref: 'local-branch' })
 * console.log('done')
 *
 */
export async function deleteBranch({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
}: CommandWithRefOptions): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: {},
      ref,
    })

    assertParameter('ref', ref)
    return await _deleteBranch({
      repo,
      fs: fs as any,
      gitdir: effectiveGitdir,
      ref,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.deleteBranch'
    throw err
  }
}

/**
 * @param {Object} args
 * @param {import('../types.ts').FileSystemProvider} args.fs
 * @param {string} args.gitdir
 * @param {string} args.ref
 *
 * @returns {Promise<void>}
 */
export async function _deleteBranch({ 
  repo: _repo,
  fs: _fs, 
  gitdir: _gitdir, 
  ref 
}: { 
  repo?: Repository
  fs?: FileSystemProvider
  gitdir?: string
  ref: string 
}): Promise<void> {
  // Use normalizeCommandArgs for consistency
  const { repo, fs, gitdir } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitdir: _gitdir,
    cache: {},
    ref,
  })

  ref = ref.startsWith('refs/heads/') ? ref : `refs/heads/${ref}`
  try {
    await resolveRef({ fs, gitdir, ref })
  } catch (e) {
    throw new NotFoundError(ref)
  }

  const currentRef = await _currentBranch({ fs, gitdir, fullname: true })
  if (ref === currentRef) {
    // detach HEAD
    const value = await resolveRef({ fs, gitdir, ref })
    await writeRef({ fs, gitdir, ref: 'HEAD', value })
  }

  // Delete a specified branch
  await deleteRef({ fs, gitdir, ref })

  // Delete branch config entries
  const abbrevRef = abbreviateRef(ref)
  let configBuffer: UniversalBuffer = UniversalBuffer.alloc(0)
  try {
    const configData = await fs.read(join(gitdir, 'config'))
    configBuffer = configData ? UniversalBuffer.from(configData as string | Uint8Array) : UniversalBuffer.alloc(0)
  } catch (err) {
    // Config doesn't exist
    return
  }
  const config = parseConfig(configBuffer)
  config.deleteSection('branch', abbrevRef)
  const updatedConfig = serializeConfig(config)
  await fs.write(join(gitdir, 'config'), updatedConfig)
}

