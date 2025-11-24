import { ObjectTypeError } from "../errors/ObjectTypeError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { GitAnnotatedTag } from "../models/GitAnnotatedTag.ts"
import { GitCommit } from "../models/GitCommit.ts"
import { GitTree } from "../models/GitTree.ts"
import { readObject as readObjectInternal } from "../git/objects/readObject.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { resolveFilepath } from "../utils/resolveFilepath.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommitObject } from "../models/GitCommit.ts"
import type { TreeObject } from "../models/GitTree.ts"
import type { TagObject } from "../models/GitAnnotatedTag.ts"
import type { BufferEncoding } from "../utils/UniversalBuffer.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Deflated object result
 */
export type DeflatedObject = {
  oid: string
  type: 'deflated'
  format: 'deflated'
  object: Uint8Array
  source?: string
}

/**
 * Wrapped object result
 */
export type WrappedObject = {
  oid: string
  type: 'wrapped'
  format: 'wrapped'
  object: Uint8Array
  source?: string
}

/**
 * Raw object result
 */
export type RawObject = {
  oid: string
  type: 'blob' | 'commit' | 'tree' | 'tag'
  format: 'content'
  object: Uint8Array
  source?: string
}

/**
 * Parsed blob object result
 */
export type ParsedBlobObject = {
  oid: string
  type: 'blob'
  format: 'parsed'
  object: string
  source?: string
}

/**
 * Parsed commit object result
 */
export type ParsedCommitObject = {
  oid: string
  type: 'commit'
  format: 'parsed'
  object: CommitObject
  source?: string
}

/**
 * Parsed tree object result
 */
export type ParsedTreeObject = {
  oid: string
  type: 'tree'
  format: 'parsed'
  object: TreeObject
  source?: string
}

/**
 * Parsed tag object result
 */
export type ParsedTagObject = {
  oid: string
  type: 'tag'
  format: 'parsed'
  object: TagObject
  source?: string
}

/**
 * Parsed object result (union type)
 */
export type ParsedObject = ParsedBlobObject | ParsedCommitObject | ParsedTreeObject | ParsedTagObject

/**
 * Read object result (union type)
 */
export type ReadObjectResult = DeflatedObject | WrappedObject | RawObject | ParsedObject

/**
 * Read a git object directly by its SHA-1 object id
 *
 * Regarding `ReadObjectResult`:
 *
 * - `oid` will be the same as the `oid` argument unless the `filepath` argument is provided, in which case it will be the oid of the tree or blob being returned.
 * - `type` of deflated objects is `'deflated'`, and `type` of wrapped objects is `'wrapped'`
 * - `format` is usually, but not always, the format you requested. Packfiles do not store each object individually compressed so if you end up reading the object from a packfile it will be returned in format 'content' even if you requested 'deflated' or 'wrapped'.
 * - `object` will be an actual Object if format is 'parsed' and the object is a commit, tree, or annotated tag. Blobs are still formatted as UniversalBuffer unless an encoding is provided in which case they'll be strings. If format is anything other than 'parsed', object will be a UniversalBuffer.
 * - `source` is the name of the packfile or loose object file where the object was found.
 *
 * The `format` parameter can have the following values:
 *
 * | param      | description                                                                                                                                                                                               |
 * | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 * | 'deflated' | Return the raw deflate-compressed buffer for an object if possible. Useful for efficiently shuffling around loose objects when you don't care about the contents and can save time by not inflating them. |
 * | 'wrapped'  | Return the inflated object buffer wrapped in the git object header if possible. This is the raw data used when calculating the SHA-1 object id of a git object.                                           |
 * | 'content'  | Return the object buffer without the git header.                                                                                                                                                          |
 * | 'parsed'   | Returns a parsed representation of the object.                                                                                                                                                            |
 *
 * The result will be in one of the following schemas:
 *
 * ## `'deflated'` format
 *
 * {@link DeflatedObject typedef}
 *
 * ## `'wrapped'` format
 *
 * {@link WrappedObject typedef}
 *
 * ## `'content'` format
 *
 * {@link RawObject typedef}
 *
 * ## `'parsed'` format
 *
 * ### parsed `'blob'` type
 *
 * {@link ParsedBlobObject typedef}
 *
 * ### parsed `'commit'` type
 *
 * {@link ParsedCommitObject typedef}
 * {@link CommitObject typedef}
 *
 * ### parsed `'tree'` type
 *
 * {@link ParsedTreeObject typedef}
 * {@link TreeObject typedef}
 * {@link TreeEntry typedef}
 *
 * ### parsed `'tag'` type
 *
 * {@link ParsedTagObject typedef}
 * {@link TagObject typedef}
 *
 * Note: If you know the type of object you are reading, you can use [`readBlob`](./readBlob.md), [`readCommit`](./readCommit.md), [`readTag`](./readTag.md), or [`readTree`](./readTree.md) for more specific types.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.oid - The SHA-1 object id to get
 * @param {'deflated' | 'wrapped' | 'content' | 'parsed'} [args.format = 'parsed'] - What format to return the object in. The choices are described in more detail below.
 * @param {string} [args.filepath] - Don't return the object with `oid` itself, but resolve `oid` to a tree and then return the object at that filepath. To return the root directory of a tree set filepath to `''`
 * @param {string} [args.encoding] - A convenience argument that only affects blobs. Instead of returning `object` as a buffer, it returns a string parsed using the given encoding.
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<ReadObjectResult>} Resolves successfully with a git object description
 * @see ReadObjectResult
 *
 * @example
 * // Given a ransom SHA-1 object id, figure out what it is
 * let { type, object } = await git.readObject({
 *   fs,
 *   dir: '/tutorial',
 *   oid: '0698a781a02264a6f37ba3ff41d78067eaf0f075'
 * })
 * switch (type) {
 *   case 'commit': {
 *     console.log(object)
 *     break
 *   }
 *   case 'tree': {
 *     console.log(object)
 *     break
 *   }
 *   case 'blob': {
 *     console.log(object)
 *     break
 *   }
 *   case 'tag': {
 *     console.log(object)
 *     break
 *   }
 * }
 *
 */
