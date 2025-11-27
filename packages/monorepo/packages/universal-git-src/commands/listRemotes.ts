import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * List all configured remotes with their URLs.
 * 
 * This command reads all remotes from `.git/config` and returns their names and URLs.
 * It uses `Repository.listRemotes()` which creates `GitRemoteBackend` instances from
 * the remote registry in URL-only mode, allowing it to work without requiring protocol-
 * specific clients (http, ssh, tcp).
 * 
 * **Backend Registry Integration**:
 * 
 * The command leverages the `RemoteBackendRegistry` to create backend instances for
 * each configured remote. Each backend is created with `urlOnly: true`, which means:
 * - Backends can be created without protocol clients
 * - Backends can call `getUrl()` to retrieve the remote URL
 * - Backends cannot perform actual Git operations (discover/connect) without clients
 * 
 * The registry automatically detects the protocol from each remote URL:
 * - HTTP/HTTPS URLs → `GitRemoteHttp` backend
 * - SSH URLs (ssh:// or git@host:path) → `GitRemoteSSH` backend
 * - Git daemon URLs (git://) → `GitRemoteDaemon` backend
 * 
 * **Repository Integration**:
 * 
 * When a `repo` parameter is provided, this command uses `Repository.listRemotes()`,
 * which provides unified remote backend management and caching. The Repository class
 * caches backend instances per remote name, so subsequent operations on the same remote
 * reuse the cached backend.
 * 
 * @param args - Command options
 * @param args.repo - Repository instance (preferred, uses backend registry)
 * @param args.fs - File system client (required if `repo` not provided)
 * @param args.dir - The [working tree](dir-vs-gitdir.md) directory path (optional if `repo` provided)
 * @param args.gitdir - The [git directory](dir-vs-gitdir.md) path (optional, defaults to `join(dir, '.git')`)
 * @param args.cache - Cache object (optional)
 * 
 * @returns Promise resolving to an array of remote objects, each containing:
 *   - `remote`: The remote name (e.g., 'origin', 'upstream')
 *   - `url`: The full remote URL as configured in `.git/config`
 * 
 * @example
 * ```typescript
 * // Using Repository (preferred)
 * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
 * const remotes = await listRemotes({ repo })
 * // Returns: [
 * //   { remote: 'origin', url: 'https://github.com/user/repo.git' },
 * //   { remote: 'upstream', url: 'git@github.com:upstream/repo.git' }
 * // ]
 * 
 * // Using fs and dir (legacy)
 * const remotes = await listRemotes({ fs, dir: '/path/to/repo' })
 * for (const { remote, url } of remotes) {
 *   console.log(`${remote}: ${url}`)
 * }
 * ```
 * 
 * @see {@link Repository.listRemotes} For the underlying implementation
 * @see {@link Repository.getRemote} For getting a single remote with full functionality
 * @see {@link GitRemoteBackend.getUrl} For how URLs are retrieved from backends
 */
export async function listRemotes({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  cache = {},
}: BaseCommandOptions): Promise<Array<{ remote: string; url: string }>> {
  try {
    const { repo } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
    })

    // Use Repository.listRemotes() to get remotes with backends from registry
    // This creates backends in URL-only mode (urlOnly: true), so no protocol
    // clients (http, ssh, tcp) are required just to list remotes
    const remotes = await repo.listRemotes()
    
    // Extract remote names and URLs from backend instances
    // Each backend's getUrl() method returns the full remote URL
    return remotes.map(({ name, backend }) => ({
      remote: name || '',
      url: backend.getUrl(),
    }))
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.listRemotes'
    throw err
  }
}

/**
 * Internal listRemotes implementation
 * @internal - Exported for use by other commands
 */
export async function _listRemotes({
  repo: _repo,
  fs: _fs,
  gitdir: _gitdir,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  gitdir?: string
}): Promise<Array<{ remote: string; url: string | undefined }>> {
  // Use normalizeCommandArgs for consistency
  const { repo } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitdir: _gitdir,
    cache: {},
  })

  const config = await repo.getConfig()
  const remoteNames = await config.getSubsections('remote')
  const remotes = await Promise.all(
    remoteNames.map(async remote => {
      const url = await config.get(`remote.${remote}.url`)
      return { remote: remote || '', url: url as string | undefined }
    })
  )
  return remotes.filter(r => r.remote !== '')
}
