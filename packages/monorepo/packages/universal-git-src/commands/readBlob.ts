import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { join } from "../utils/join.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

// ============================================================================
// READ BLOB TYPES
// ============================================================================

/**
 * Result of reading a blob object
 */
export type ReadBlobResult = {
  oid: string
  blob: Uint8Array
}

/**
 * Read a blob object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.oid - The SHA-1 object id to get. Annotated tags, commits, and trees are peeled.
 * @param {string} [args.filepath] - Don't return the object with `oid` itself, but resolve `oid` to a tree and then return the blob object at that filepath.
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<ReadBlobResult>} Resolves successfully with a blob object description
 * @see ReadBlobResult
 *
 * @example
 * // Get the contents of 'README.md' in the main branch.
 * let commitOid = await git.resolveRef({ fs, dir: '/tutorial', ref: 'main' })
 * console.log(commitOid)
 * let { blob } = await git.readBlob({
 *   fs,
 *   dir: '/tutorial',
 *   oid: commitOid,
 *   filepath: 'README.md'
 * })
 * console.log(UniversalBuffer.from(blob).toString('utf8'))
 *
 */
export type ReadBlobOptions = BaseCommandOptions & {
  oid: string
  filepath?: string
}

export async function readBlob({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  oid,
  filepath,
  cache = {},
}: ReadBlobOptions): Promise<ReadBlobResult> {
  try {
    const { repo, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      oid,
      filepath,
    })

    assertParameter('oid', oid)

    if (!repo?.gitBackend) {
      throw new MissingParameterError('gitBackend (required for readBlob operation)')
    }

    return await repo.gitBackend.readBlob(oid, filepath)
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.readBlob'
    throw err
  }
}

