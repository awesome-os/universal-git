/**
 * Transport interface for worker communication
 * Allows swapping different transport mechanisms without changing higher-level code
 */

export type TransportType = 'broadcast-channel' | 'message-channel' | 'local' | 'custom'

/**
 * Transport interface for worker communication
 */
export interface Transport {
  /**
   * Send a message to workers
   * @param message - Message to send
   * @param targetId - Optional target worker ID (for point-to-point) or undefined (for broadcast)
   */
  send(message: unknown, targetId?: string): void
  
  /**
   * Register a message handler
   * @param handler - Function to handle incoming messages
   * @returns Unsubscribe function
   */
  onMessage(handler: (message: unknown, sourceId?: string) => void): () => void
  
  /**
   * Get the transport type identifier
   */
  getType(): TransportType
  
  /**
   * Close the transport and clean up resources
   */
  close(): void
}

/**
 * Transport factory options
 */
export interface TransportOptions {
  type: TransportType
  name?: string // For BroadcastChannel and LocalTransport
  channel?: MessagePort // For MessageChannel
  // ... other transport-specific options
}

