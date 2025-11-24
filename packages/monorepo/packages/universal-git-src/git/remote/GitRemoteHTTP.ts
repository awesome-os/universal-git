import { HttpError } from '../../errors/HttpError.ts'
import { SmartHttpError } from '../../errors/SmartHttpError.ts'
import { UserCanceledError } from '../../errors/UserCanceledError.ts'
import { calculateBasicAuthHeader } from "../../utils/calculateBasicAuthHeader.ts"
import { collect } from "../../utils/collect.ts"
import { extractAuthFromUrl } from "../../utils/extractAuthFromUrl.ts"
import { parseRefsAdResponse } from "../../wire/parseRefsAdResponse.ts"
import { fromValue } from "../../utils/fromValue.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

// ============================================================================
// HTTP CLIENT TYPES
// ============================================================================

/**
 * Progress event emitted during HTTP operations
 */
export type GitProgressEvent = {
  phase: string
  loaded: number
  total: number
}

/**
 * Callback for progress updates during HTTP operations
 */
export type ProgressCallback = (progress: GitProgressEvent) => void | Promise<void>

/**
 * HTTP request structure
 */
export type GitHttpRequest = {
  url: string
  method?: string
  headers?: Record<string, string>
  agent?: unknown // HTTP or HTTPS agent (Node.js only)
  body?: AsyncIterableIterator<Uint8Array>
  onProgress?: ProgressCallback
  signal?: unknown // Reserved for future use
}

/**
 * HTTP response structure
 */
export type GitHttpResponse = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: AsyncIterableIterator<Uint8Array>
  statusCode: number
  statusMessage: string
}

/**
 * HTTP fetch function signature
 */
export type HttpFetch = (request: GitHttpRequest) => Promise<GitHttpResponse>

/**
 * HTTP client interface
 */