export type ReadObjectOptions = BaseCommandOptions & {
  oid: string
  format?: 'deflated' | 'wrapped' | 'content' | 'parsed'
  filepath?: string
  encoding?: string
}

export async function readObject({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  oid,
  format = 'parsed',
  filepath = undefined,
  encoding = undefined,
  cache = {},
}: ReadObjectOptions): Promise<ReadObjectResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      oid,
      format,
      filepath,
      encoding,
    })

    assertParameter('oid', oid)

    let resolvedOid = oid
    if (filepath !== undefined) {
      resolvedOid = await resolveFilepath({
        fs,
        cache,
        gitdir: effectiveGitdir,
        oid,
        filepath,
      })
    }
    // GitObjectManager does not know how to parse content, so we tweak that parameter before passing it.
    const _format = format === 'parsed' ? 'content' : format
    const result = await readObjectInternal({
      fs,
      cache,
      gitdir: effectiveGitdir,
      oid: resolvedOid,
      format: _format,
    })
    result.oid = resolvedOid
    if (format === 'parsed') {
      const objectBuffer = result.object instanceof Uint8Array ? result.object : new Uint8Array(result.object)
      switch (result.type) {
        case 'commit': {
          const parsed = GitCommit.from(UniversalBuffer.from(objectBuffer) as any).parse()
          return {
            oid: result.oid,
            type: 'commit' as const,
            format: 'parsed' as const,
            object: parsed,
            source: result.source,
          } as ParsedCommitObject
        }
        case 'tree': {
          const parsed = GitTree.from(UniversalBuffer.from(objectBuffer) as any).entries()
          return {
            oid: result.oid,
            type: 'tree' as const,
            format: 'parsed' as const,
            object: parsed,
            source: result.source,
          } as ParsedTreeObject
        }
        case 'blob':
          // Here we consider returning a raw Buffer as the 'content' format
          // and returning a string as the 'parsed' format
          if (encoding) {
            const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
            const parsed = UniversalBuffer.from(objectBuffer).toString(encoding as BufferEncoding)
            return {
              oid: result.oid,
              type: 'blob' as const,
              format: 'parsed' as const,
              object: parsed,
              source: result.source,
            } as ParsedBlobObject
          } else {
            return {
              oid: result.oid,
              type: 'blob' as const,
              format: 'content' as const,
              object: objectBuffer,
              source: result.source,
            } as RawObject
          }
        case 'tag': {
          const parsed = GitAnnotatedTag.from(UniversalBuffer.from(objectBuffer) as any).parse()
          return {
            oid: result.oid,
            type: 'tag' as const,
            format: 'parsed' as const,
            object: parsed,
            source: result.source,
          } as ParsedTagObject
        }
        default:
          throw new ObjectTypeError(
            result.oid,
            result.type as 'blob' | 'commit' | 'tag' | 'tree',
            'tree'
          )
      }
    } else if (result.format === 'deflated' || result.format === 'wrapped') {
      result.type = result.format
    }
    return result as ReadObjectResult
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.readObject'
    throw err
  }
}

