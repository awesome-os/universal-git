// GitRefManager import removed - using src/git/refs/ functions instead
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { hashObject } from "../utils/hashObject.ts"
import { join } from "../utils/join.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import { resolveFilepath } from "../utils/resolveFilepath.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { extendStat, type ExtendedStat } from "../utils/statHelpers.ts"
import type { CommandWithFilepathOptions } from "../types/commandOptions.ts"

/**
 * Reset a file in the git index (aka staging area)
 *
 * Note that this does NOT modify the file in the working directory.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.filepath - The path to the file to reset in the index
 * @param {string} [args.ref = 'HEAD'] - A ref to the commit to use
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<void>} Resolves successfully once the git index has been updated
 *
 * @example
 * await git.resetIndex({ fs, dir: '/tutorial', filepath: 'README.md' })
 * console.log('done')
 *
 */
export type ResetIndexOptions = CommandWithFilepathOptions & {
  ref?: string
}

export async function resetIndex({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  ref,
  cache = {},
}: ResetIndexOptions): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, dir: effectiveDir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      filepath,
      ref,
    })

    assertParameter('filepath', filepath)

    let oid: string | null
    let workdirOid: string | undefined

    try {
      // Resolve commit - use direct resolveRef() for consistency
      const { resolveRef } = await import('../git/refs/readRef.ts')
      oid = await resolveRef({ fs, gitdir: effectiveGitdir, ref: ref || 'HEAD' })
    } catch (e) {
      if (ref) {
        // Only throw the error if a ref is explicitly provided
        throw e
      }
      oid = null
    }

    // Not having an oid at this point means `resetIndex()` was called without explicit `ref` on a new git
    // repository. If that happens, we can skip resolving the file path.
    if (oid) {
      try {
        // Resolve blob
        oid = await resolveFilepath({
          fs,
          cache,
          gitdir: effectiveGitdir,
          oid,
          filepath,
        })
      } catch (e) {
        // This means we're resetting the file to a "deleted" state
        oid = null
      }
    }

    // For files that aren't in the workdir use zeros
    let stats: ExtendedStat | null = extendStat({
      ctimeSeconds: 0,
      ctimeNanoseconds: 0,
      mtimeSeconds: 0,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      mode: 0,
      uid: 0,
      gid: 0,
      size: 0,
    })
    // If the file exists in the workdir...
    if (effectiveDir) {
      const object = await fs.read(join(effectiveDir, filepath))
      if (object) {
        // ... and has the same hash as the desired state...
        // Convert string to UniversalBuffer if needed
        const objectBuffer = typeof object === 'string' 
          ? UniversalBuffer.from(object) 
          : object
        workdirOid = await hashObject({
          gitdir: effectiveGitdir,
          type: 'blob',
          object: objectBuffer,
        })
        if (oid === workdirOid) {
          // ... use the workdir Stats object
          stats = await fs.lstat(join(effectiveDir, filepath))
        }
      }
    }
    // Use Repository.readIndexDirect() and writeIndexDirect() for consistency
    const index = await repo.readIndexDirect(false) // Force fresh read
    
    index.delete({ filepath })
    if (oid) {
      index.insert({ filepath, stats: stats ?? undefined, oid })
    }
    await repo.writeIndexDirect(index)
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.resetIndex'
    throw err
  }
}