export type HttpClient = {
  request: HttpFetch
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

/**
 * Authentication information
 */
export type GitAuth = {
  username?: string
  password?: string
  headers?: Record<string, string>
  cancel?: boolean // Tells git to throw a UserCanceledError instead of HttpError
}

/**
 * Authentication callback
 */
export type AuthCallback = (url: string, auth: GitAuth) => GitAuth | void | Promise<GitAuth | void>

/**
 * Authentication failure callback
 */
export type AuthFailureCallback = (url: string, auth: GitAuth) => GitAuth | void | Promise<GitAuth | void>

/**
 * Authentication success callback
 */
export type AuthSuccessCallback = (url: string, auth: GitAuth) => void | Promise<void>

// Try to accommodate known CORS proxy implementations:
// - https://jcubic.pl/proxy.php?  <-- uses query string
// - https://cors.universal-git.org  <-- uses path
const corsProxify = (corsProxy: string, url: string): string =>
  corsProxy.endsWith('?')
    ? `${corsProxy}${url}`
    : `${corsProxy}/${url.replace(/^https?:\/\//, '')}`

const updateHeaders = (
  headers: Record<string, string>,
  auth: GitAuth
): void => {
  // Update the basic auth header
  if (auth.username || auth.password) {
    headers.Authorization = calculateBasicAuthHeader(auth)
  }
  // but any manually provided headers take precedence
  if (auth.headers) {
    Object.assign(headers, auth.headers)
  }
}

type StringifyBodyResult = {
  preview: string
  response: string
  data: UniversalBuffer
}

/**
 * @param res
 *
 * @returns {{ preview: string, response: string, data: UniversalBuffer }}
 */
const stringifyBody = async (
  res: GitHttpResponse
): Promise<StringifyBodyResult> => {
  try {
    // Some services provide a meaningful error message in the body of 403s like "token lacks the scopes necessary to perform this action"
    if (!res.body) {
      return { preview: '', response: '', data: UniversalBuffer.alloc(0) }
    }
    const data = UniversalBuffer.from(await collect(res.body))
    const response = data.toString('utf8')
    const preview =
      response.length < 256 ? response : response.slice(0, 256) + '...'
    return { preview, response, data }
  } catch (e) {
    return { preview: '', response: '', data: UniversalBuffer.alloc(0) }
  }
}

export class GitRemoteHTTP {
  /**
   * Returns the capabilities of the GitRemoteHTTP class.
   */
  static async capabilities(): Promise<string[]> {
    return ['discover', 'connect']
  }

  /**
   * Discovers references from a remote Git repository.
   */
  static async discover({
    http,
    onProgress,
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    corsProxy,
    service,
    url: _origUrl,
    headers,
    protocolVersion,
  }: {
    http: HttpClient
    onProgress?: ProgressCallback
    onAuth?: AuthCallback
    onAuthSuccess?: AuthSuccessCallback
    onAuthFailure?: AuthFailureCallback
    corsProxy?: string
    service: string
    url: string
    headers: Record<string, string>
    protocolVersion: 1 | 2
  }): Promise<
    | { protocolVersion: 1; refs: Map<string, string>; symrefs: Map<string, string>; capabilities: Set<string>; auth: GitAuth }
    | { protocolVersion: 2; capabilities2: Record<string, string | true>; auth: GitAuth }
  > {
    let { url, auth } = extractAuthFromUrl(_origUrl)
    const proxifiedURL = corsProxy ? corsProxify(corsProxy, url) : url
    if (auth.username || auth.password) {
      headers.Authorization = calculateBasicAuthHeader(auth)
    }
    if (protocolVersion === 2) {
      headers['Git-Protocol'] = 'version=2'
      console.log(`[Git Protocol] Requesting protocol version 2 for ${service} at ${url}`)
    } else {
      console.log(`[Git Protocol] Requesting protocol version 1 for ${service} at ${url}`)
    }

    let res: GitHttpResponse
    let tryAgain: boolean
    let providedAuthBefore = false
    do {
      res = await (http.request as any)({
        onProgress,
        method: 'GET',
        url: `${proxifiedURL}/info/refs?service=${service}`,
        headers,
      })

      // the default loop behavior
      tryAgain = false

      // 401 is the "correct" response for access denied. 203 is Non-Authoritative Information and comes from Azure DevOps, which
      // apparently doesn't realize this is a git request and is returning the HTML for the "Azure DevOps Services | Sign In" page.
      if (res.statusCode === 401 || res.statusCode === 203) {
        // On subsequent 401s, call `onAuthFailure` instead of `onAuth`.
        // This is so that naive `onAuth` callbacks that return a fixed value don't create an infinite loop of retrying.
        const getAuth = providedAuthBefore ? onAuthFailure : onAuth
        if (getAuth) {
          // Acquire credentials and try again
          // TODO: read `useHttpPath` value from git config and pass along?
          const newAuth = await getAuth(url, {
            ...auth,
            headers: { ...headers },
          })
          if (newAuth && newAuth.cancel) {
            throw new UserCanceledError()
          } else if (newAuth) {
            auth = newAuth
            updateHeaders(headers, auth)
            providedAuthBefore = true
            tryAgain = true
          }
        }
      } else if (
        res.statusCode === 200 &&
        providedAuthBefore &&
        onAuthSuccess
      ) {
        await onAuthSuccess(url, auth)
      }
    } while (tryAgain)

    if (res.statusCode !== 200) {
      const { response } = await stringifyBody(res)
      throw new HttpError(res.statusCode, res.statusMessage, response)
    }
    // Git "smart" HTTP servers should respond with the correct Content-Type header.
    if (
      res.headers &&
      res.headers['content-type'] === `application/x-${service}-advertisement`
    ) {
      if (!res.body) {
        throw new HttpError(res.statusCode, res.statusMessage, 'No response body')
      }
      const remoteHTTP = await parseRefsAdResponse(res.body, { service }) as any
      remoteHTTP.auth = auth
      
      // Log protocol version negotiation result
      if (protocolVersion === 1 && remoteHTTP.protocolVersion === 2) {
        console.warn(`[Git Protocol] WARNING: Requested protocol v1 but server responded with v2. This may cause issues.`)
      } else if (protocolVersion === 2 && remoteHTTP.protocolVersion === 1) {
        console.log(`[Git Protocol] Gracefully falling back to protocol v1 (server doesn't support v2)`)
      } else {
        console.log(`[Git Protocol] Protocol negotiation successful: using protocol v${remoteHTTP.protocolVersion}`)
      }
      
      return remoteHTTP
    } else {
      // If they don't send the correct content-type header, that's a good indicator it is either a "dumb" HTTP
      // server, or the user specified an incorrect remote URL and the response is actually an HTML page.
      // In this case, we save the response as plain text so we can generate a better error message if needed.
      const { preview, response, data } = await stringifyBody(res)
      // For backwards compatibility, try to parse it anyway.
      // TODO: maybe just throw instead of trying?
      try {
        const remoteHTTP = await parseRefsAdResponse(fromValue(new Uint8Array(data)) as AsyncIterableIterator<Uint8Array>, { service }) as any
        remoteHTTP.auth = auth
        return remoteHTTP
      } catch (e) {
        throw new SmartHttpError(preview, response)
      }
    }
  }

  /**
   * Connects to a remote Git repository and sends a request.
   */
  static async connect({
    http,
    onProgress,
    corsProxy,
    service,
    url,
    auth,
    body,
    headers,
    protocolVersion,
    command,
  }: {
    http: HttpClient
    onProgress?: ProgressCallback
    corsProxy?: string
    service: string
    url: string
    headers: Record<string, string>
    body?: AsyncIterableIterator<Uint8Array> | Uint8Array | UniversalBuffer | UniversalBuffer[]
    auth: GitAuth
    protocolVersion?: 1 | 2
    command?: string
  }): Promise<GitHttpResponse> {
    // We already have the "correct" auth value at this point, but
    // we need to strip out the username/password from the URL yet again.
    const urlAuth = extractAuthFromUrl(url)
    let finalUrl = url
    if (urlAuth) finalUrl = urlAuth.url

    if (corsProxy) finalUrl = corsProxify(corsProxy, finalUrl)

    headers['content-type'] = `application/x-${service}-request`
    headers.accept = `application/x-${service}-result`
    updateHeaders(headers, auth)

    // Convert body to async iterator if needed
    let bodyIterator: AsyncIterableIterator<Uint8Array> | undefined
    if (body) {
      if (Array.isArray(body)) {
        // Array of buffers - convert to async iterator
        bodyIterator = (async function* () {
          for (const buf of body) {
            yield new Uint8Array(buf)
          }
        })()
      } else if (body instanceof Uint8Array || UniversalBuffer.isBuffer(body)) {
        // Single buffer - convert to async iterator
        bodyIterator = (async function* () {
          // @ts-expect-error - body type doesn't match Uint8Array constructor overload exactly
          yield new Uint8Array(body)
        })()
      } else {
        // Already an async iterator
        bodyIterator = body
      }
    }

    // Protocol v2 requires command parameter in URL for command-based requests
    let requestUrl = `${finalUrl}/${service}`
    if (protocolVersion === 2 && command) {
      const separator = requestUrl.includes('?') ? '&' : '?'
      requestUrl = `${requestUrl}${separator}command=${command}`
    }

    const res = await (http.request as any)({
      onProgress,
      method: 'POST',
      url: requestUrl,
      body: bodyIterator,
      headers,
    })
    if (res.statusCode !== 200) {
      const { response } = await stringifyBody(res)
      throw new HttpError(res.statusCode, res.statusMessage, response)
    }
    return res
  }
}

