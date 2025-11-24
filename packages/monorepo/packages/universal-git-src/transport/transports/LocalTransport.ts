import type { Transport, TransportType } from '../Transport.ts'

/**
 * Local/InProcess transport
 * Simple in-memory transport for single-threaded or same-process communication
 * No BroadcastChannel required - uses EventEmitter-like pattern
 */
export class LocalTransport implements Transport {
  private listeners: Set<(message: unknown, sourceId?: string) => void> = new Set()
  private static transports: Map<string, LocalTransport> = new Map()
  private name: string
  
  constructor(name: string = 'default') {
    this.name = name
    LocalTransport.transports.set(name, this)
  }
  
  send(message: unknown, targetId?: string): void {
    // If targetId specified, send to specific transport
    if (targetId) {
      const target = LocalTransport.transports.get(targetId)
      if (target) {
        // Use setTimeout to make it async and avoid blocking
        setTimeout(() => {
          target.listeners.forEach(listener => {
            listener(message, this.name)
          })
        }, 0)
      }
    } else {
      // Broadcast to all transports with same name
      setTimeout(() => {
        for (const transport of LocalTransport.transports.values()) {
          if (transport.name === this.name && transport !== this) {
            transport.listeners.forEach(listener => {
              listener(message, this.name)
            })
          }
        }
      }, 0)
    }
  }
  
  onMessage(handler: (message: unknown, sourceId?: string) => void): () => void {
    this.listeners.add(handler)
    
    return () => {
      this.listeners.delete(handler)
    }
  }
  
  getType(): TransportType {
    return 'local'
  }
  
  close(): void {
    LocalTransport.transports.delete(this.name)
    this.listeners.clear()
  }
}

