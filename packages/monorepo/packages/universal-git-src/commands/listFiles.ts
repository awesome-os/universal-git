import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { readTree } from './readTree.ts'
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
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
  worktree?: boolean // If true, list files from worktree instead of index
}

export async function listFiles({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  worktree = false,
  cache = {},
}: ListFilesOptions): Promise<string[]> {
  try {
    const { repo } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      ref,
      worktree,
    })

    // If worktree option is true, list files from worktree
    if (worktree) {
      if (!repo?.worktreeBackend) {
        throw new MissingParameterError('worktreeBackend (required for listing worktree files)')
      }
      return await repo.worktreeBackend.listFiles()
    }

    return await _listFiles({
      repo,
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
  ref,
}: {
  repo?: Repository
  ref?: string
}): Promise<string[]> {
  if (!_repo) {
    throw new MissingParameterError('repo (required for listFiles operation)')
  }
  const repo = _repo

  if (ref) {
    // Use repo.resolveRef() which uses backend methods
    const oid = await repo.resolveRef(ref)
    const filenames: string[] = []
    await accumulateFilesFromOid({
      repo,
      oid,
      filenames,
      prefix: '',
    })
    return filenames
  } else {
    // Use gitBackend.readIndex() directly instead of repo.readIndexDirect()
    if (!repo.gitBackend) {
      throw new MissingParameterError('gitBackend (required for listFiles operation)')
    }
    
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    // Read index directly from backend
    let indexBuffer: UniversalBuffer
    try {
      indexBuffer = await repo.gitBackend.readIndex()
    } catch {
      // Index doesn't exist - return empty array
      return []
    }

    // Parse index
    if (indexBuffer.length === 0) {
      return []
    }
    
    // Detect object format - use gitBackend
    const objectFormat = await detectObjectFormat(
      undefined,
      undefined,
      repo.cache,
      repo.gitBackend
    )
    const index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    
    // Filter out entries without paths and return sorted list
    // This handles edge cases where entries might not have paths set
    return index.entries
      .map(x => x.path)
      .filter((path): path is string => path !== undefined && path !== null && path !== '')
  }
}

async function accumulateFilesFromOid({
  repo,
  oid,
  filenames,
  prefix,
}: {
  repo: Repository
  oid: string
  filenames: string[]
  prefix: string
}): Promise<void> {
  const { tree } = await readTree({ repo, oid })
  // TODO: Use `walk` to do this. Should be faster.
  for (const entry of tree) {
    if (!entry.path) continue // Skip entries without paths
    if (entry.type === 'tree') {
      await accumulateFilesFromOid({
        repo,
        oid: entry.oid,
        filenames,
        prefix: join(prefix, entry.path),
      })
    } else {
      filenames.push(join(prefix, entry.path))
    }
  }
}

