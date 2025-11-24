import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { readTree } from './readTree.ts'
// GitRefManager import removed - using src/git/refs/ functions instead
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystem } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * List all the files in the git index or a commit
 *
 * > Note: This function is efficient for listing the files in the staging area, but listing all the files in a commit requires recursively walking through the git object store.
 * > If you do not require a complete list of every file, better performance can be achieved by using [walk](./walk) and ignoring subdirectories you don't care about.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} [args.ref] - Return a list of all the files in the commit at `ref` instead of the files currently in the git index (aka staging area)
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<Array<string>>} Resolves successfully with an array of filepaths
 *
 * @example
 * // All the files in the previous commit
 * let files = await git.listFiles({ fs, dir: '/tutorial', ref: 'HEAD' })
 * console.log(files)
 * // All the files in the current staging area
 * files = await git.listFiles({ fs, dir: '/tutorial' })
 * console.log(files)
 *
 */
export type ListFilesOptions = BaseCommandOptions & {
  ref?: string
}

export async function listFiles({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  cache = {},
}: ListFilesOptions): Promise<string[]> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      ref,
    })

    return await _listFiles({
      repo,
      fs: fs as any,
      cache,
      gitdir: effectiveGitdir,
      ref,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.listFiles'
    throw err
  }
}

/**
 * Internal listFiles implementation
 * @internal - Exported for use by other commands
 */
export async function _listFiles({
  repo: _repo,
  fs: _fs,
  gitdir: _gitdir,
  ref,
  cache: _cache,
}: {
  repo?: Repository
  fs?: FileSystem
  gitdir?: string
  ref?: string
  cache?: Record<string, unknown>
}): Promise<string[]> {
  // Use normalizeCommandArgs for consistency
  const { repo } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitdir: _gitdir,
    cache: _cache || {},
    ref,
  })

  if (ref) {
    // Use direct resolveRef() for consistency
    const { resolveRef } = await import('../git/refs/readRef.ts')
    const oid = await resolveRef({ fs: repo.fs, gitdir: await repo.getGitdir(), ref })
    const filenames: string[] = []
    await accumulateFilesFromOid({
      fs: repo.fs as FileSystem,
      cache: repo.cache,
      gitdir: await repo.getGitdir(),
      oid,
      filenames,
      prefix: '',
    })
    return filenames
  } else {
    // Use Repository.readIndexDirect() for consistency
    const index = await repo.readIndexDirect(false) // Force fresh read
    // Filter out entries without paths and return sorted list
    // This handles edge cases where entries might not have paths set
    return index.entries
      .map(x => x.path)
      .filter((path): path is string => path !== undefined && path !== null && path !== '')
  }
}

async function accumulateFilesFromOid({
  fs,
  cache,
  gitdir,
  oid,
  filenames,
  prefix,
}: {
  fs: FileSystem
  cache: Record<string, unknown>
  gitdir: string
  oid: string
  filenames: string[]
  prefix: string
}): Promise<void> {
  const { tree } = await readTree({ fs, cache, gitdir, oid })
  // TODO: Use `walk` to do this. Should be faster.
  for (const entry of tree) {
    if (!entry.path) continue // Skip entries without paths
    if (entry.type === 'tree') {
      await accumulateFilesFromOid({
        fs,
        cache,
        gitdir,
        oid: entry.oid,
        filenames,
        prefix: join(prefix, entry.path),
      })
    } else {
      filenames.push(join(prefix, entry.path))
    }
  }
}

