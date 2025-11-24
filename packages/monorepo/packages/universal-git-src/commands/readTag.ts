import { ObjectTypeError } from "../errors/ObjectTypeError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { GitAnnotatedTag } from "../models/GitAnnotatedTag.ts"
import { readObject as readObjectInternal } from "../git/objects/readObject.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { ReadTagResult } from "../models/GitAnnotatedTag.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Read an annotated tag object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.oid - The SHA-1 object id to get
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<ReadTagResult>} Resolves successfully with a git object description
 * @see ReadTagResult
 * @see TagObject
 *
 */
export type ReadTagOptions = BaseCommandOptions & {
  oid: string
}

export async function readTag({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  oid,
  cache = {},
}: ReadTagOptions): Promise<ReadTagResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      oid,
    })

    assertParameter('oid', oid)

    const { type, object } = await readObjectInternal({
      fs,
      cache,
      gitdir: effectiveGitdir,
      oid,
      format: 'content',
    })
    if (type !== 'tag') {
      throw new ObjectTypeError(oid, type as 'blob' | 'commit' | 'tag' | 'tree', 'tag')
    }
    const tag = GitAnnotatedTag.from(object)
    const result: ReadTagResult = {
      oid,
      tag: tag.parse(),
      payload: tag.payload(),
    }
    return result
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.readTag'
    throw err
  }
}

