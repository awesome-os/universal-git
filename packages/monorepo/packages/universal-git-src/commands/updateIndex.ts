import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { InvalidFilepathError } from "../errors/InvalidFilepathError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { writeObject as writeObjectInternal } from "../git/objects/writeObject.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithFilepathOptions } from "../types/commandOptions.ts"

/**
 * Register file contents in the working tree or object database to the git index (aka staging area).
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.filepath - File to act upon.
 * @param {string} [args.oid] - OID of the object in the object database to add to the index with the specified filepath.
 * @param {number} [args.mode = 100644] - The file mode to add the file to the index.
 * @param {boolean} [args.add] - Adds the specified file to the index if it does not yet exist in the index.
 * @param {boolean} [args.remove] - Remove the specified file from the index if it does not exist in the workspace anymore.
 * @param {boolean} [args.force] - Remove the specified file from the index, even if it still exists in the workspace.
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<string | void>} Resolves successfully with the SHA-1 object id of the object written or updated in the index, or nothing if the file was removed.
 *
 * @example
 * await git.updateIndex({
 *   fs,
 *   dir: '/tutorial',
 *   filepath: 'readme.md'
 * })
 *
 * @example
 * // Manually create a blob in the object database.
 * let oid = await git.writeBlob({
 *   fs,
 *   dir: '/tutorial',
 *   blob: new Uint8Array([])
 * })
 *
 * // Write the object in the object database to the index.
 * await git.updateIndex({
 *   fs,
 *   dir: '/tutorial',
 *   add: true,
 *   filepath: 'readme.md',
 *   oid
 * })
 */
export type UpdateIndexOptions = CommandWithFilepathOptions & {
  oid?: string
  mode?: number
  add?: boolean
  remove?: boolean
  force?: boolean
}

export async function updateIndex({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  cache = {},
  filepath,
  oid,
  mode,
  add,
  remove,
  force,
}: UpdateIndexOptions): Promise<string | void> {
  try {
    const { repo, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      filepath,
      oid,
      mode,
      add,
      remove,
      force,
    })

    assertParameter('filepath', filepath)

    const worktreeBackend = repo?.worktreeBackend ?? null
    if (!worktreeBackend) {
      throw new MissingParameterError('worktreeBackend (required for updateIndex operation)')
    }

    // Get gitBackend from repo if not provided directly
    const effectiveGitBackend = repo?.gitBackend
    if (!effectiveGitBackend) {
      throw new MissingParameterError('gitBackend (required for updateIndex operation)')
    }

    // Delegate to gitBackend.updateIndex
    return await effectiveGitBackend.updateIndex(worktreeBackend, filepath, {
      oid,
      mode,
      add,
      remove,
      force,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.updateIndex'
    throw err
  }
}

