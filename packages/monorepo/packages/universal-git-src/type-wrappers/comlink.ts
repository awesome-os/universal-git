/**
 * Type wrapper for Comlink
 * Provides type definitions and compatibility fixes for Comlink library
 */

// Define types that match Comlink's types
export type Remote<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R extends Promise<infer U> ? U : R>
    : T[K] extends Promise<infer U>
    ? Promise<U>
    : Remote<T[K]>
}

export type Endpoint = {
  postMessage(message: unknown, transfer?: readonly Transferable[]): void
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void
}

/**
 * Type-safe wrapper for Comlink.wrap that handles MessagePort compatibility
 */
export type ComlinkModule = {
  wrap<T>(endpoint: Endpoint | MessagePort): Remote<T>
  expose<T>(api: T, endpoint: Endpoint | MessagePort): void
  transferHandlers: Map<unknown, unknown>
  [key: string]: unknown
}

/**
 * Type-safe import wrapper for Comlink
 */
export async function importComlink(): Promise<ComlinkModule> {
  try {
    // Use type assertion to match our ComlinkModule type
    return await import('comlink') as unknown as ComlinkModule
  } catch {
    throw new Error('comlink module not available')
  }
}

/**
 * Type assertion helper for MessagePort to Endpoint
 * MessagePort implements Endpoint interface, but TypeScript may not recognize it
 */
export function messagePortToEndpoint(port: MessagePort): Endpoint {
  return port as unknown as Endpoint
}

