import { GitAnnotatedTag } from "../models/GitAnnotatedTag.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { writeObject as writeObjectInternal } from "../git/objects/writeObject.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { TagObject } from "../models/GitAnnotatedTag.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Write an annotated tag object directly
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {TagObject} [args.tag] - The tag object to write (required if format is 'parsed')
 * @param {Uint8Array} [args.tagBuffer] - The raw tag buffer to write (required if format is 'content', for signed tags)
 * @param {'parsed'|'content'} [args.format='parsed'] - Format of the tag: 'parsed' for TagObject, 'content' for raw buffer
 * @param {boolean} [args.dryRun=false] - If true, compute the OID without writing to disk
 *
 * @returns {Promise<string>} Resolves successfully with the SHA-1 object id of the newly written object
 * @see TagObject
 *
 * @example
 * // Manually create an annotated tag.
 * let sha = await git.resolveRef({ fs, dir: '/tutorial', ref: 'HEAD' })
 * console.log('commit', sha)
 *
 * let oid = await git.writeTag({
 *   fs,
 *   dir: '/tutorial',
 *   tag: {
 *     object: sha,
 *     type: 'commit',
 *     tag: 'my-tag',
 *     tagger: {
 *       name: 'your name',
 *       email: 'email@example.com',
 *       timestamp: Math.floor(Date.now()/1000),
 *       timezoneOffset: new Date().getTimezoneOffset()
 *     },
 *     message: 'Optional message'
 *   }
 * })
 *
 * console.log('tag', oid)
 *
 */
export type WriteTagOptions = BaseCommandOptions & {
  tag?: TagObject
  tagBuffer?: Uint8Array
  format?: 'parsed' | 'content'
  dryRun?: boolean
}

export async function writeTag({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  tag,
  tagBuffer,
  format = 'parsed',
  dryRun = false,
  cache = {},
}: WriteTagOptions): Promise<string> {
  try {
    // Validate parameters based on format
    if (format === 'parsed') {
      assertParameter('tag', tag)
    } else {
      assertParameter('tagBuffer', tagBuffer)
    }

    // Get tag buffer - either from parsed tag or use provided buffer
    let object: Uint8Array
    if (format === 'content') {
      object = tagBuffer!
    } else {
      // Convert TagObject to buffer
      object = GitAnnotatedTag.from(tag!).toObject()
    }

    // If repo is provided, use gitBackend.writeObject() directly (works without fs)
    if (_repo) {
      const oid = await _repo.gitBackend.writeObject(
        'tag',
        UniversalBuffer.from(object),
        'content',
        undefined, // oid
        dryRun,
        _repo.cache
      )
      return oid
    } else {
      // Fall back to normalizeCommandArgs and writeObjectInternal when only fs is provided
      // This path requires fs since we don't have a backend
      if (!_fs) {
        throw new MissingParameterError('fs (filesystem is required when repo is not provided)')
      }
      const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
        repo: _repo,
        fs: _fs,
        dir,
        gitdir,
        cache,
        tag,
        tagBuffer,
        format,
        dryRun,
      })

      const oid = await writeObjectInternal({
        fs,
        gitdir: effectiveGitdir,
        type: 'tag',
        object,
        format: 'content',
        dryRun,
      })
      return oid
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.writeTag'
    throw err
  }
}

