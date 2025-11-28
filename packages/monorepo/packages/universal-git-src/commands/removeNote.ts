import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { _commit } from "./commit.ts"
import { readTree } from "./readTree.ts"
import { writeTree } from "./writeTree.ts"
import { NotFoundError } from '../errors/NotFoundError.ts'
import { resolveRef } from "../git/refs/readRef.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { normalizeAuthorObject } from "../utils/normalizeAuthorObject.ts"
import { normalizeCommitterObject } from "../utils/normalizeCommitterObject.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { Repository } from "../core-utils/Repository.ts"
import { MissingNameError } from "../errors/MissingNameError.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { SignCallback } from "../core-utils/Signing.ts"
import type { Author } from "../models/GitCommit.ts"

/**
 * Remove an object note
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {SignCallback} [args.onSign] - a PGP signing implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} [args.ref] - The notes ref to look under
 * @param {string} args.oid - The SHA-1 object id of the object to remove the note from.
 * @param {Object} [args.author] - The details about the author.
 * @param {string} [args.author.name] - Default is `user.name` config.
 * @param {string} [args.author.email] - Default is `user.email` config.
 * @param {number} [args.author.timestamp=Math.floor(Date.now()/1000)] - Set the author timestamp field. This is the integer number of seconds since the Unix epoch (1970-01-01 00:00:00).
 * @param {number} [args.author.timezoneOffset] - Set the author timezone offset field. This is the difference, in minutes, from the current timezone to UTC. Default is `(new Date()).getTimezoneOffset()`.
 * @param {Object} [args.committer = author] - The details about the note committer, in the same format as the author parameter. If not specified, the author details are used.
 * @param {string} [args.committer.name] - Default is `user.name` config.
 * @param {string} [args.committer.email] - Default is `user.email` config.
 * @param {number} [args.committer.timestamp=Math.floor(Date.now()/1000)] - Set the committer timestamp field. This is the integer number of seconds since the Unix epoch (1970-01-01 00:00:00).
 * @param {number} [args.committer.timezoneOffset] - Set the committer timezone offset field. This is the difference, in minutes, from the current timezone to UTC. Default is `(new Date()).getTimezoneOffset()`.
 * @param {string} [args.signingKey] - Sign the tag object using this private PGP key.
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<string>} Resolves successfully with the SHA-1 object id of the commit object for the note removal.
 */
export async function removeNote({
  repo: _repo,
  fs: _fs,
  onSign,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref = 'refs/notes/commits',
  oid,
  author: _author,
  committer: _committer,
  signingKey,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  onSign?: SignCallback
  dir?: string
  gitdir?: string
  ref?: string
  oid: string
  author?: Partial<Author>
  committer?: Partial<Author>
  signingKey?: string
  cache?: Record<string, unknown>
}): Promise<string> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      onSign,
      ref,
      oid,
      author: _author,
      committer: _committer,
      signingKey,
    })

    assertParameter('oid', oid)

    const author = await normalizeAuthorObject({ repo, author: _author })
    if (!author) throw new MissingNameError('author')

    const committer = await normalizeCommitterObject({
      repo,
      author,
      committer: _committer,
    })
    if (!committer) throw new MissingNameError('committer')

    return await _removeNote({
      fs,
      cache: effectiveCache,
      onSign,
      gitdir: effectiveGitdir,
      ref,
      oid,
      author,
      committer,
      signingKey,
      repo, // Pass Repository instance
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.removeNote'
    throw err
  }
}

/**
 * Internal removeNote implementation
 * @internal - Exported for use by other commands
 */
export async function _removeNote({
  fs,
  cache,
  onSign,
  gitdir,
  ref = 'refs/notes/commits',
  oid,
  author,
  committer,
  signingKey,
  repo,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  onSign?: SignCallback
  gitdir: string
  ref?: string
  oid: string
  author: Author
  committer: Author
  signingKey?: string
  repo: Repository
}): Promise<string> {
  // Get the current note commit
  let parent: string | undefined
  try {
    parent = await resolveRef({ fs, gitdir, ref })
  } catch (err) {
    if (!(err instanceof NotFoundError)) {
      throw err
    }
  }

  // I'm using the "empty tree" magic number here for brevity
  const result = await readTree({
    repo,
    oid: parent || '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  })
  let tree = result.tree

  // Remove the note blob entry from the tree
  tree = tree.filter(entry => entry.path !== oid)

  // Create the new note tree
  const treeOid = await writeTree({
    fs,
    cache,
    gitdir,
    tree,
  })

  // Create the new note commit
  const commitOid = await _commit({
    fs,
    cache,
    onSign,
    gitdir,
    ref,
    tree: treeOid,
    parent: parent ? [parent] : undefined,
    message: `Note removed by 'universal-git removeNote'\n`,
    author,
    committer,
    signingKey,
    repo, // Pass Repository instance
  })

  return commitOid
}

