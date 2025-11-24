import { resolveFilepath } from "../utils/resolveFilepath.ts"
import { resolveTree } from "../utils/resolveTree.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { join } from "../utils/join.ts"
import { detectObjectFormat, type ObjectFormat } from "../utils/detectObjectFormat.ts"
import type { FileSystem } from "../models/FileSystem.ts"
import type { ReadTreeResult } from "../models/GitTree.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Read a tree object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.oid - The object id to get. Annotated tags and commits are peeled.
 * @param {string} [args.filepath] - Don't return the object with `oid` itself, but resolve `oid` to a tree and then return the tree object at that filepath.
 * @param {object} [args.cache] - a [cache](cache.md) object
 * @param {'sha1'|'sha256'} [args.objectFormat] - Object format ('sha1' or 'sha256'), will detect if not provided
 *
 * @returns {Promise<ReadTreeResult>} Resolves successfully with a git tree object
 * @see ReadTreeResult
 * @see TreeObject
 * @see TreeEntry
 *
 */
export type ReadTreeOptions = BaseCommandOptions & {
  oid: string
  filepath?: string
  objectFormat?: ObjectFormat
}

export async function readTree({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  oid,
  filepath,
  cache = {},
  objectFormat,
}: ReadTreeOptions): Promise<ReadTreeResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      oid,
      filepath,
      objectFormat,
    })
    
    // Detect object format from repository if not provided
    let format: ObjectFormat | undefined = objectFormat
    if (!format) {
      format = await repo.getObjectFormat()
    }
    
    assertParameter('oid', oid)

    let resolvedOid = oid
    if (filepath !== undefined) {
      resolvedOid = await resolveFilepath({ fs, cache: effectiveCache, gitdir: effectiveGitdir, oid, filepath })
    }
    const { tree, oid: treeOid } = await resolveTree({ fs, cache: effectiveCache, gitdir: effectiveGitdir, oid: resolvedOid, objectFormat: format })
    const result: ReadTreeResult = {
      oid: treeOid,
      tree: tree,
    }
    return result
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.readTree'
    throw err
  }
}

