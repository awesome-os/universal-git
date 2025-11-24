import { UniversalBuffer } from '../utils/UniversalBuffer.ts'

/**
 * TCP connection interface for Git daemon protocol
 */
export interface TcpConnection {
  /**
   * Write data to the TCP connection
   */
  write(data: Uint8Array | UniversalBuffer): Promise<void>

  /**
   * Read data from the TCP connection as an async iterable
   */
  read(): AsyncIterableIterator<Uint8Array>

  /**
   * Close the TCP connection
   */
  close(): Promise<void>
}

/**
 * Progress event emitted during TCP operations
 */
export type GitTcpProgressEvent = {
  phase: string
  loaded: number
  total: number
}

/**
 * Callback for progress updates during TCP operations
 */
export type TcpProgressCallback = (progress: GitTcpProgressEvent) => void | Promise<void>

/**
 * TCP connection options
 */
export type TcpConnectOptions = {
  host: string
  port: number
  onProgress?: TcpProgressCallback
  timeout?: number
}

/**
 * TCP client interface for Git daemon protocol
 */
export interface TcpClient {
  /**
   * Connect to a TCP server
   */
  connect(options: TcpConnectOptions): Promise<TcpConnection>
}

