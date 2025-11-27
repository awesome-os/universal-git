import { GitRemoteHTTP } from "../git/remote/GitRemoteHTTP.ts"
import { GitRemoteDaemon } from "../git/remote/GitRemoteDaemon.ts"
import { RemoteBackendRegistry } from "../git/remote/RemoteBackendRegistry.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { formatInfoRefs } from "../utils/formatInfoRefs.ts"
import type { Repository } from "../core-utils/Repository.ts"
import type {
  HttpClient,
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
  GitAuth,
  SshClient,
} from "../git/remote/types.ts"
import type { GitRemoteBackend } from "../git/remote/GitRemoteBackend.ts"
import type { ServerRef } from "../git/refs/types.ts"
import type { TcpClient, TcpProgressCallback } from "../daemon/TcpClient.ts"

/**
 * This object has the following schema:
 */
export type GetRemoteInfoResult = {
  /** Git protocol version the server supports */
  protocolVersion: 1 | 2
  /** An object of capabilities represented as keys and values */
  capabilities: Record<string, string | true>
  /** Server refs (they get returned by protocol version 1 whether you want them or not) */
  refs?: ServerRef[]
}

/**
 * List a remote server's capabilities.
 *
 * This is a rare command that doesn't require an `fs`, `dir`, or even `gitdir` argument.
 * It just communicates to a remote git server, determining what protocol version, commands, and features it supports.
 *
 * The return type depends on the protocol version:
 * - v1 capabilities (and refs) or
 * - v2 capabilities (and no refs)
 *
 * If you just care about refs, use [`listServerRefs`](./listServerRefs.md)
 *
 * @param {object} args
 * @param {Repository} [args.repo] - Optional repository instance. If provided, uses repo.gitBackend.getRemoteInfo()
 * @param {GitRemoteBackend} [args.remoteBackend] - Optional remote backend instance. If not provided, will be auto-detected from URL.
 * @param {HttpClient} [args.http] - HTTP client (required for HTTP/HTTPS URLs if remoteBackend not provided)
 * @param {TcpClient} [args.tcp] - TCP client (required for git:// URLs if remoteBackend not provided)
 * @param {SshClient} [args.ssh] - SSH client (required for SSH URLs if remoteBackend not provided)
 * @param {AuthCallback} [args.onAuth] - optional auth fill callback
 * @param {AuthFailureCallback} [args.onAuthFailure] - optional auth rejected callback
 * @param {AuthSuccessCallback} [args.onAuthSuccess] - optional auth approved callback
 * @param {string} args.url - The URL of the remote repository. Will be gotten from gitconfig if absent.
 * @param {string} [args.corsProxy] - Optional [CORS proxy](https://www.npmjs.com/%40universal-git/cors-proxy). Overrides value in repo config.
 * @param {boolean} [args.forPush = false] - By default, the command queries the 'fetch' capabilities. If true, it will ask for the 'push' capabilities.
 * @param {Object<string, string>} [args.headers] - Additional headers to include in HTTP requests, similar to git's `extraHeader` config
 * @param {1 | 2} [args.protocolVersion = 2] - Which version of the Git Protocol to use.
 *
 * @returns {Promise<GetRemoteInfoResult>} Resolves successfully with an object listing the capabilities of the remote.
 * @see GetRemoteInfoResult
 * @see ServerRef
 *
 * @example
 * let info = await git.getRemoteInfo({
 *   http,
 *   corsProxy: "https://cors.universal-git.org",
 *   url: "https://github.com/awesome-os/universal-git.git"
 * });
 * console.log(info);
 *
 */
export async function getRemoteInfo({
  repo,
  remoteBackend,
  http,
  tcp,
  ssh,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  onProgress,
  corsProxy,
  url,
  headers = {},
  forPush = false,
  protocolVersion = 2,
}: {
  repo?: Repository // Optional: use repo.gitBackend.getRemoteInfo() if provided
  remoteBackend?: GitRemoteBackend // Optional: use provided backend or auto-detect
  http?: HttpClient // Required for HTTP/HTTPS URLs if remoteBackend not provided
  tcp?: TcpClient // Required for git:// URLs if remoteBackend not provided
  ssh?: SshClient // Required for SSH URLs if remoteBackend not provided
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  onProgress?: TcpProgressCallback | import('../git/remote/types.ts').ProgressCallback | import('../ssh/SshClient.ts').SshProgressCallback
  corsProxy?: string
  url: string
  headers?: Record<string, string>
  forPush?: boolean
  protocolVersion?: 1 | 2
}): Promise<GetRemoteInfoResult> {
  try {
    assertParameter('url', url)

    // If repo is provided, use GitBackend method
    if (repo?.gitBackend) {
      return repo.gitBackend.getRemoteInfo(url, {
        http,
        ssh,
        tcp,
        onAuth,
        onAuthSuccess,
        onAuthFailure,
        onProgress,
        corsProxy,
        headers,
        forPush,
        protocolVersion,
      })
    }

    // Use provided backend or auto-detect from URL
    let backend: GitRemoteBackend
    if (remoteBackend) {
      backend = remoteBackend
    } else {
      // Auto-detect backend from URL using registry
      backend = RemoteBackendRegistry.getBackend({
        url,
        http,
        tcp,
        ssh,
        useRestApi: false, // getRemoteInfo only uses Git protocol, not REST API
      })
    }

    // Call backend.discover() with protocol-agnostic options
    const remote = await backend.discover({
      service: forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      protocolVersion,
      onProgress,
      // HTTP-specific options
      http,
      headers,
      corsProxy,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      // SSH-specific options
      ssh,
      // TCP/Daemon-specific options
      tcp,
    })

    // Convert RemoteDiscoverResult to GetRemoteInfoResult format
    if (remote.protocolVersion === 2) {
      return {
        protocolVersion: 2,
        capabilities: remote.capabilities2,
      }
    }

    // Protocol version 1: convert Set to object and format refs
    const capabilities: Record<string, string | true> = {}
    for (const cap of remote.capabilities) {
      const [key, value] = cap.split('=')
      if (value) {
        capabilities[key] = value
      } else {
        capabilities[key] = true
      }
    }

    return {
      protocolVersion: 1,
      capabilities,
      refs: formatInfoRefs({ refs: remote.refs, symrefs: remote.symrefs }, '', true, true),
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.getRemoteInfo'
    throw err
  }
}



