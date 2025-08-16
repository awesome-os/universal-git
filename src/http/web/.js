/* eslint-env browser */
import { collect } from '../utils/collect.js'
import { fromStream } from '../utils/fromStream'

/**
 * HttpClient
 *
 * @param {import('../typedefs-http').GitHttpRequest} request
 * @returns {Promise<import('../typedefs-http').GitHttpResponse>}
 */
export async function request({
  onProgress,
  url,
  method = 'GET',
  headers = {},
  body,
}) {
  // streaming uploads aren't possible yet in the browser
  if (body) {
    body = await collect(body);
  }
  
  const res = await fetch(url, { method, headers, body });
  
  return {
    url: res.url,
    method: res.method,
    statusCode: res.status,
    statusMessage: res.statusText,
    body: res.body,
    headers: Object.fromEntries(res.headers.entries()),
  }
}

export default { request }
