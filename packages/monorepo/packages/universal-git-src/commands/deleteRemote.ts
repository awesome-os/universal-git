import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { parse as parseConfig, serialize as serializeConfig } from "../core-utils/ConfigParser.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

/**
 * Delete a remote repository configuration.
 * 
 * This command removes a remote from `.git/config` and automatically invalidates
 * the Repository's remote backend cache to ensure `Repository.getRemote()` no longer
 * returns the deleted remote.
 * 
 * **Repository Integration**:
 * 
 * When a `repo` parameter is provided, this command uses `Repository.getConfig()` to
 * check if the remote exists and automatically calls `repo.invalidateRemoteCache()`
 * after deleting the remote. This ensures that:
 * - `Repository.getRemote(name)` will throw `NotFoundError` for the deleted remote
 * - `Repository.listRemotes()` will no longer include the deleted remote
 * - The per-Repository cache is cleared, but the global URL-indexed cache in
 *   `RemoteBackendRegistry` remains (backends are shared by URL, not by remote name)
 * 
 * **URL-Indexed Architecture**:
 * 
 * Deleting a remote removes the config entry, but the backend instance in
 * `RemoteBackendRegistry` may still exist if other remotes use the same URL. The
 * registry cache is URL-indexed, so backends are shared across remotes with the
 * same URL.
 * 
 * @param args - Command options
 * @param args.repo - Repository instance (preferred, automatically invalidates cache)
 * @param args.fs - File system client (required if `repo` not provided)
 * @param args.dir - The [working tree](dir-vs-gitdir.md) directory path (optional if `repo` provided)
 * @param args.gitdir - The [git directory](dir-vs-gitdir.md) path (optional, defaults to `join(dir, '.git')`)
 * @param args.remote - The name of the remote to delete (required)
 * @param args.cache - Cache object (optional)
 * 
 * @returns Promise resolving when remote is deleted (idempotent - no error if remote doesn't exist)
 * 
 * @throws MissingParameterError if required parameters are missing
 * 
 * @example
 * ```typescript
 * // Using Repository (preferred)
 * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
 * await deleteRemote({ repo, remote: 'upstream' })
 * 
 * // Remote cache is automatically invalidated
 * try {
 *   await repo.getRemote('upstream') // Throws NotFoundError
 * } catch (err) {
 *   // Remote no longer exists
 * }
 * 
 * // Using fs and dir (legacy)
 * await deleteRemote({ fs, dir: '/tutorial', remote: 'upstream' })
 * ```
 * 
 * @see {@link Repository.getRemote} For getting remote backends
 * @see {@link Repository.listRemotes} For listing all remotes
 * @see {@link Repository.invalidateRemoteCache} For manual cache invalidation
 */
export async function deleteRemote({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  remote,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  remote: string
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
    })

    assertParameter('remote', remote)

    const config = await repo.getConfig()
    const remoteNames = await config.getSubsections('remote')
    
    if (!remoteNames.includes(remote)) {
      // Remote doesn't exist, nothing to delete
      return
    }
    
    // Delete the remote section from config
    // We need to use the low-level config parser for section deletion
    let configBuffer: UniversalBuffer = UniversalBuffer.alloc(0)
    try {
      const configData = await fs.read(join(effectiveGitdir, 'config'))
      configBuffer = configData ? UniversalBuffer.from(configData as string | Uint8Array) : UniversalBuffer.alloc(0)
    } catch (err) {
      // Config doesn't exist, nothing to delete
      return
    }
    const parsedConfig = parseConfig(configBuffer)
    parsedConfig.deleteSection('remote', remote)
    const updatedConfig = serializeConfig(parsedConfig)
    await fs.write(join(effectiveGitdir, 'config'), updatedConfig)
    
    // Invalidate remote cache since we've deleted a remote
    // This ensures Repository.getRemote() won't return a stale backend
    repo.invalidateRemoteCache()
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.deleteRemote'
    throw err
  }
}

