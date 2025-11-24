import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { collect } from "../utils/collect.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"

import { _pack } from './pack.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 *
 * @typedef {Object} PackObjectsResult The packObjects command returns an object with two properties:
 * @property {string} filename - The suggested filename for the packfile if you want to save it to disk somewhere. It includes the packfile SHA.
 * @property {Uint8Array} [packfile] - The packfile contents. Not present if `write` parameter was true, in which case the packfile was written straight to disk.
 */

export type PackObjectsResult = {
  filename: string
  packfile?: Uint8Array
}

/**
 * Create a packfile from an array of SHA-1 object ids
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string[]} args.oids - An array of SHA-1 object ids to be included in the packfile
 * @param {boolean} [args.write = false] - Whether to save the packfile to disk or not
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<PackObjectsResult>} Resolves successfully when the packfile is ready with the filename and buffer
 * @see PackObjectsResult
 *
 * @example
 * // Create a packfile containing only an empty tree
 * let { packfile } = await git.packObjects({
 *   fs,
 *   dir: '/tutorial',
 *   oids: ['4b825dc642cb6eb9a060e54bf8d69288fbee4904']
 * })
 * console.log(packfile)
 *
 */
export type PackObjectsOptions = BaseCommandOptions & {
  oids: string[]
  write?: boolean
}

export async function packObjects({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  oids,
  write = false,
  cache = {},
}: PackObjectsOptions): Promise<PackObjectsResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      oids,
      write,
    })

    assertParameter('oids', oids)

    return await _packObjects({
      fs: fs as any,
      cache,
      gitdir: effectiveGitdir,
      oids,
      write,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.packObjects'
    throw err
  }
}

/**
 * @param {object} args
 * @param {import('../types.ts').FileSystemProvider} args.fs
 * @param {any} args.cache
 * @param {string} args.gitdir
 * @param {string[]} args.oids
 * @param {boolean} args.write
 *
 * @returns {Promise<PackObjectsResult>}
 * @see PackObjectsResult
 */
export async function _packObjects({ fs, cache, gitdir, oids, write }: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oids: string[]
  write: boolean
}): Promise<PackObjectsResult> {
  const buffers = await _pack({ fs, cache, gitdir, oids })
  const packfile = UniversalBuffer.from(await collect(buffers))
  const packfileSha = packfile.slice(-20).toString('hex')
  const filename = `pack-${packfileSha}.pack`
  if (write) {
    await fs.write(join(gitdir, `objects/pack/${filename}`), packfile)
    return { filename }
  }
  return {
    filename,
    packfile: new Uint8Array(packfile),
  }
}

