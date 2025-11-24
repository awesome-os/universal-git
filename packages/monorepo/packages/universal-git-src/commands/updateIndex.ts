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
    const { repo, fs, gitdir: effectiveGitdir, dir: effectiveDir } = await normalizeCommandArgs({
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
    
    // updateIndex requires a working directory
    if (!effectiveDir) {
      throw new MissingParameterError('dir')
    }

    if (remove) {
      // Use Repository.readIndexDirect() and writeIndexDirect() for consistency
      const index = await repo.readIndexDirect(false) // Force fresh read
      
      if (!force) {
        // Check if the file is still present in the working directory
        const fileStats = await fs.lstat(join(effectiveDir, filepath))

        if (fileStats) {
          if (fileStats.isDirectory()) {
            // Removing directories should not work
            throw new InvalidFilepathError('directory')
          }

          // Do nothing if we don't force and the file still exists in the workdir
          return
        }
      }

      // Directories are not allowed, so we make sure the provided filepath exists in the index
      if (index.has({ filepath })) {
        index.delete({
          filepath,
        })
        await repo.writeIndexDirect(index)
      }
      return
    }

    // Test if it is a file and exists on disk if `remove` is not provided, only of no oid is provided
    let fileStats: any

    if (!oid) {
      fileStats = await fs.lstat(join(effectiveDir, filepath))

      if (!fileStats) {
        throw new NotFoundError(
          `file at "${filepath}" on disk and "remove" not set`
        )
      }

      if (fileStats.isDirectory()) {
        throw new InvalidFilepathError('directory')
      }
    }

    // Use Repository.readIndexDirect() and writeIndexDirect() for consistency
    const index = await repo.readIndexDirect(false) // Force fresh read
    
    if (!add && !index.has({ filepath })) {
      // If the index does not contain the filepath yet and `add` is not set, we should throw
      throw new NotFoundError(
        `file at "${filepath}" in index and "add" not set`
      )
    }

    let stats: any
    if (!oid) {
      stats = fileStats

      // Write the file to the object database
      const object = stats.isSymbolicLink()
        ? await fs.readlink(join(effectiveDir, filepath))
        : await fs.read(join(effectiveDir, filepath))

      // Convert string to UniversalBuffer if needed, skip if null
      if (object) {
        const objectBuffer = typeof object === 'string' 
          ? UniversalBuffer.from(object) 
          : object
        oid = await writeObjectInternal({
          fs,
          gitdir: effectiveGitdir,
          type: 'blob',
          format: 'content',
          object: objectBuffer,
        })
      }
    } else {
      // By default we use 0 for the stats of the index file
      stats = {
        ctime: new Date(0),
        mtime: new Date(0),
        dev: 0,
        ino: 0,
        mode,
        uid: 0,
        gid: 0,
        size: 0,
      }
    }

    // Ensure oid is defined before inserting
    if (!oid) {
      throw new Error('oid is required for index.insert')
    }

    index.insert({
      filepath,
      oid,
      stats,
    })

    await repo.writeIndexDirect(index)
    return oid
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.updateIndex'
    throw err
  }
}

