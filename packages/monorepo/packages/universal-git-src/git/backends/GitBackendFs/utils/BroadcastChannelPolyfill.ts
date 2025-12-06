/**
 * Isomorphic BroadcastChannel polyfill
 * 
 * - Node.js: Uses EventEmitter-like pattern for single-threaded fallback
 * - Browser: Uses native BroadcastChannel API
 * - WorkerThreads: Can use MessageChannel for cross-thread communication
 */

export class BroadcastChannelPolyfill {
  private name: string
  private listeners: Set<(event: MessageEvent) => void> = new Set()
  private static channels: Map<string, BroadcastChannelPolyfill> = new Map()
  
  constructor(name: string) {
    this.name = name
    BroadcastChannelPolyfill.channels.set(name, this)
  }
  
  postMessage(message: unknown): void {
    // Broadcast to all channels with the same name
    setTimeout(() => {
      for (const channel of BroadcastChannelPolyfill.channels.values()) {
        if (channel.name === this.name && channel !== this) {
          channel.listeners.forEach(listener => {
            listener(new MessageEvent('message', { data: message }))
          })
        }
      }
    }, 0)
  }
  
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener)
  }
  
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener)
  }
  
  close(): void {
    BroadcastChannelPolyfill.channels.delete(this.name)
    this.listeners.clear()
  }
}

// Export factory function
export function createBroadcastChannel(name: string): BroadcastChannel {
  if (typeof BroadcastChannel !== 'undefined') {
    return new BroadcastChannel(name)
  }
  return new BroadcastChannelPolyfill(name) as unknown as BroadcastChannel
}

