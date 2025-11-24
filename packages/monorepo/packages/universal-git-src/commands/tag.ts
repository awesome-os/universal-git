import { AlreadyExistsError } from "../errors/AlreadyExistsError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { RefManager } from "../core-utils/refs/RefManager.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithRefOptions } from "../types/commandOptions.ts"

/**
 * Create a lightweight tag
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - What to name the tag
 * @param {string} [args.object = 'HEAD'] - What oid the tag refers to. (Will resolve to oid if value is a ref.) By default, the commit object which is referred by the current `HEAD` is used.
 * @param {boolean} [args.force = false] - Instead of throwing an error if a tag named `ref` already exists, overwrite the existing tag.
 *
 * @returns {Promise<void>} Resolves successfully when filesystem operations are complete
 *
 * @example
 * await git.tag({ fs, dir: '/tutorial', ref: 'test-tag' })
 * console.log('done')
 *
 */
export type TagOptions = CommandWithRefOptions & {
  object?: string
  force?: boolean
}

export async function tag({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  object,
  force = false,
}: TagOptions): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache: {},
      ref,
      object,
      force,
    })

    assertParameter('ref', ref)

    ref = ref.startsWith('refs/tags/') ? ref : `refs/tags/${ref}`

    // Resolve passed object
    const value = await RefManager.resolve({
      fs,
      gitdir: effectiveGitdir,
      ref: object || 'HEAD',
    })

    if (!force) {
      try {
        await RefManager.resolve({ fs, gitdir: effectiveGitdir, ref })
        // Tag exists
        throw new AlreadyExistsError('tag', ref)
      } catch (e) {
        if (e instanceof AlreadyExistsError) throw e
        // Tag doesn't exist, that's fine
      }
    }

    // Read old tag OID for reflog before updating (if tag exists)
    let oldTagOid: string | undefined
    try {
      oldTagOid = await RefManager.resolve({ fs, gitdir: effectiveGitdir, ref })
    } catch {
      // Tag doesn't exist yet, use zero OID
      oldTagOid = undefined
    }
    
    await RefManager.writeRef({ fs, gitdir: effectiveGitdir, ref, value })
    
    // Add descriptive reflog entry for tag creation/update
    // Note: Tags don't typically have reflog in Git, but we'll add it for consistency
    // Git only logs reflog for refs/heads/*, refs/remotes/*, and HEAD by default
    // However, we can still log it if core.logAllRefUpdates is enabled
    if (oldTagOid !== value || !oldTagOid) {
      const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
      const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
      const tagName = ref.replace('refs/tags/', '')
      await logRefUpdate({
        fs,
        gitdir: effectiveGitdir,
        ref,
        oldOid: oldTagOid || '0000000000000000000000000000000000000000',
        newOid: value,
        message: REFLOG_MESSAGES.TAG_CREATE(tagName),
      }).catch(() => {
        // Silently ignore reflog errors (Git's behavior)
        // Tags may not have reflog enabled by default
      })
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.tag'
    throw err
  }
}

