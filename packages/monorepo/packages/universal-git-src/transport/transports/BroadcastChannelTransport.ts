import type { Transport, TransportType } from '../Transport.ts'
import { createBroadcastChannel } from '../../utils/BroadcastChannelPolyfill.ts'

/**
 * BroadcastChannel-based transport
 * Works across multiple workers and main thread
 */
export class BroadcastChannelTransport implements Transport {
  private channel: BroadcastChannel
  private messageHandler?: (event: MessageEvent) => void
  private unsubscribe?: () => void
  
  constructor(name: string = 'universal-git-workers') {
    this.channel = createBroadcastChannel(name)
  }
  
  send(message: unknown, targetId?: string): void {
    // BroadcastChannel doesn't support targeting, so we include targetId in message
    this.channel.postMessage({ message, targetId, sourceId: this.getSourceId() })
  }
  
  onMessage(handler: (message: unknown, sourceId?: string) => void): () => void {
    this.messageHandler = (event: MessageEvent) => {
      const { message, targetId, sourceId } = event.data
      // If targetId is specified and doesn't match, ignore
      // Otherwise, call handler
      handler(message, sourceId)
    }
    this.channel.addEventListener('message', this.messageHandler)
    
    this.unsubscribe = () => {
      if (this.messageHandler) {
        this.channel.removeEventListener('message', this.messageHandler)
        this.messageHandler = undefined
      }
    }
    
    return this.unsubscribe
  }
  
  getType(): TransportType {
    return 'broadcast-channel'
  }
  
  close(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
    }
    this.channel.close()
  }
  
  private getSourceId(): string {
    // Generate a unique source ID for this transport instance
    return `broadcast-${Math.random().toString(36).substr(2, 9)}`
  }
}

