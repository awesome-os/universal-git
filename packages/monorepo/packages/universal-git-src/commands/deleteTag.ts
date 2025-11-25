import { deleteRefs } from "../git/refs/deleteRef.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Delete a local tag ref
 *
 * @param {Object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - The tag to delete
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.deleteTag({ fs, dir: '/tutorial', ref: 'test-tag' })
 * console.log('done')
 *
 */
export async function deleteTag({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
}: BaseCommandOptions & { ref?: string }): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: {},
      ref: ref as string | undefined,
    })

    assertParameter('ref', ref)
    // After assertParameter, ref is guaranteed to be a string (not undefined)
    if (!ref) {
      throw new MissingParameterError('ref')
    }
    return await _deleteTag({
      repo,
      fs: fs as any,
      gitdir: effectiveGitdir,
      ref,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.deleteTag'
    throw err
  }
}

/**
 * Delete a local tag ref
 *
 * @param {Object} args
 * @param {import('../types.ts').FileSystemProvider} args.fs
 * @param {string} args.gitdir
 * @param {string} args.ref - The tag to delete
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.deleteTag({ dir: '$input((/))', ref: '$input((test-tag))' })
 * console.log('done')
 *
 */
export async function _deleteTag({ 
  repo: _repo,
  fs: _fs, 
  gitdir: _gitdir, 
  ref 
}: { 
  repo?: Repository
  fs?: FileSystemProvider
  gitdir?: string
  ref: string 
}): Promise<void> {
  // Use normalizeCommandArgs for consistency
  const { repo, fs, gitdir } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitdir: _gitdir,
    cache: {},
    ref,
  })

  ref = ref.startsWith('refs/tags/') ? ref : `refs/tags/${ref}`
  
  // Read old tag OID for reflog before deleting
  let oldTagOid: string | undefined
  try {
    const { resolveRef } = await import('../git/refs/readRef.ts')
    oldTagOid = await resolveRef({ fs, gitdir, ref })
  } catch {
    // Tag doesn't exist, that's fine
    oldTagOid = undefined
  }
  
  await deleteRefs({ fs, gitdir, refs: [ref] })
  
  // Add descriptive reflog entry for tag deletion
  // Note: Tags don't typically have reflog in Git, but we'll add it for consistency
  if (oldTagOid) {
      const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
      const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
      const tagName = ref.replace('refs/tags/', '')
      await logRefUpdate({
        fs,
        gitdir,
        ref,
        oldOid: oldTagOid,
        newOid: '0000000000000000000000000000000000000000', // Zero OID for deletion
        message: REFLOG_MESSAGES.TAG_DELETE(tagName),
    }).catch(() => {
      // Silently ignore reflog errors (Git's behavior)
      // Tags may not have reflog enabled by default
    })
  }
}

