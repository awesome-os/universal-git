/**
 * Type wrapper for ws (WebSocket library)
 * Provides type definitions when the package is not installed or types are incompatible
 */

export type WebSocketServer = {
  on(event: 'connection', listener: (ws: WebSocket, req: unknown) => void): WebSocketServer
  on(event: 'error', listener: (error: Error) => void): WebSocketServer
  on(event: 'listening', listener: () => void): WebSocketServer
  close(callback?: () => void): void
  address(): { port: number; family: string; address: string } | null
  [key: string]: unknown
}

export type WebSocket = {
  readonly readyState: number
  readonly OPEN: number
  readonly CLOSED: number
  send(data: string | Buffer | ArrayBuffer | Buffer[], callback?: (error?: Error) => void): void
  on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): WebSocket
  on(event: 'close', listener: () => void): WebSocket
  on(event: 'error', listener: (error: Error) => void): WebSocket
  close(code?: number, reason?: string): void
  [key: string]: unknown
}

export type WsModule = {
  Server: new (options?: unknown) => WebSocketServer
  WebSocket: new (address: string, protocols?: string | string[], options?: unknown) => WebSocket
  default: {
    Server: new (options?: unknown) => WebSocketServer
    WebSocket: new (address: string, protocols?: string | string[], options?: unknown) => WebSocket
  }
}

/**
 * Type-safe import wrapper for ws
 */
export async function importWs(): Promise<WsModule> {
  try {
    // Use dynamic import with type assertion
    return await import('ws') as unknown as WsModule
  } catch {
    // Return a stub type that will cause runtime errors if used
    throw new Error('ws module not available')
  }
}

/**
 * Type-safe static import for ws (when used in non-dynamic contexts)
 */
export type WsStatic = typeof import('ws')

