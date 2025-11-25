import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { GitPackIndex } from "../models/GitPackIndex.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { readObject } from "../git/objects/readObject.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { ProgressCallback } from "../git/remote/types.ts"
import type { CommandWithFilepathOptions } from "../types/commandOptions.ts"

/**
 * Create the .idx file for a given .pack file
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {ProgressCallback} [args.onProgress] - optional progress event callback
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.filepath - The path to the .pack file to index
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<{oids: string[]}>} Resolves with a list of the SHA-1 object ids contained in the packfile
 *
 * @example
 * let packfiles = await fs.promises.readdir('/tutorial/.git/objects/pack')
 * packfiles = packfiles.filter(name => name.endsWith('.pack'))
 * console.log('packfiles', packfiles)
 *
 * const { oids } = await git.indexPack({
 *   fs,
 *   dir: '/tutorial',
 *   filepath: `.git/objects/pack/${packfiles[0]}`,
 *   async onProgress (evt) {
 *     console.log(`${evt.phase}: ${evt.loaded} / ${evt.total}`)
 *   }
 * })
 * console.log(oids)
 *
 */
export type IndexPackOptions = CommandWithFilepathOptions & {
  onProgress?: ProgressCallback
}

export async function indexPack({
  repo: _repo,
  fs: _fs,
  gitBackend,
  worktree,
  onProgress,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  cache = {},
}: IndexPackOptions): Promise<{ oids: string[] }> {
  try {
    const { repo, fs, dir: effectiveDir, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      gitBackend,
      worktree,
      dir,
      gitdir,
      cache,
      onProgress,
      filepath,
    })

    assertParameter('filepath', filepath)

    // _indexPack requires dir to be the base directory for filepath resolution
    // If dir is not provided, use gitdir as the base (for bare repos or when filepath is relative to gitdir)
    const baseDir = effectiveDir || effectiveGitdir
    if (!baseDir) {
      throw new MissingParameterError('dir')
    }

    return await _indexPack({
      fs: fs as any,
      cache: effectiveCache,
      onProgress,
      dir: baseDir,
      gitdir: effectiveGitdir,
      filepath,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.indexPack'
    throw err
  }
}

/**
 * Index a pack file
 */
export async function _indexPack({
  fs,
  cache,
  onProgress,
  dir,
  gitdir,
  filepath,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  onProgress?: ProgressCallback
  dir: string
  gitdir: string
  filepath: string
}): Promise<{ oids: string[] }> {
  try {
    const fullPath = join(dir, filepath)
    const pack = await fs.read(fullPath)
    if (!pack) {
      throw new Error('Failed to read pack file')
    }
    const getExternalRefDelta = (oid: string) => readObject({ fs, cache, gitdir, oid })
    const idx = await GitPackIndex.fromPack({
      pack: pack as Uint8Array,
      getExternalRefDelta,
      onProgress,
    })
    await fs.write(fullPath.replace(/\.pack$/, '.idx'), await idx.toBuffer())
    return {
      oids: [...idx.hashes],
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.indexPack'
    throw err
  }
}

