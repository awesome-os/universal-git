import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { AlreadyExistsError } from '../errors/AlreadyExistsError.ts'
import { RefManager } from "../core-utils/refs/RefManager.ts"
import { readObject } from "../git/objects/readObject.ts"
import { writeTag } from "./writeTag.ts"
import { parse as parseTag, serialize as serializeTag } from "../core-utils/parsers/Tag.ts"
import { signTag, extractSignature } from "../core-utils/Signing.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { normalizeAuthorObject } from "../utils/normalizeAuthorObject.ts"
import { Repository } from "../core-utils/Repository.ts"
import { MissingNameError } from "../errors/MissingNameError.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { SignCallback } from "../core-utils/Signing.ts"
import type { Author } from "../models/GitCommit.ts"
import type { TagObject } from "../models/GitAnnotatedTag.ts"

/**
 * Create an annotated tag.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {SignCallback} [args.onSign] - a PGP signing implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - What to name the tag
 * @param {string} [args.message = ref] - The tag message to use.
 * @param {string} [args.object = 'HEAD'] - The SHA-1 object id the tag points to. (Will resolve to a SHA-1 object id if value is a ref.) By default, the commit object which is referred by the current `HEAD` is used.
 * @param {object} [args.tagger] - The details about the tagger.
 * @param {string} [args.tagger.name] - Default is `user.name` config.
 * @param {string} [args.tagger.email] - Default is `user.email` config.
 * @param {number} [args.tagger.timestamp=Math.floor(Date.now()/1000)] - Set the tagger timestamp field. This is the integer number of seconds since the Unix epoch (1970-01-01 00:00:00).
 * @param {number} [args.tagger.timezoneOffset] - Set the tagger timezone offset field. This is the difference, in minutes, from the current timezone to UTC. Default is `(new Date()).getTimezoneOffset()`.
 * @param {string} [args.gpgsig] - The gpgsig attached to the tag object. (Mutually exclusive with the `signingKey` option.)
 * @param {string} [args.signingKey] - Sign the tag object using this private PGP key. (Mutually exclusive with the `gpgsig` option.)
 * @param {boolean} [args.force = false] - Instead of throwing an error if a tag named `ref` already exists, overwrite the existing tag. Note that this option does not modify the original tag object itself.
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.annotatedTag({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'test-tag',
 *   message: 'This commit is awesome',
 *   tagger: {
 *     name: 'Mr. Test',
 *     email: 'mrtest@example.com'
 *   }
 * })
 * console.log('done')
 *
 */
export async function annotatedTag({
  repo: _repo,
  fs: _fs,
  onSign,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  tagger: _tagger,
  message = ref,
  gpgsig,
  object,
  signingKey,
  force = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  onSign?: SignCallback
  dir?: string
  gitdir?: string
  ref: string
  tagger?: Partial<Author>
  message?: string
  gpgsig?: string
  object?: string
  signingKey?: string
  force?: boolean
  cache?: Record<string, unknown>
}): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      onSign,
      ref,
      tagger: _tagger,
      message,
      gpgsig,
      object,
      signingKey,
      force,
    })

    assertParameter('ref', ref)
    if (signingKey) {
      assertParameter('onSign', onSign)
    }

    // Fill in missing arguments with default values
    const tagger = await normalizeAuthorObject({ repo, author: _tagger })
    if (!tagger) throw new MissingNameError('tagger')

    return await _annotatedTag({
      fs: fs as any,
      cache,
      onSign,
      gitdir: effectiveGitdir,
      ref,
      tagger,
      message,
      gpgsig,
      object,
      signingKey,
      force,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.annotatedTag'
    throw err
  }
}

/**
 * Internal annotatedTag implementation
 * @internal - Exported for use by other commands
 */
export async function _annotatedTag({
  fs,
  cache,
  onSign,
  gitdir,
  ref,
  tagger,
  message = ref,
  gpgsig,
  object,
  signingKey,
  force = false,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  onSign?: SignCallback
  gitdir: string
  ref: string
  tagger: Author
  message?: string
  gpgsig?: string
  object?: string
  signingKey?: string
  force?: boolean
}): Promise<void> {
  ref = ref.startsWith('refs/tags/') ? ref : `refs/tags/${ref}`

  if (!force) {
    try {
      await RefManager.resolve({ fs, gitdir, ref })
      // Tag exists
      throw new AlreadyExistsError('tag', ref)
    } catch (e) {
      if (e instanceof AlreadyExistsError) throw e
      // Tag doesn't exist, that's fine
    }
  }

  // Resolve passed value
  const oid = await RefManager.resolve({
    fs,
    gitdir,
    ref: object || 'HEAD',
  })

  // Get object type
  const { object: objContent } = await readObject({ fs, cache, gitdir, oid })
  // Determine type from object (simplified - would need to check object header)
  const type = 'commit' // Default assumption, would need proper detection

  // Create tag object
  let tagObject: TagObject = {
    object: oid,
    type,
    tag: ref.replace('refs/tags/', ''),
    tagger: {
      name: tagger.name,
      email: tagger.email,
      timestamp: tagger.timestamp,
      timezoneOffset: tagger.timezoneOffset,
    },
    message,
    ...(gpgsig ? { gpgsig } : {}),
  }
  
  // Sign if requested
  if (signingKey && onSign) {
    // Serialize the tag and use GitAnnotatedTag to sign it
    // This ensures we use the exact same payload logic as when reading
    const { GitAnnotatedTag } = await import('../models/GitAnnotatedTag.ts')
    const tagBuffer = serializeTag(tagObject)
    const tagString = tagBuffer.toString('utf8')
    const tag = GitAnnotatedTag.from(tagString)
    
    // Sign using GitAnnotatedTag.sign() which uses tag.payload() - the same function used when reading
    const signedTag = await GitAnnotatedTag.sign(tag, onSign, signingKey)
    
    // Write the signed tag's raw content directly (without re-serializing)
    // This ensures the format matches exactly what we'll read back
    const signedTagBuffer = signedTag.toObject()
    const value = await writeTag({
      fs,
      gitdir,
      tagBuffer: signedTagBuffer,
      format: 'content',
    })

    await RefManager.writeRef({ fs, gitdir, ref, value })
    return
  }
  
  // Write tag object (unsigned) using writeTag
  const value = await writeTag({
    fs,
    gitdir,
    tag: tagObject,
  })

  await RefManager.writeRef({ fs, gitdir, ref, value })
}

