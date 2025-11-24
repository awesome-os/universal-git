import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { writeObject as writeObjectInternal } from "../git/objects/writeObject.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Write a blob object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {Uint8Array} args.blob - The blob object to write
 * @param {boolean} [args.dryRun=false] - If true, compute the OID without writing to disk
 *
 * @returns {Promise<string>} Resolves successfully with the SHA-1 object id of the newly written object
 *
 * @example
 * // Manually create a blob.
 * let oid = await git.writeBlob({
 *   fs,
 *   dir: '/tutorial',
 *   blob: new Uint8Array([])
 * })
 *
 * console.log('oid', oid) // should be 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
 *
 */
export type WriteBlobOptions = BaseCommandOptions & {
  blob: Uint8Array
  dryRun?: boolean
}

export async function writeBlob({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  blob,
  dryRun = false,
  cache = {},
}: WriteBlobOptions): Promise<string> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      blob,
      dryRun,
    })

    assertParameter('blob', blob)

    return await writeObjectInternal({
      fs,
      gitdir: effectiveGitdir,
      type: 'blob',
      object: blob,
      format: 'content',
      dryRun,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.writeBlob'
    throw err
  }
}

