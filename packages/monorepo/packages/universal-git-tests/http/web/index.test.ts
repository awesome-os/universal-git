import { test } from 'node:test'
import assert from 'node:assert'
import { request } from '@awesome-os/universal-git-src/http/web/index.ts'

// Helper to create async iterable from buffers
async function* createStream(buffers: Uint8Array[]): AsyncIterableIterator<Uint8Array> {
  for (const buffer of buffers) {
    yield buffer
  }
}

// Helper to create a mock ReadableStream-like object
function createMockReadableStream(buffers: Uint8Array[]) {
  let index = 0
  return {
    getReader: () => ({
      async read() {
        if (index >= buffers.length) {
          return { done: true, value: undefined }
        }
        const value = buffers[index++]
        return { done: false, value }
      },
      async cancel() {},
      releaseLock() {},
      closed: Promise.resolve(undefined),
    }),
  }
}

test('browser HTTP request', async (t) => {
  await t.test('request - GET with no body', async () => {
    const responseBody = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
    const mockStream = createMockReadableStream([responseBody])
    
    const originalFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => {
      return {
        url: 'http://example.com/test',
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/plain' }),
        body: mockStream as ReadableStream<Uint8Array>,
        arrayBuffer: async () => responseBody.buffer,
      } as Response
    }
    
    const result = await request({
      url: 'http://example.com/test',
      method: 'GET',
    })
    
    assert.strictEqual(result.url, 'http://example.com/test')
    assert.strictEqual(result.method, 'GET')
    assert.strictEqual(result.statusCode, 200)
    assert.strictEqual(result.statusMessage, 'OK')
    assert.ok(result.headers)
    assert.strictEqual(result.headers['content-type'], 'text/plain')
    assert.ok(result.body)
    
    // Read the body
    const bodyChunks: Uint8Array[] = []
    for await (const chunk of result.body) {
      bodyChunks.push(chunk)
    }
    assert.strictEqual(bodyChunks.length, 1)
    assert.strictEqual(bodyChunks[0][0], 0x48) // 'H'
    
    // Restore fetch
    if (originalFetch) {
      ;(globalThis as any).fetch = originalFetch
    } else {
      delete (globalThis as any).fetch
    }
  })

  await t.test('request - POST with body', async () => {
    const requestBody = new Uint8Array([0x57, 0x6f, 0x72, 0x6c, 0x64]) // "World"
    const responseBody = new Uint8Array([0x4f, 0x4b]) // "OK"
    const mockStream = createMockReadableStream([responseBody])
    
    const originalFetch = (globalThis as any).fetch
    let capturedBody: any
    ;(globalThis as any).fetch = async (url: any, init: any) => {
      capturedBody = init?.body
      return {
        url: typeof url === 'string' ? url : url.toString(),
        status: 201,
        statusText: 'Created',
        headers: new Headers(),
        body: mockStream as ReadableStream<Uint8Array>,
        arrayBuffer: async () => responseBody.buffer,
      } as Response
    }
    
    const bodyStream = createStream([requestBody])
    const result = await request({
      url: 'http://example.com/test',
      method: 'POST',
      body: bodyStream,
    })
    
    assert.strictEqual(result.statusCode, 201)
    assert.strictEqual(result.statusMessage, 'Created')
    assert.ok(capturedBody, 'Body should be captured')
    
    // Restore fetch
    if (originalFetch) {
      ;(globalThis as any).fetch = originalFetch
    } else {
      delete (globalThis as any).fetch
    }
  })

  await t.test('request - with custom headers', async () => {
    const mockStream = createMockReadableStream([new Uint8Array([0x4f, 0x4b])])
    
    const originalFetch = (globalThis as any).fetch
    let capturedHeaders: any
    ;(globalThis as any).fetch = async (url: any, init: any) => {
      capturedHeaders = init?.headers
      return {
        url: typeof url === 'string' ? url : url.toString(),
        status: 200,
        statusText: 'OK',
        headers: new Headers(init?.headers as Record<string, string> || {}),
        body: mockStream as ReadableStream<Uint8Array>,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response
    }
    
    const result = await request({
      url: 'http://example.com/test',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      },
    })
    
    assert.strictEqual(result.statusCode, 200)
    assert.ok(capturedHeaders, 'Headers should be captured')
    
    // Restore fetch
    if (originalFetch) {
      ;(globalThis as any).fetch = originalFetch
    } else {
      delete (globalThis as any).fetch
    }
  })

  await t.test('request - response without ReadableStream body', async () => {
    // Simulate response without getReader (fallback to arrayBuffer)
    const originalFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => {
      return {
        url: 'http://example.com/test',
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: null,
        arrayBuffer: async () => {
          const buffer = new ArrayBuffer(5)
          const view = new Uint8Array(buffer)
          view.set([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
          return buffer
        },
      } as Response
    }
    
    const result = await request({
      url: 'http://example.com/test',
      method: 'GET',
    })
    
    assert.strictEqual(result.statusCode, 200)
    assert.ok(result.body)
    
    // Read the body (should use arrayBuffer fallback)
    const bodyChunks: Uint8Array[] = []
    for await (const chunk of result.body) {
      bodyChunks.push(chunk)
    }
    assert.strictEqual(bodyChunks.length, 1)
    assert.strictEqual(bodyChunks[0].length, 5)
    assert.strictEqual(bodyChunks[0][0], 0x48) // 'H'
    
    // Restore fetch
    if (originalFetch) {
      ;(globalThis as any).fetch = originalFetch
    } else {
      delete (globalThis as any).fetch
    }
  })

  await t.test('request - error status code', async () => {
    const mockStream = createMockReadableStream([new Uint8Array([0x45, 0x72, 0x72])]) // "Err"
    
    const originalFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => {
      return {
        url: 'http://example.com/test',
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        body: mockStream as ReadableStream<Uint8Array>,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response
    }
    
    const result = await request({
      url: 'http://example.com/test',
      method: 'GET',
    })
    
    assert.strictEqual(result.statusCode, 404)
    assert.strictEqual(result.statusMessage, 'Not Found')
    
    // Restore fetch
    if (originalFetch) {
      ;(globalThis as any).fetch = originalFetch
    } else {
      delete (globalThis as any).fetch
    }
  })

  await t.test('request - converts headers to plain object', async () => {
    const mockStream = createMockReadableStream([new Uint8Array([0x4f, 0x4b])])
    
    const originalFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => {
      const headers = new Headers()
      headers.set('Content-Type', 'application/json')
      headers.set('Content-Length', '100')
      headers.set('X-Custom', 'value')
      
      // Create a mock Response with forEach method on headers
      const mockResponse = {
        url: 'http://example.com/test',
        status: 200,
        statusText: 'OK',
        headers: headers,
        body: mockStream as ReadableStream<Uint8Array>,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as any
      
      // Ensure headers has forEach method (which Headers should have)
      return mockResponse
    }
    
    const result = await request({
      url: 'http://example.com/test',
      method: 'GET',
    })
    
    assert.strictEqual(result.statusCode, 200)
    assert.ok(result.headers)
    assert.strictEqual(typeof result.headers, 'object')
    // Headers should be converted to plain object
    assert.ok(result.headers['Content-Type'] || result.headers['content-type'], 'Should have Content-Type header')
    assert.ok(result.headers['Content-Length'] || result.headers['content-length'], 'Should have Content-Length header')
    assert.ok(result.headers['X-Custom'] || result.headers['x-custom'], 'Should have X-Custom header')
    
    // Restore fetch
    if (originalFetch) {
      ;(globalThis as any).fetch = originalFetch
    } else {
      delete (globalThis as any).fetch
    }
  })
})
