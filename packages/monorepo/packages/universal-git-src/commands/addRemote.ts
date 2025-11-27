import cleanGitRef from 'clean-git-ref'

import { AlreadyExistsError } from '../errors/AlreadyExistsError.ts'
import { InvalidRefNameError } from '../errors/InvalidRefNameError.ts'
import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import validRef from "../utils/isValidRef.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Add or update a remote repository configuration.
 * 
 * This command adds or updates a remote in `.git/config` and automatically invalidates
 * the Repository's remote backend cache to ensure `Repository.getRemote()` picks up
 * the new or updated remote URL.
 * 
 * **Repository Integration**:
 * 
 * When a `repo` parameter is provided, this command uses `Repository.getConfig()` to
 * update the config and automatically calls `repo.invalidateRemoteCache()` after adding
 * the remote. This ensures that:
 * - `Repository.getRemote(name)` will use the new URL
 * - `Repository.listRemotes()` will include the new remote
 * - The URL-indexed backend cache in `RemoteBackendRegistry` will be used for the new URL
 * 
 * **URL-Indexed Architecture**:
 * 
 * After adding a remote, the URL is stored in config and can be used to look up or create
 * a backend via `RemoteBackendRegistry.getBackend(url)`. The registry uses URL-indexed
 * caching, so multiple remotes with the same URL will share the same backend instance.
 * 
 * @param args - Command options
 * @param args.repo - Repository instance (preferred, automatically invalidates cache)
 * @param args.fs - File system client (required if `repo` not provided)
 * @param args.dir - The [working tree](dir-vs-gitdir.md) directory path (optional if `repo` provided)
 * @param args.gitdir - The [git directory](dir-vs-gitdir.md) path (optional, defaults to `join(dir, '.git')`)
 * @param args.remote - The name of the remote (required)
 * @param args.url - The URL of the remote (required)
 * @param args.force - If `true`, overwrite existing remote instead of throwing error (optional, default: `false`)
 * @param args.cache - Cache object (optional)
 * 
 * @returns Promise resolving when remote is added/updated
 * 
 * @throws AlreadyExistsError if remote already exists and `force` is `false`
 * @throws InvalidRefNameError if remote name is invalid
 * @throws MissingParameterError if required parameters are missing
 * 
 * @example
 * ```typescript
 * // Using Repository (preferred)
 * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
 * await addRemote({ repo, remote: 'origin', url: 'https://github.com/user/repo.git' })
 * 
 * // Remote cache is automatically invalidated
 * const originBackend = await repo.getRemote('origin') // Uses new URL
 * 
 * // Using fs and dir (legacy)
 * await addRemote({
 *   fs,
 *   dir: '/tutorial',
 *   remote: 'upstream',
 *   url: 'https://github.com/awesome-os/universal-git'
 * })
 * ```
 * 
 * @see {@link Repository.getRemote} For getting remote backends after adding
 * @see {@link Repository.listRemotes} For listing all remotes
 * @see {@link Repository.invalidateRemoteCache} For manual cache invalidation
 */
export async function addRemote({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  remote,
  url,
  force = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  remote: string
  url: string
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
      remote,
      url,
      force,
    })

    assertParameter('remote', remote)
    assertParameter('url', url)

    if (!validRef(remote, true)) {
      throw new InvalidRefNameError(remote, cleanGitRef.clean(remote))
    }
    
    const config = await repo.getConfig()
    
    if (!force) {
      // Check that setting it wouldn't overwrite.
      const remoteNames = await config.getSubsections('remote')
      if (remoteNames.includes(remote)) {
        // Throw an error if it would overwrite an existing remote,
        // but not if it's simply setting the same value again.
        const existingUrl = await config.get(`remote.${remote}.url`)
        if (url !== existingUrl) {
          throw new AlreadyExistsError('remote', remote)
        }
      }
    }
    await config.set(`remote.${remote}.url`, url, 'local', false)
    await config.set(
      `remote.${remote}.fetch`,
      `+refs/heads/*:refs/remotes/${remote}/*`,
      'local',
      false
    )
    
    // Invalidate remote cache since we've added/updated a remote
    // This ensures Repository.getRemote() will pick up the new URL
    repo.invalidateRemoteCache()
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.addRemote'
    throw err
  }
}

