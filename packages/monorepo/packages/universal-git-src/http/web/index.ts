/* eslint-env browser */
import { collect } from "../../utils/collect.ts"
import { fromStream } from "../../utils/fromStream.ts"
import type { GitHttpRequest, GitHttpResponse } from "../../git/remote/GitRemoteHTTP.ts"

/**
 * HttpClient for browser environment
 *
 * @param {GitHttpRequest} request
 * @returns {Promise<GitHttpResponse>}
 */
export async function request({
  onProgress,
  url,
  method = 'GET',
  headers = {},
  body,
}: GitHttpRequest): Promise<GitHttpResponse> {
  // streaming uploads aren't possible yet in the browser
  let requestBody: BodyInit | undefined = undefined
  if (body) {
    const collected = await collect(body)
    requestBody = collected as BodyInit
  }
  const res = await fetch(url, { method, headers, body: requestBody })
  const iter: AsyncIterableIterator<Uint8Array> =
    res.body && typeof res.body.getReader === 'function'
      ? fromStream(res.body as ReadableStream<Uint8Array>)
      : (async function* () {
          yield new Uint8Array(await res.arrayBuffer())
        })()
  // convert Header object to ordinary JSON
  const responseHeaders: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })
  return {
    url: res.url,
    method,
    statusCode: res.status,
    statusMessage: res.statusText,
    body: iter,
    headers: responseHeaders,
  }
}

export default { request }

