import { HttpError } from '../../errors/HttpError.ts'
import { collect } from '../../utils/collect.ts'
import { extractAuthFromUrl } from '../../utils/extractAuthFromUrl.ts'
import { calculateBasicAuthHeader } from '../../utils/calculateBasicAuthHeader.ts'
import type { HttpClient, ProgressCallback, GitAuth } from './GitRemoteHTTP.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

// ============================================================================
// HTTP DUMB PROTOCOL IMPLEMENTATION
// ============================================================================

/**
 * GitRemoteHTTPDumb - Implements the legacy HTTP "dumb" protocol
 * 
 * The dumb HTTP protocol serves Git repositories as static files over HTTP.
 * It does not use the smart protocol with capability negotiation.
 * 
 * Protocol flow:
 * 1. GET /info/refs - Get plain text refs list
 * 2. GET /objects/<hash-prefix>/<hash-suffix> - Get loose objects
 * 3. GET /objects/pack/pack-<hash>.pack - Get packfiles
 * 4. GET /objects/pack/pack-<hash>.idx - Get packfile indices
 */
export class GitRemoteHTTPDumb {
  /**
   * Returns the capabilities of the GitRemoteHTTPDumb class.
   */
  static async capabilities(): Promise<string[]> {
    return ['discover', 'connect']
  }

  /**
   * Discovers references from a remote Git repository using dumb HTTP protocol.
   * 
   * Fetches /info/refs which returns plain text format:
   * <oid> refs/heads/master\n
   * <oid> refs/heads/develop\n
   * ...
   */
  static async discover({
    http,
    onProgress,
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    corsProxy,
    url: _origUrl,
    headers = {},
  }: {
    http: HttpClient
    onProgress?: ProgressCallback
    onAuth?: (url: string, auth: GitAuth) => GitAuth | void | Promise<GitAuth | void>
    onAuthSuccess?: (url: string, auth: GitAuth) => void | Promise<void>
    onAuthFailure?: (url: string, auth: GitAuth) => GitAuth | void | Promise<GitAuth | void>
    corsProxy?: string
    url: string
    headers?: Record<string, string>
  }): Promise<{
    refs: Map<string, string>
    symrefs: Map<string, string>
    capabilities: string[]
    auth: GitAuth
  }> {
    let { url, auth } = extractAuthFromUrl(_origUrl)
    const proxifiedURL = corsProxy ? this.corsProxify(corsProxy, url) : url
    
    if (auth.username || auth.password) {
      headers.Authorization = calculateBasicAuthHeader(auth)
    }

    // Try to fetch /info/refs
    let res = await http.request({
      onProgress,
      method: 'GET',
      url: `${proxifiedURL}/info/refs`,
      headers,
    })

    // Handle authentication
    if (res.statusCode === 401) {
      if (onAuth) {
        const newAuth = await onAuth(url, { ...auth, headers: { ...headers } })
        if (newAuth) {
          auth = newAuth
          headers.Authorization = calculateBasicAuthHeader(auth)
          res = await http.request({
            onProgress,
            method: 'GET',
            url: `${proxifiedURL}/info/refs`,
            headers,
          })
        }
      }
    }

    if (res.statusCode !== 200) {
      const body = res.body ? UniversalBuffer.from(await collect(res.body)).toString('utf8') : ''
      throw new HttpError(res.statusCode, res.statusMessage, body)
    }

    if (!res.body) {
      throw new HttpError(res.statusCode, res.statusMessage, 'No response body')
    }

    // Parse plain text refs
    const bodyText = UniversalBuffer.from(await collect(res.body)).toString('utf8')
    const refs = new Map<string, string>()
    const symrefs = new Map<string, string>()

    // Parse format: <oid> refs/heads/master\n
    for (const line of bodyText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Check for symref format: ref: refs/heads/master
      if (trimmed.startsWith('ref: ')) {
        const target = trimmed.slice(5).trim()
        symrefs.set('HEAD', target)
        continue
      }

      // Parse <oid> <ref> format
      const match = trimmed.match(/^([a-f0-9]{40,64})\s+(.+)$/)
      if (match) {
        const [, oid, ref] = match
        refs.set(ref, oid)
      }
    }

    return {
      refs,
      symrefs,
      capabilities: [], // Dumb protocol has no capabilities
      auth,
    }
  }

