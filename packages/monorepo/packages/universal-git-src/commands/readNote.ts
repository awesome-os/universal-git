import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { resolveRef } from "../git/refs/readRef.ts"
import { readBlob } from './readBlob.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Read the contents of a note
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} [args.ref] - The notes ref to look under
 * @param {string} args.oid - The SHA-1 object id of the object to get the note for.
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<Uint8Array>} Resolves successfully with note contents as a UniversalBuffer.
 */
export async function readNote({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref = 'refs/notes/commits',
  oid,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  ref?: string
  oid: string
  cache?: Record<string, unknown>
}): Promise<Uint8Array> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      ref,
      oid,
    })

    assertParameter('ref', ref)
    assertParameter('oid', oid)

    const parent = await resolveRef({ fs, gitdir: effectiveGitdir, ref })
    const { blob } = await readBlob({
      repo,
      fs,
      cache: effectiveCache,
      gitdir: effectiveGitdir,
      oid: parent,
      filepath: oid,
    })

    return blob
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.readNote'
    throw err
  }
}

