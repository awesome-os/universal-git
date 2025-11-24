import cleanGitRef from 'clean-git-ref'

import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { AlreadyExistsError } from "../errors/AlreadyExistsError.ts"
import { InvalidRefNameError } from "../errors/InvalidRefNameError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { resolveRef as resolveRefDirect } from "../git/refs/readRef.ts"
import { writeRef as writeRefDirect, writeSymbolicRef as writeSymbolicRefDirect } from "../git/refs/writeRef.ts"
import { Repository } from "../core-utils/Repository.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import validRef from "../utils/isValidRef.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithRefOptions } from "../types/commandOptions.ts"

/**
 * Write a ref which refers to the specified SHA-1 object id, or a symbolic ref which refers to the specified ref.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - The name of the ref to write
 * @param {string} args.value - When `symbolic` is false, a ref or an SHA-1 object id. When true, a ref starting with `refs/`.
 * @param {boolean} [args.force = false] - Instead of throwing an error if a ref named `ref` already exists, overwrite the existing ref.
 * @param {boolean} [args.symbolic = false] - Whether the ref is symbolic or not.
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.writeRef({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'refs/heads/another-branch',
 *   value: 'HEAD'
 * })
 * await git.writeRef({
 *   fs,
 *   dir: '/tutorial',
 *   ref: 'HEAD',
 *   value: 'refs/heads/another-branch',
 *   force: true,
 *   symbolic: true
 * })
 * console.log('done')
 *
 */
export type WriteRefOptions = CommandWithRefOptions & {
  value: string
  force?: boolean
  symbolic?: boolean
  oldOid?: string
}

export async function writeRef({
  repo: _repo,
  fs: _fs,
  dir,
      gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  value,
  force = false,
  symbolic = false,
  oldOid,
}: WriteRefOptions): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: {},
      ref,
      value,
      force,
      symbolic,
      oldOid,
    })

    assertParameter('ref', ref)
    assertParameter('value', value)

    if (!validRef(ref, true)) {
      throw new InvalidRefNameError(ref, cleanGitRef.clean(ref))
    }

    if (!force) {
      try {
        await resolveRefDirect({ fs, gitdir: effectiveGitdir, ref })
        // Determine the type of ref for the error message
        let refType: 'tag' | 'branch' | 'remote' | 'note' = 'branch'
        if (ref.startsWith('refs/tags/')) {
          refType = 'tag'
        } else if (ref.startsWith('refs/remotes/')) {
          refType = 'remote'
        } else if (ref.startsWith('refs/notes/')) {
          refType = 'note'
        }
        throw new AlreadyExistsError(refType, ref)
      } catch (err) {
        if (err instanceof AlreadyExistsError) throw err
        // NotFoundError means ref doesn't exist, which is fine
        if (!(err instanceof NotFoundError)) throw err
      }
    }

    if (symbolic) {
      await writeSymbolicRefDirect({
        fs,
        gitdir: effectiveGitdir,
        ref,
        value,
        oldOid,
      })
    } else {
      const resolvedValue = await resolveRefDirect({
        fs,
        gitdir: effectiveGitdir,
        ref: value,
      })
      await writeRefDirect({
        fs,
        gitdir: effectiveGitdir,
        ref,
        value: resolvedValue,
      })
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.writeRef'
    throw err
  }
}

