import { HttpError } from '../../errors/HttpError.ts'
import { SmartHttpError } from '../../errors/SmartHttpError.ts'
import { UserCanceledError } from '../../errors/UserCanceledError.ts'
import { calculateBasicAuthHeader } from '../../utils/calculateBasicAuthHeader.ts'
import { collect } from '../../utils/collect.ts'
import { extractAuthFromUrl } from '../../utils/extractAuthFromUrl.ts'
import { parseRefsAdResponse } from '../../wire/parseRefsAdResponse.ts'
import { fromValue } from '../../utils/fromValue.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type {
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
  GitAuth,
  GitHttpResponse,
  HttpClient,
  ProgressCallback,
  RemoteConnectOptions,
  RemoteConnection,
  RemoteDiscoverOptions,
  RemoteDiscoverResult,
} from './types.ts'
import type { GitRemoteBackend } from './GitRemoteBackend.ts'

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

export class GitRemoteHttp implements GitRemoteBackend {
  readonly name = 'http'
  readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  getUrl(): string {
    return this.baseUrl
  }

  supportsRestApi(): boolean {
    return false
  }

  async discover(
    options: RemoteDiscoverOptions
  ): Promise<RemoteDiscoverResult> {
    return GitRemoteHttp.performDiscover(options)
  }

  async connect(options: RemoteConnectOptions): Promise<RemoteConnection> {
    return GitRemoteHttp.performConnect(options)
  }

  static async discover(
    options: RemoteDiscoverOptions
  ): Promise<RemoteDiscoverResult> {
    return GitRemoteHttp.performDiscover(options)
  }

  static async connect(
    options: RemoteConnectOptions
  ): Promise<RemoteConnection> {
    return GitRemoteHttp.performConnect(options)
  }

  private static async performDiscover(
    options: RemoteDiscoverOptions
  ): Promise<RemoteDiscoverResult> {
    const {
      http,
      onProgress,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      corsProxy,
      service,
      url: _origUrl,
      protocolVersion = 1,
    } = options
    
    if (!http) {
      const { MissingParameterError } = await import('../../errors/MissingParameterError.ts')
      throw new MissingParameterError('http', 'GitRemoteHttp requires http client')
    }
    const requestHeaders = options.headers ?? (options.headers = {})
    let { url, auth } = extractAuthFromUrl(_origUrl)
    const proxifiedURL = corsProxy ? corsProxify(corsProxy, url) : url
    if (auth.username || auth.password) {
      requestHeaders.Authorization = calculateBasicAuthHeader(auth)
    }
    if (protocolVersion === 2) {
      requestHeaders['Git-Protocol'] = 'version=2'
      console.log(
        `[Git Protocol] Requesting protocol version 2 for ${service} at ${url}`
      )
    } else {
      console.log(
        `[Git Protocol] Requesting protocol version 1 for ${service} at ${url}`
      )
    }

    let res: GitHttpResponse
    let tryAgain: boolean
    let providedAuthBefore = false
    do {
      res = await (http.request as any)({
        onProgress,
        method: 'GET',
        url: `${proxifiedURL}/info/refs?service=${service}`,
        headers: requestHeaders,
      })

      tryAgain = false

      if (res.statusCode === 401 || res.statusCode === 203) {
        const getAuth = providedAuthBefore ? onAuthFailure : onAuth
        if (getAuth) {
          const newAuth = await getAuth(url, {
            ...auth,
            headers: { ...requestHeaders },
          })
          if (newAuth && newAuth.cancel) {
            throw new UserCanceledError()
          } else if (newAuth) {
            auth = newAuth
            updateHeaders(requestHeaders, auth)
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

    if (
      res.headers &&
      res.headers['content-type'] === `application/x-${service}-advertisement`
    ) {
      if (!res.body) {
        throw new HttpError(res.statusCode, res.statusMessage, 'No response body')
      }
      const remoteHTTP = (await parseRefsAdResponse(res.body, {
        service,
      })) as any
      remoteHTTP.auth = auth

      if (protocolVersion === 1 && remoteHTTP.protocolVersion === 2) {
        console.warn(
          `[Git Protocol] WARNING: Requested protocol v1 but server responded with v2. This may cause issues.`
        )
      } else if (protocolVersion === 2 && remoteHTTP.protocolVersion === 1) {
        console.log(
          `[Git Protocol] Gracefully falling back to protocol v1 (server doesn't support v2)`
        )
      } else {
        console.log(
          `[Git Protocol] Protocol negotiation successful: using protocol v${remoteHTTP.protocolVersion}`
        )
      }

      return remoteHTTP
    } else {
      const { preview, response, data } = await stringifyBody(res)
      try {
        const remoteHTTP = (await parseRefsAdResponse(
          fromValue(new Uint8Array(data)) as AsyncIterableIterator<Uint8Array>,
          { service }
        )) as any
        remoteHTTP.auth = auth
        return remoteHTTP
      } catch (e) {
        throw new SmartHttpError(preview, response)
      }
    }
  }

  private static async performConnect(
    options: RemoteConnectOptions
  ): Promise<RemoteConnection> {
    const {
      http,
      onProgress,
      corsProxy,
      service,
      url,
      auth,
      body,
      protocolVersion,
      command,
    } = options
    
    if (!http) {
      const { MissingParameterError } = await import('../../errors/MissingParameterError.ts')
      throw new MissingParameterError('http', 'GitRemoteHttp requires http client')
    }
    const requestHeaders = options.headers ?? (options.headers = {})
    const urlAuth = extractAuthFromUrl(url)
    let finalUrl = url
    if (urlAuth) finalUrl = urlAuth.url

    if (corsProxy) finalUrl = corsProxify(corsProxy, finalUrl)

    requestHeaders['content-type'] = `application/x-${service}-request`
    requestHeaders.accept = `application/x-${service}-result`
    if (auth) {
      updateHeaders(requestHeaders, auth)
    } else {
      // Extract auth from URL if not provided
      const urlAuth = extractAuthFromUrl(url)
      if (urlAuth && urlAuth.auth) {
        updateHeaders(requestHeaders, urlAuth.auth)
      }
    }

    let bodyIterator: AsyncIterableIterator<Uint8Array> | undefined
    if (body) {
      if (Array.isArray(body)) {
        bodyIterator = (async function* () {
          for (const buf of body) {
            yield new Uint8Array(buf)
          }
        })()
      } else if (body instanceof Uint8Array || UniversalBuffer.isBuffer(body)) {
        bodyIterator = (async function* () {
          // @ts-expect-error - body type doesn't match Uint8Array constructor overload exactly
          yield new Uint8Array(body)
        })()
      } else {
        bodyIterator = body
      }
    }

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
      headers: requestHeaders,
    })
    if (res.statusCode !== 200) {
      const { response } = await stringifyBody(res)
      throw new HttpError(res.statusCode, res.statusMessage, response)
    }
    return res
  }
}

export { GitRemoteHttp as GitRemoteHTTP }

