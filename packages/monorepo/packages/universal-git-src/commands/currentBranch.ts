// GitRefManager import removed - using src/git/refs/ functions instead
import { readSymbolicRef, resolveRef } from "../git/refs/readRef.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { abbreviateRef } from "../utils/abbreviateRef.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Get the name of the branch currently pointed to by .git/HEAD
 *
 * @param {Object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {boolean} [args.fullname = false] - Return the full path (e.g. "refs/heads/main") instead of the abbreviated form.
 * @param {boolean} [args.test = false] - If the current branch doesn't actually exist (such as right after git init) then return `undefined`.
 *
 * @returns {Promise<string|void>} The name of the current branch or undefined if the HEAD is detached.
 *
 * @example
 * // Get the current branch name
 * let branch = await git.currentBranch({
 *   fs,
 *   dir: '/tutorial',
 *   fullname: false
 * })
 * console.log(branch)
 *
 */
export type CurrentBranchOptions = BaseCommandOptions & {
  fullname?: boolean
  test?: boolean
}

export async function currentBranch({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  fullname = false,
  test = false,
}: CurrentBranchOptions): Promise<string | undefined> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: {},
      fullname,
      test,
    })

    const result = await _currentBranch({
      fs: fs as any,
      gitdir: effectiveGitdir,
      fullname,
      test,
    })
    return result === undefined ? undefined : result
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.currentBranch'
    throw err
  }
}

/**
 * Get the current branch name
 */
export async function _currentBranch({
  fs,
  gitdir,
  fullname = false,
  test = false,
}: {
  fs: FileSystemProvider
  gitdir: string
  fullname?: boolean
  test?: boolean
}): Promise<string | undefined> {
  // Guard against undefined fs
  if (!fs) {
    throw new Error('_currentBranch: fs parameter is required but was undefined')
  }

  // First, try to read HEAD as a symbolic ref
  // This will return the target (e.g., 'refs/heads/master') if HEAD is symbolic
  let ref: string | null = await readSymbolicRef({ fs, gitdir, ref: 'HEAD' })
  
  // If HEAD is not symbolic (detached HEAD), try to resolve it to an OID
  // If it resolves to an OID, we're in detached HEAD state
  if (!ref) {
    try {
      const oid = await resolveRef({ fs, gitdir, ref: 'HEAD', depth: 1 })
      // If we got an OID, HEAD is detached - return undefined
      if (oid && /^[0-9a-f]{40}$/.test(oid)) {
        return undefined
      }
    } catch {
      // HEAD doesn't exist - return undefined (no branch)
      return undefined
    }
    return undefined
  }
  
  // If test is true, verify the ref actually exists
  if (test) {
    try {
      await resolveRef({ fs, gitdir, ref })
    } catch (_) {
      return undefined
    }
  }
  
  // Return `undefined` for detached HEAD (ref doesn't start with 'refs/')
  if (!ref.startsWith('refs/')) return undefined
  
  return fullname ? ref : abbreviateRef(ref)
}

