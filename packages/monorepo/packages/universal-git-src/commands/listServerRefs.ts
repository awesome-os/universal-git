import { GitRemoteHTTP } from "../git/remote/GitRemoteHTTP.ts"
import { GitRemoteDaemon } from "../git/remote/GitRemoteDaemon.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { formatInfoRefs } from "../utils/formatInfoRefs.ts"
import { parseListRefsResponse } from "../wire/parseListRefsResponse.ts"
import { writeListRefsRequest } from "../wire/writeListRefsRequest.ts"
import type {
  HttpClient,
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
  GitAuth,
} from "../git/remote/GitRemoteHTTP.ts"
import type { ServerRef } from "../git/refs/types.ts"
import type { TcpClient, TcpProgressCallback } from "../daemon/TcpClient.ts"

/**
 * Fetch a list of refs (branches, tags, etc) from a server.
 *
 * This is a rare command that doesn't require an `fs`, `dir`, or even `gitdir` argument.
 * It just requires an `http` argument.
 *
 * ### About `protocolVersion`
 *
 * There's a rather fun trade-off between Git Protocol Version 1 and Git Protocol Version 2.
 * Version 2 actually requires 2 HTTP requests instead of 1, making it similar to fetch or push in that regard.
 * However, version 2 supports server-side filtering by prefix, whereas that filtering is done client-side in version 1.
 * Which protocol is most efficient therefore depends on the number of refs on the remote, the latency of the server, and speed of the network connection.
 * For an small repos (or fast Internet connections), the requirement to make two trips to the server makes protocol 2 slower.
 * But for large repos (or slow Internet connections), the decreased payload size of the second request makes up for the additional request.
 *
 * Hard numbers vary by situation, but here's some numbers from my machine:
 *
 * Using universal-git in a browser, with a CORS proxy, listing only the branches (refs/heads) of https://github.com/awesome-os/universal-git
 * - Protocol Version 1 took ~300ms and transferred 84 KB.
 * - Protocol Version 2 took ~500ms and transferred 4.1 KB.
 *
 * Using universal-git in a browser, with a CORS proxy, listing only the branches (refs/heads) of https://gitlab.com/gitlab-org/gitlab
 * - Protocol Version 1 took ~4900ms and transferred 9.41 MB.
 * - Protocol Version 2 took ~1280ms and transferred 433 KB.
 *
 * Finally, there is a fun quirk regarding the `symrefs` parameter.
 * Protocol Version 1 will generally only return the `HEAD` symref and not others.
 * Historically, this meant that servers don't use symbolic refs except for `HEAD`, which is used to point at the "default branch".
 * However Protocol Version 2 can return *all* the symbolic refs on the server.
 * So if you are running your own git server, you could take advantage of that I guess.
 *
 * #### TL;DR
 * If you are _not_ taking advantage of `prefix` I would recommend `protocolVersion: 1`.
 * Otherwise, I recommend to use the default which is `protocolVersion: 2`.
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
 * @param {string} [args.prefix] - Only list refs that start with this prefix
 * @param {boolean} [args.symrefs = false] - Include symbolic ref targets
 * @param {boolean} [args.peelTags = false] - Include annotated tag peeled targets
 *
 * @returns {Promise<ServerRef[]>} Resolves successfully with an array of ServerRef objects
 * @see ServerRef
 *
 * @example
 * // List all the branches on a repo
 * let refs = await git.listServerRefs({
 *   http,
 *   corsProxy: "https://cors.universal-git.org",
 *   url: "https://github.com/awesome-os/universal-git.git",
 *   prefix: "refs/heads/",
 * });
 * console.log(refs);
 *
 * @example
 * // Get the default branch on a repo
 * let refs = await git.listServerRefs({
 *   http,
 *   corsProxy: "https://cors.universal-git.org",
 *   url: "https://github.com/awesome-os/universal-git.git",
 *   prefix: "HEAD",
 *   symrefs: true,
 * });
 * console.log(refs);
 *
 * @example
 * // List all the tags on a repo
 * let refs = await git.listServerRefs({
 *   http,
 *   corsProxy: "https://cors.universal-git.org",
 *   url: "https://github.com/awesome-os/universal-git.git",
 *   prefix: "refs/tags/",
 *   peelTags: true,
 * });
 * console.log(refs);
 *
 * @example
 * // List all the pull requests on a repo
 * let refs = await git.listServerRefs({
 *   http,
 *   corsProxy: "https://cors.universal-git.org",
 *   url: "https://github.com/awesome-os/universal-git.git",
 *   prefix: "refs/pull/",
 * });
 * console.log(refs);
 *
 */
export async function listServerRefs({
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
  prefix,
  symrefs,
  peelTags,
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
  prefix?: string
  symrefs?: boolean
  peelTags?: boolean
}): Promise<ServerRef[]> {
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

      // For protocol v1, refs are in the discovery response
      if (remote.protocolVersion === 1) {
        return formatInfoRefs({ refs: remote.refs, symrefs: remote.symrefs }, prefix || '', symrefs || false, peelTags || false)
      }

      // Protocol v2 - use ls-refs command
      const body = await writeListRefsRequest({ prefix, symrefs, peelTags })
      const bodyIterator = (async function* () {
        for (const buf of body) {
          yield new Uint8Array(buf)
        }
      })()

      const res = await GitRemoteDaemon.connect({
        tcp,
        service: forPush ? 'git-receive-pack' : 'git-upload-pack',
        url,
        body: bodyIterator,
        onProgress: onProgress as TcpProgressCallback | undefined,
      })

      if (!res.body) {
        throw new Error('No response body from server')
      }
      return parseListRefsResponse(res.body)
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

    if (remote.protocolVersion === 1) {
      return formatInfoRefs(remote, prefix || '', symrefs || false, peelTags || false)
    }

    // Protocol Version 2 - continue with ls-refs command

    // Protocol Version 2
    const body = await writeListRefsRequest({ prefix, symrefs, peelTags })

    // Create an async iterator that yields individual buffers as Uint8Array
    const bodyIterator = (async function* () {
      for (const buf of body) {
        yield new Uint8Array(buf)
      }
    })()

    const res = await GitRemoteHTTP.connect({
      http,
      auth: remote.auth,
      headers,
      corsProxy,
      service: forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      body: bodyIterator,
      protocolVersion: 2,
      command: 'ls-refs',
    })

    if (!res.body) {
      throw new Error('No response body from server')
    }
    return parseListRefsResponse(res.body)
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.listServerRefs'
    throw err
  }
}

