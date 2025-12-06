/**
 * WebSocket-based TCP Proxy Server for Git Daemon Protocol
 * 
 * This proxy server bridges WebSocket connections (from browser) to TCP connections (to Git daemon).
 * 
 * Architecture:
 * Browser (WebSocket) → Proxy Server (WebSocket ↔ TCP) → Git Daemon Server (TCP)
 */

import type { WebSocketServer, WebSocket } from '../../type-wrappers/ws.ts'
import { importWs } from '../../type-wrappers/ws.ts'

// Constants for WebSocket readyState
const WS_OPEN = 1
const WS_CONNECTING = 0
import { Socket } from 'net'
import { createServer, Server as HttpServer } from 'http'

export type WebSocketTcpProxyOptions = {
  /**
   * Port for the WebSocket proxy server
   */
  port?: number
  
  /**
   * Host for the WebSocket proxy server (default: 'localhost')
   */
  host?: string
  
  /**
   * Path for WebSocket connections (default: '/git-daemon-proxy')
   */
  path?: string
  
  /**
   * Default Git daemon port (default: 9418)
   */
  defaultGitDaemonPort?: number
}

/**
 * WebSocket TCP Proxy Server
 * 
 * Accepts WebSocket connections from browsers and forwards them to Git daemon servers via TCP.
 */
export class WebSocketTcpProxy {
  private wsServer: WebSocketServer | null = null
  private httpServer: HttpServer | null = null
  private port: number
  private host: string
  private path: string
  private defaultGitDaemonPort: number
  private connections: Map<WebSocket, Socket> = new Map()

  constructor(options: WebSocketTcpProxyOptions = {}) {
    this.port = options.port || 8080
    this.host = options.host || 'localhost'
    this.path = options.path || '/git-daemon-proxy'
    this.defaultGitDaemonPort = options.defaultGitDaemonPort || 9418
  }

  /**
   * Start the proxy server
   */
  async start(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      this.httpServer = createServer()
      const ws = await importWs()
      const WsServer = ws.Server || ws.default.Server
      this.wsServer = new WsServer({ 
        server: this.httpServer,
        path: this.path,
      }) as WebSocketServer

      this.wsServer.on('connection', (ws: WebSocket, request) => {
        this.handleWebSocketConnection(ws, request)
      })

      this.httpServer.listen(this.port, this.host, () => {
        console.log(`[WebSocket TCP Proxy] Server listening on ws://${this.host}:${this.port}${this.path}`)
        resolve()
      })

      this.httpServer.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Stop the proxy server
   */
  async stop(): Promise<void> {
    // Close all active connections
    for (const [ws, tcpSocket] of this.connections.entries()) {
      tcpSocket.destroy()
      ws.close()
    }
    this.connections.clear()

    return new Promise((resolve) => {
      if (this.wsServer) {
        this.wsServer.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => {
              resolve()
            })
          } else {
            resolve()
          }
        })
      } else {
        resolve()
      }
    })
  }

  /**
   * Get the WebSocket URL for clients
   */
  getWebSocketUrl(): string {
    const protocol = this.host === 'localhost' || this.host === '127.0.0.1' ? 'ws' : 'wss'
    return `${protocol}://${this.host}:${this.port}${this.path}`
  }

  /**
   * Handle a new WebSocket connection
   */
  private handleWebSocketConnection(ws: WebSocket, request: any): void {
    // Parse connection parameters from query string or headers
    const url = new URL(request.url || '', `http://${request.headers.host}`)
    const targetHost = url.searchParams.get('host') || 'localhost'
    const targetPort = parseInt(url.searchParams.get('port') || String(this.defaultGitDaemonPort), 10)

    console.log(`[WebSocket TCP Proxy] New connection: ${targetHost}:${targetPort}`)

    // Create TCP connection to Git daemon server
    const tcpSocket = new Socket()
    let tcpConnected = false

    // Forward TCP data to WebSocket
    tcpSocket.on('data', (data: Buffer) => {
      if (ws.readyState === WS_OPEN) {
        ws.send(data)
      }
    })

    // Handle TCP connection close
    tcpSocket.on('close', () => {
      tcpConnected = false
      this.connections.delete(ws)
      if (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING) {
        ws.close()
      }
    })

    // Handle TCP errors
    tcpSocket.on('error', (error) => {
      console.error(`[WebSocket TCP Proxy] TCP error: ${error.message}`)
      if (!tcpConnected) {
        // Send error to WebSocket client
        if (ws.readyState === WS_OPEN) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `TCP connection failed: ${error.message}` 
          }))
          ws.close()
        }
      }
      this.connections.delete(ws)
    })

    // Forward WebSocket messages to TCP
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (tcpConnected && tcpSocket.writable) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        tcpSocket.write(buffer as any)
      }
    })

    // Handle WebSocket close
    ws.on('close', () => {
      this.connections.delete(ws)
      if (tcpSocket && !tcpSocket.destroyed) {
        tcpSocket.destroy()
      }
    })

    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error(`[WebSocket TCP Proxy] WebSocket error: ${error.message}`)
      this.connections.delete(ws)
      if (tcpSocket && !tcpSocket.destroyed) {
        tcpSocket.destroy()
      }
    })

    // Connect to Git daemon server
    tcpSocket.connect(targetPort, targetHost, () => {
      tcpConnected = true
      this.connections.set(ws, tcpSocket)
      console.log(`[WebSocket TCP Proxy] TCP connected: ${targetHost}:${targetPort}`)
      
      // Send connection success message
      if (ws.readyState === WS_OPEN) {
        ws.send(JSON.stringify({ type: 'connected' }))
      }
    })
  }
}

/**
 * Create and start a WebSocket TCP proxy server
 */
export async function createWebSocketTcpProxy(
  options?: WebSocketTcpProxyOptions
): Promise<WebSocketTcpProxy> {
  const proxy = new WebSocketTcpProxy(options)
  await proxy.start()
  return proxy
}

