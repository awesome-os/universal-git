import get from 'simple-get'

import { asyncIteratorToStream } from "../../utils/asyncIteratorToStream.ts"
import { collect } from "../../utils/collect.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitHttpRequest, GitHttpResponse } from "../../git/remote/GitRemoteHTTP.ts"

const HTTP_DEBUG_ENABLED =
  process.env.UNIVERSAL_GIT_DEBUG_HTTP === '1' ||
  process.env.ISOGIT_DEBUG_HTTP === '1' ||
  process.env.ISO_GIT_DEBUG_HTTP === '1'

const debugHttp = (message: string, extra?: Record<string, unknown>): void => {
  if (!HTTP_DEBUG_ENABLED) return
  if (extra) {
    console.log(`[Git HTTP] ${message}`, extra)
  } else {
    console.log(`[Git HTTP] ${message}`)
  }
}

/**
 * HttpClient for Node.js environment
 *
 * @param {GitHttpRequest} request
 * @returns {Promise<GitHttpResponse>}
 */
export async function request({
  onProgress,
  url,
  method = 'GET',
  headers = {},
  agent,
  body,
}: GitHttpRequest): Promise<GitHttpResponse> {
  // If we can, we should send it as a single buffer so it sets a Content-Length header.
  let requestBody: UniversalBuffer | any = body
  if (body && Array.isArray(body)) {
    requestBody = UniversalBuffer.from(await collect(body))
    debugHttp(`Prepared buffered request body (${requestBody.length} bytes) for ${method} ${url}`)
  } else if (body) {
    requestBody = await asyncIteratorToStream(body)
    debugHttp(`Prepared streamed request body for ${method} ${url}`)
  }
  debugHttp(`Initiating HTTP request`, { method, url, headers })
  return new Promise<GitHttpResponse>((resolve, reject) => {
    const clientRequest = get(
      {
        url,
        method,
        headers,
        agent,
        body: requestBody,
      },
      (err: Error | null, res: any) => {
        if (err) {
          debugHttp(`Request error for ${method} ${url}`, { message: err.message })
          return reject(err)
        }
        debugHttp(`Received response for ${method} ${url}`, {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
        })
        if (HTTP_DEBUG_ENABLED && res) {
          let totalBytes = 0
          let lastChunkAt = Date.now()
          const warnEveryMs = 10000
          const stallTimer = setInterval(() => {
            const idleFor = Date.now() - lastChunkAt
            if (idleFor >= warnEveryMs) {
              debugHttp(`Response stream idle for ${idleFor}ms`, {
                url,
                method,
                totalBytes,
              })
            }
          }, warnEveryMs)
          const finalize = (label: string) => {
            clearInterval(stallTimer)
            debugHttp(`${label} (${method} ${url})`, { totalBytes })
          }
          res.on('data', (chunk: UniversalBuffer) => {
            const chunkSize =
              typeof chunk === 'string'
                ? new TextEncoder().encode(String(chunk)).length
                : chunk && typeof chunk === 'object' && (chunk as any) instanceof Uint8Array
                ? (chunk as Uint8Array).length
                : chunk?.length ?? chunk?.byteLength ?? 0
            totalBytes += chunkSize
            lastChunkAt = Date.now()
            debugHttp(`Response chunk (${method} ${url})`, {
              chunkSize,
              totalBytes,
            })
          })
          res.on('end', () => finalize('Response stream ended'))
          res.on('close', () => finalize('Response stream closed'))
          res.on('error', (streamErr: Error) => {
            clearInterval(stallTimer)
            debugHttp(`Response stream error for ${method} ${url}`, {
              message: streamErr.message,
            })
          })
        }
        try {
          const iter = UniversalBuffer.fromNodeStream(res)
          resolve({
            url: res.url,
            method: res.method,
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            body: iter,
            headers: res.headers,
          })
        } catch (e) {
          reject(e)
        }
      }
    )
    if (HTTP_DEBUG_ENABLED && clientRequest) {
      clientRequest.on('socket', socket => {
        debugHttp(`HTTP socket assigned for ${method} ${url}`, {
          connecting: socket.connecting,
          localAddress: socket.localAddress,
        })
      })
      clientRequest.on('finish', () => {
        debugHttp(`HTTP request body flushed for ${method} ${url}`)
      })
      clientRequest.on('error', reqErr => {
        debugHttp(`HTTP request error for ${method} ${url}`, { message: reqErr.message })
      })
    }
  })
}

export default { request }

