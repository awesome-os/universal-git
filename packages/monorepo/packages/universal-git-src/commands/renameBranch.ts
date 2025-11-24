import cleanGitRef from 'clean-git-ref'

import { _currentBranch } from "./currentBranch.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { AlreadyExistsError } from '../errors/AlreadyExistsError.ts'
import { InvalidRefNameError } from '../errors/InvalidRefNameError.ts'
import { resolveRef } from "../git/refs/readRef.ts"
import { writeRef, writeSymbolicRef } from "../git/refs/writeRef.ts"
import { deleteRefs } from "../git/refs/deleteRef.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import validRef from "../utils/isValidRef.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Rename a branch
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - What to name the branch
 * @param {string} args.oldref - What the name of the branch was
 * @param {boolean} [args.checkout = false] - Update `HEAD` to point at the newly created branch
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.renameBranch({ fs, dir: '/tutorial', ref: 'main', oldref: 'master' })
 * console.log('done')
 *
 */
export type RenameBranchOptions = BaseCommandOptions & {
  ref: string
  oldref: string
  checkout?: boolean
}

export async function renameBranch({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  oldref,
  checkout = false,
}: RenameBranchOptions): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: {},
      ref,
      oldref,
      checkout,
    })

    assertParameter('ref', ref)
    assertParameter('oldref', oldref)
    return await _renameBranch({
      repo,
      fs,
      gitdir: effectiveGitdir,
      ref,
      oldref,
      checkout,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.renameBranch'
    throw err
  }
}

/**
 * Rename a branch
 *
 * @param {object} args
 * @param {import('../types.ts').FileSystemProvider} args.fs
 * @param {string} args.gitdir
 * @param {string} args.ref - The name of the new branch
 * @param {string} args.oldref - The name of the old branch
 * @param {boolean} [args.checkout = false]
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 */
export async function _renameBranch({
  repo: _repo,
  fs: _fs,
  gitdir: _gitdir,
  oldref,
  ref,
  checkout = false,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  gitdir?: string
  oldref: string
  ref: string
  checkout?: boolean
}): Promise<void> {
  // Use normalizeCommandArgs for consistency
  const { repo, fs, gitdir } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitdir: _gitdir,
    cache: {},
    oldref,
    ref,
    checkout,
  })
  if (!validRef(ref, true)) {
    throw new InvalidRefNameError(ref, cleanGitRef.clean(ref))
  }

  if (!validRef(oldref, true)) {
    throw new InvalidRefNameError(oldref, cleanGitRef.clean(oldref))
  }

  const fulloldref = `refs/heads/${oldref}`
  const fullnewref = `refs/heads/${ref}`

  // Check if new branch already exists
  try {
    await resolveRef({ fs, gitdir, ref: fullnewref })
    throw new AlreadyExistsError('branch', ref, false)
  } catch (err) {
    if (err instanceof AlreadyExistsError) throw err
    // NotFoundError means branch doesn't exist, which is fine
    if (!(err instanceof NotFoundError)) throw err
  }

  const value = await resolveRef({
    fs,
    gitdir,
    ref: fulloldref,
    depth: 1,
  })

  await writeRef({ fs, gitdir, ref: fullnewref, value })
  await deleteRefs({ fs, gitdir, refs: [fulloldref] })

  const fullCurrentBranchRef = await _currentBranch({
    fs,
    gitdir,
    fullname: true,
  })
  const isCurrentBranch = fullCurrentBranchRef === fulloldref

  if (checkout || isCurrentBranch) {
    // Update HEAD
    await writeSymbolicRef({
      fs,
      gitdir,
      ref: 'HEAD',
      value: fullnewref,
    })
  }
}

