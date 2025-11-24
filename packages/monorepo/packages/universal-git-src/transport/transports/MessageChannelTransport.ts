import type { Transport, TransportType } from '../Transport.ts'

/**
 * MessageChannel-based transport
 * Point-to-point communication between main thread and worker
 */
export class MessageChannelTransport implements Transport {
  private port: MessagePort
  private messageHandler?: (event: MessageEvent) => void
  private unsubscribe?: () => void
  
  constructor(port: MessagePort) {
    this.port = port
    this.port.start()
  }
  
  send(message: unknown, targetId?: string): void {
    this.port.postMessage({ message, targetId, sourceId: this.getSourceId() })
  }
  
  onMessage(handler: (message: unknown, sourceId?: string) => void): () => void {
    this.messageHandler = (event: MessageEvent) => {
      const { message, sourceId } = event.data
      handler(message, sourceId)
    }
    this.port.addEventListener('message', this.messageHandler)
    
    this.unsubscribe = () => {
      if (this.messageHandler) {
        this.port.removeEventListener('message', this.messageHandler)
        this.messageHandler = undefined
      }
    }
    
    return this.unsubscribe
  }
  
  getType(): TransportType {
    return 'message-channel'
  }
  
  close(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
    }
    this.port.close()
  }
  
  private getSourceId(): string {
    // Generate a unique source ID for this transport instance
    return `message-${Math.random().toString(36).substr(2, 9)}`
  }
}

