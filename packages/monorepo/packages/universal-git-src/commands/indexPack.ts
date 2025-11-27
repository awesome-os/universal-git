import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { GitPackIndex } from "../models/GitPackIndex.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { readObject } from "../git/objects/readObject.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import { basename } from "../utils/basename.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
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

    if (!repo) {
      throw new MissingParameterError('repo (required for pack file operations via GitBackend)')
    }

    if (!repo.gitBackend) {
      throw new MissingParameterError('repo.gitBackend (required for pack file operations)')
    }

    return await _indexPack({
      repo,
      fs: fs as any, // Still needed for readObject calls (external ref deltas)
      cache: effectiveCache,
      onProgress,
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
 * Uses GitBackend methods to read/write pack files (works with any backend: filesystem, SQLite, etc.)
 */
export async function _indexPack({
  repo,
  fs,
  cache,
  onProgress,
  gitdir,
  filepath,
}: {
  repo: Repository
  fs: FileSystemProvider // Still needed for readObject calls (external ref deltas)
  cache: Record<string, unknown>
  onProgress?: ProgressCallback
  gitdir: string
  filepath: string
}): Promise<{ oids: string[] }> {
  try {
    // Extract pack file name from filepath (e.g., "objects/pack/pack-abc123.pack" -> "pack-abc123.pack")
    const packFileName = basename(filepath)
    if (!packFileName.endsWith('.pack')) {
      throw new Error(`Invalid pack file path: ${filepath} (must end with .pack)`)
    }

    // Read pack file via GitBackend (works with any backend: filesystem, SQLite, etc.)
    const gitBackend = repo.gitBackend!
    const pack = await gitBackend.readPackfile(packFileName)
    if (!pack) {
      throw new Error(`Failed to read pack file: ${packFileName}`)
    }

    // Convert to Uint8Array for GitPackIndex.fromPack
    const packBuffer = UniversalBuffer.isBuffer(pack) ? pack : UniversalBuffer.from(pack)
    const packArray = packBuffer instanceof Uint8Array ? packBuffer : new Uint8Array(packBuffer)

    // Create index from pack file
    const getExternalRefDelta = (oid: string) => readObject({ fs, cache, gitdir, oid })
    const idx = await GitPackIndex.fromPack({
      pack: packArray,
      getExternalRefDelta,
      onProgress,
    })

    // Write index file via GitBackend (works with any backend)
    const indexFileName = packFileName.replace(/\.pack$/, '.idx')
    const indexBuffer = await idx.toBuffer()
    await gitBackend.writePackIndex(indexFileName, UniversalBuffer.from(indexBuffer))

    return {
      oids: [...idx.hashes],
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.indexPack'
    throw err
  }
}

