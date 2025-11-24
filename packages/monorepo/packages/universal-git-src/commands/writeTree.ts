import { GitTree } from "../models/GitTree.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { writeObject as writeObjectInternal } from "../git/objects/writeObject.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { detectObjectFormat, type ObjectFormat } from "../utils/detectObjectFormat.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { TreeObject } from "../models/GitTree.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Write a tree object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {TreeObject} args.tree - The object to write
 * @param {'sha1'|'sha256'} [args.objectFormat] - Object format ('sha1' or 'sha256'), will detect if not provided
 * @param {boolean} [args.dryRun=false] - If true, compute the OID without writing to disk
 *
 * @returns {Promise<string>} Resolves successfully with the object id of the newly written object.
 * @see TreeObject
 * @see TreeEntry
 *
 */
export type WriteTreeOptions = BaseCommandOptions & {
  tree: TreeObject
  objectFormat?: ObjectFormat
  dryRun?: boolean
}

export async function writeTree({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  tree,
  objectFormat,
  dryRun = false,
  cache = {},
}: WriteTreeOptions): Promise<string> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      tree,
      objectFormat,
      dryRun,
    })
    
    // Detect object format from repository if not provided
    let format: ObjectFormat
    if (!objectFormat) {
      format = await repo.getObjectFormat()
    } else {
      format = objectFormat
    }

    assertParameter('tree', tree)
    
    // Convert object to buffer using the correct object format
    const object = GitTree.from(tree, format).toObject()
    const oid = await writeObjectInternal({
      fs,
      gitdir: effectiveGitdir,
      type: 'tree',
      object,
      format: 'content',
      objectFormat: format,
      dryRun,
    })
    return oid
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.writeTree'
    throw err
  }
}

