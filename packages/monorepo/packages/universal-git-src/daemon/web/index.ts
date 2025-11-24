/**
 * Browser/Web support for Git daemon protocol via WebSocket proxy
 * 
 * This implementation uses a WebSocket proxy server to bridge browser WebSocket connections
 * to TCP Git daemon servers. The proxy server must be running separately.
 * 
 * Architecture:
 * Browser (WebSocket) → Proxy Server (WebSocket ↔ TCP) → Git Daemon Server (TCP)
 */

import type { TcpClient, TcpConnection, TcpConnectOptions } from '../TcpClient.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Configuration for WebSocket TCP proxy
 */
export interface WebSocketProxyConfig {
  /**
   * WebSocket proxy server URL (e.g., 'ws://localhost:8080/git-daemon-proxy')
   * If not provided, will attempt to use default or throw error
   */
  proxyUrl?: string
}

// Global proxy configuration
let proxyConfig: WebSocketProxyConfig = {}

/**
 * Set the WebSocket proxy configuration
 */
export function setWebSocketProxyConfig(config: WebSocketProxyConfig): void {
  proxyConfig = { ...proxyConfig, ...config }
}

/**
 * Get the WebSocket proxy configuration
 */
export function getWebSocketProxyConfig(): WebSocketProxyConfig {
  return { ...proxyConfig }
}

/**
 * Browser WebSocket-based TCP connection implementation
 */
class WebSocketTcpConnection implements TcpConnection {
  private ws: WebSocket
  private messageQueue: Uint8Array[] = []
  private messageResolvers: Array<() => void> = []
  private closed = false
  private reading = false
  private readIterator: AsyncIterableIterator<Uint8Array> | null = null

  constructor(ws: WebSocket) {
    this.ws = ws

    // Handle incoming WebSocket messages
    this.ws.addEventListener('message', (event) => {
      // Check if it's a control message (JSON)
      try {
        const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
        const message = JSON.parse(text)
        
        if (message.type === 'connected') {
          // Connection established, ready to send/receive data
          return
        }
        if (message.type === 'error') {
          // Proxy error
          const error = new Error(message.message || 'Proxy error')
          this.messageQueue.push(new Uint8Array(0)) // Signal error
          this.messageResolvers.forEach(resolve => resolve())
          throw error
        }
      } catch {
        // Not JSON, treat as binary data
      }

      // Handle binary data
      if (event.data instanceof ArrayBuffer) {
        const data = new Uint8Array(event.data)
        this.messageQueue.push(data)
        this.messageResolvers.forEach(resolve => resolve())
        this.messageResolvers = []
      } else if (event.data instanceof Blob) {
        // Handle Blob asynchronously
        event.data.arrayBuffer().then((arrayBuffer) => {
          const data = new Uint8Array(arrayBuffer)
          this.messageQueue.push(data)
          this.messageResolvers.forEach(resolve => resolve())
          this.messageResolvers = []
        }).catch((error) => {
          console.error('[WebSocket TCP] Error reading Blob:', error)
        })
      } else {
        // Handle other types (Uint8Array, Buffer, etc.)
        const data = new Uint8Array(event.data)
        this.messageQueue.push(data)
        this.messageResolvers.forEach(resolve => resolve())
        this.messageResolvers = []
      }
    })

    // Handle WebSocket close
    this.ws.addEventListener('close', () => {
      this.closed = true
      this.messageResolvers.forEach(resolve => resolve())
      this.messageResolvers = []
    })

    // Handle WebSocket errors
    this.ws.addEventListener('error', (error) => {
      this.closed = true
      this.messageResolvers.forEach(resolve => resolve())
      this.messageResolvers = []
    })
  }

  async write(data: Uint8Array | UniversalBuffer): Promise<void> {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Connection is closed')
    }

    const buffer = data instanceof UniversalBuffer 
      ? data 
      : UniversalBuffer.from(data)

    return new Promise((resolve, reject) => {
      try {
        this.ws.send(buffer)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  read(): AsyncIterableIterator<Uint8Array> {
    if (this.readIterator) {
      return this.readIterator
    }

    const self = this
    this.readIterator = (async function* () {
      while (!self.closed || self.messageQueue.length > 0) {
        // Wait for data if queue is empty
        if (self.messageQueue.length === 0) {
          await new Promise<void>((resolve) => {
            if (self.closed) {
              resolve()
              return
            }
            self.messageResolvers.push(resolve)
          })
        }

        // Yield all queued messages
        while (self.messageQueue.length > 0) {
          const data = self.messageQueue.shift()!
          if (data.length > 0) {
            yield data
          }
        }

        // If closed and no more data, break
        if (self.closed && self.messageQueue.length === 0) {
          break
        }
      }
    })()

    return this.readIterator
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close()
    }
  }
}

/**
 * Browser WebSocket-based TCP client implementation
 */
class WebSocketTcpClient implements TcpClient {
  async connect(options: TcpConnectOptions): Promise<TcpConnection> {
    const { host, port } = options

    // Get proxy URL from config or use default
    const proxyUrl = proxyConfig.proxyUrl || this.getDefaultProxyUrl()

    if (!proxyUrl) {
      throw new Error(
        'WebSocket proxy URL not configured. ' +
        'Please set the proxy URL using setWebSocketProxyConfig({ proxyUrl: "ws://..." }) ' +
        'or provide it via environment variable.'
      )
    }

    // Build WebSocket URL with target host/port as query parameters
    const wsUrl = new URL(proxyUrl)
    wsUrl.searchParams.set('host', host)
    wsUrl.searchParams.set('port', String(port))

    // Create WebSocket connection
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl.toString())

      let resolved = false

      ws.addEventListener('open', () => {
        // Wait for 'connected' message from proxy
        const messageHandler = (event: MessageEvent) => {
          try {
            const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
            const message = JSON.parse(text)
            
            if (message.type === 'connected') {
              resolved = true
              ws.removeEventListener('message', messageHandler)
              resolve(new WebSocketTcpConnection(ws))
            } else if (message.type === 'error') {
              resolved = true
              ws.removeEventListener('message', messageHandler)
              reject(new Error(message.message || 'Proxy connection failed'))
            }
          } catch {
            // Not JSON, ignore (will be handled by connection)
          }
        }

        ws.addEventListener('message', messageHandler)

        // Timeout if no response
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            ws.removeEventListener('message', messageHandler)
            reject(new Error('Proxy connection timeout'))
          }
        }, 10000)
      })

      ws.addEventListener('error', () => {
        if (!resolved) {
          resolved = true
          reject(new Error('WebSocket connection failed'))
        }
      })

      ws.addEventListener('close', () => {
        if (!resolved) {
          resolved = true
          reject(new Error('WebSocket connection closed before establishing'))
        }
      })
    })
  }

  private getDefaultProxyUrl(): string | null {
    // Try to get from environment (if available in browser context)
    if (typeof process !== 'undefined' && process.env?.GIT_DAEMON_PROXY_URL) {
      return process.env.GIT_DAEMON_PROXY_URL
    }
    
    // Default to localhost proxy
    return 'ws://localhost:8080/git-daemon-proxy'
  }
}

/**
 * Browser implementation of TcpClient using WebSocket proxy
 */
export const tcpClient: TcpClient = new WebSocketTcpClient()