  /**
   * Fetches a Git object using dumb HTTP protocol.
   * 
   * Objects are fetched from /objects/<hash-prefix>/<hash-suffix>
   */
  static async fetchObject({
    http,
    onProgress,
    url: _origUrl,
    oid,
    corsProxy,
    headers = {},
    auth,
  }: {
    http: HttpClient
    onProgress?: ProgressCallback
    url: string
    oid: string
    corsProxy?: string
    headers?: Record<string, string>
    auth: GitAuth
  }): Promise<UniversalBuffer> {
    let { url } = extractAuthFromUrl(_origUrl)
    const proxifiedURL = corsProxy ? this.corsProxify(corsProxy, url) : url

    if (auth.username || auth.password) {
      headers.Authorization = calculateBasicAuthHeader(auth)
    }

    // Construct object path: /objects/ab/cdef...
    const hashPrefix = oid.slice(0, 2)
    const hashSuffix = oid.slice(2)
    const objectPath = `/objects/${hashPrefix}/${hashSuffix}`

    const res = await http.request({
      onProgress,
      method: 'GET',
      url: `${proxifiedURL}${objectPath}`,
      headers,
    })

    if (res.statusCode !== 200) {
      throw new HttpError(res.statusCode, res.statusMessage, `Failed to fetch object ${oid}`)
    }

    if (!res.body) {
      throw new HttpError(res.statusCode, res.statusMessage, 'No response body')
    }

    return UniversalBuffer.from(await collect(res.body))
  }

  /**
   * Fetches a packfile using dumb HTTP protocol.
   */
  static async fetchPackfile({
    http,
    onProgress,
    url: _origUrl,
    packHash,
    corsProxy,
    headers = {},
    auth,
  }: {
    http: HttpClient
    onProgress?: ProgressCallback
    url: string
    packHash: string
    corsProxy?: string
    headers?: Record<string, string>
    auth: GitAuth
  }): Promise<UniversalBuffer> {
    let { url } = extractAuthFromUrl(_origUrl)
    const proxifiedURL = corsProxy ? this.corsProxify(corsProxy, url) : url

    if (auth.username || auth.password) {
      headers.Authorization = calculateBasicAuthHeader(auth)
    }

    const packPath = `/objects/pack/pack-${packHash}.pack`
    const res = await http.request({
      onProgress,
      method: 'GET',
      url: `${proxifiedURL}${packPath}`,
      headers,
    })

    if (res.statusCode !== 200) {
      throw new HttpError(res.statusCode, res.statusMessage, `Failed to fetch packfile ${packHash}`)
    }

    if (!res.body) {
      throw new HttpError(res.statusCode, res.statusMessage, 'No response body')
    }

    return UniversalBuffer.from(await collect(res.body))
  }

  /**
   * Connects to a remote Git repository using dumb HTTP protocol.
   * 
   * Note: Dumb HTTP protocol doesn't support the smart protocol's connect method.
   * Instead, objects must be fetched individually.
   */
  static async connect({
    http,
    onProgress,
    corsProxy,
    url,
    auth,
    headers = {},
  }: {
    http: HttpClient
    onProgress?: ProgressCallback
    corsProxy?: string
    url: string
    headers?: Record<string, string>
    auth: GitAuth
  }): Promise<{
    body: AsyncIterableIterator<Uint8Array>
    headers?: Record<string, string>
    statusCode: number
    statusMessage: string
  }> {
    // Dumb HTTP doesn't support the smart protocol's connect method
    // This is a placeholder that throws an error
    throw new Error(
      'Dumb HTTP protocol does not support smart protocol operations. ' +
      'Use discover() and fetchObject()/fetchPackfile() methods instead.'
    )
  }

  /**
   * CORS proxy helper
   */
  private static corsProxify(corsProxy: string, url: string): string {
    return corsProxy.endsWith('?')
      ? `${corsProxy}${url}`
      : `${corsProxy}/${url.replace(/^https?:\/\//, '')}`
  }
}

