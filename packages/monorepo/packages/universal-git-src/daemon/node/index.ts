import { Socket } from 'net'
import type { TcpClient, TcpConnection, TcpConnectOptions } from '../TcpClient.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Node.js TCP connection implementation
 */
class NodeTcpConnection implements TcpConnection {
  private socket: Socket
  private closed = false

  constructor(socket: Socket) {
    this.socket = socket
  }

  async write(data: Uint8Array | UniversalBuffer): Promise<void> {
    if (this.closed) {
      throw new Error('Connection is closed')
    }
    return new Promise((resolve, reject) => {
      this.socket.write(data, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  read(): AsyncIterableIterator<Uint8Array> {
    if (this.closed) {
      throw new Error('Connection is closed')
    }
    return UniversalBuffer.fromNodeStream(this.socket)
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    return new Promise((resolve) => {
      this.socket.end(() => {
        this.socket.destroy()
        resolve()
      })
    })
  }
}

/**
 * Node.js TCP client implementation for Git daemon protocol
 */
class NodeTcpClient implements TcpClient {
  async connect(options: TcpConnectOptions): Promise<TcpConnection> {
    const { host, port, timeout = 30000 } = options

    return new Promise((resolve, reject) => {
      const socket = new Socket()
      let connected = false
      let timeoutId: NodeJS.Timeout | null = null

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          if (!connected) {
            socket.destroy()
            reject(new Error(`Connection timeout after ${timeout}ms`))
          }
        }, timeout)
      }

      // Handle connection success
      socket.once('connect', () => {
        connected = true
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        resolve(new NodeTcpConnection(socket))
      })

      // Handle connection errors
      socket.once('error', (err) => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        if (!connected) {
          reject(err)
        }
      })

      // Connect to the server
      socket.connect(port, host)
    })
  }
}

/**
 * Default TCP client instance for Node.js
 */
export const tcpClient: TcpClient = new NodeTcpClient()

export default { tcpClient }

