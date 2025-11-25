import { GitRemoteHTTP } from "../git/remote/GitRemoteHTTP.ts"
import { GitRemoteDaemon } from "../git/remote/GitRemoteDaemon.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { formatInfoRefs } from "../utils/formatInfoRefs.ts"
import type {
  HttpClient,
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
  GitAuth,
} from "../git/remote/types.ts"
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
 * @param {HttpClient} args.http - an HTTP client
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
  http,
  tcp,
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
  http?: HttpClient // Required if tcp is not provided
  tcp?: TcpClient // Required if http is not provided (for git:// protocol)
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  onProgress?: TcpProgressCallback // For TCP protocol
  corsProxy?: string
  url: string
  headers?: Record<string, string>
  forPush?: boolean
  protocolVersion?: 1 | 2
}): Promise<GetRemoteInfoResult> {
  try {
    // Require either http or tcp
    if (!http && !tcp) {
      const { MissingParameterError } = await import('../errors/MissingParameterError.ts')
      throw new MissingParameterError('http OR tcp')
    }
    assertParameter('url', url)

    // Determine protocol type
    const isGitDaemon = url.startsWith('git://')
    const isSsh = url.startsWith('ssh://') || (url.includes('@') && url.includes(':') && !url.startsWith('http') && !isGitDaemon)
    const isHttp = url.startsWith('http://') || url.startsWith('https://')

    // Handle git:// protocol with TCP
    if (isGitDaemon) {
      if (!tcp) {
        const { MissingParameterError } = await import('../errors/MissingParameterError.ts')
        throw new MissingParameterError('tcp')
      }
      const remote = await GitRemoteDaemon.discover({
        tcp,
        service: forPush ? 'git-receive-pack' : 'git-upload-pack',
        url,
        onProgress: onProgress as TcpProgressCallback | undefined,
        protocolVersion: protocolVersion || 1,
      })

      // Convert capabilities array to object
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
        protocolVersion: remote.protocolVersion,
        capabilities,
        refs: formatInfoRefs({ refs: remote.refs, symrefs: remote.symrefs }, '', true, true),
      }
    }

    // Handle SSH protocol
    if (isSsh) {
      const { UnknownTransportError } = await import('../errors/UnknownTransportError.ts')
      throw new UnknownTransportError(url, 'ssh', undefined)
    }

    // Handle HTTP protocol
    if (!http) {
      const { MissingParameterError } = await import('../errors/MissingParameterError.ts')
      throw new MissingParameterError('http')
    }

    const remote = await GitRemoteHTTP.discover({
      http,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      corsProxy,
      service: forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      headers,
      protocolVersion,
    }) as
      | { protocolVersion: 1; refs: Map<string, string>; symrefs: Map<string, string>; capabilities: Set<string>; auth: GitAuth }
      | { protocolVersion: 2; capabilities2: Record<string, string | true>; auth: GitAuth }

    if (remote.protocolVersion === 2) {
      return {
        protocolVersion: remote.protocolVersion,
        capabilities: remote.capabilities2,
      }
    }

    // TypeScript now knows remote is protocolVersion 1
    // Note: remote.capabilities, remote.refs, and remote.symrefs are Set and Map objects,
    // but one of the objectives of the public API is to always return JSON-compatible objects
    // so we must JSONify them.
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
      refs: formatInfoRefs(remote, '', true, true),
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.getRemoteInfo'
    throw err
  }
}



