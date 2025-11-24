import type { Remote, Endpoint } from '../type-wrappers/comlink.ts'
import { importComlink, messagePortToEndpoint } from '../type-wrappers/comlink.ts'
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs'
import { Worker } from 'worker_threads'
import type { GitWorkerAPI } from './Proxies.ts'
import type { Transport, TransportOptions } from '../transport/index.ts'
import { createTransport } from '../transport/index.ts'

/**
 * Comlink-based worker wrapper for git operations
 * Supports swappable transport mechanisms
 */
export class ComlinkWorker {
  private worker: Worker
  private endpoint: Endpoint
  private api: Remote<GitWorkerAPI>
  private transport?: Transport
  private isTerminated: boolean = false
  private workerId: string
  
  constructor(
    workerScript: string,
    transport?: Transport | TransportOptions
  ) {
    this.workerId = `worker-${Math.random().toString(36).substr(2, 9)}`
    this.worker = new Worker(workerScript, {
      // Worker options
    })
    
    // Set up transport if provided
    if (transport) {
      this.transport = typeof transport === 'object' && 'getType' in transport
        ? transport
        : createTransport(transport as TransportOptions)
      
      // Set up transport message handling
      this.transport.onMessage((message, sourceId) => {
        // Handle transport messages if needed
        // This can be used for coordination between workers
      })
    }
    
    // Initialize Comlink endpoint asynchronously
    this._initializeComlink()
  }

  private async _initializeComlink(): Promise<void> {
    // Set up Comlink endpoint
    // Can use transport if available, otherwise use nodeEndpoint
    const Comlink = await importComlink()
    if (this.transport && this.transport.getType() === 'message-channel') {
      // Use MessageChannel transport for Comlink
      const channel = new MessageChannel()
      this.worker.postMessage({ type: 'init', port: channel.port2 }, [channel.port2] as unknown as readonly import('worker_threads').Transferable[])
      this.endpoint = messagePortToEndpoint(channel.port1)
      this.api = Comlink.wrap<GitWorkerAPI>(this.endpoint)
    } else {
      // Default: use nodeEndpoint for Node.js worker_threads
      const endpoint = nodeEndpoint(this.worker) as Endpoint
      this.endpoint = endpoint
      this.api = Comlink.wrap<GitWorkerAPI>(endpoint)
    }
  }
  
  async call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (this.isTerminated) {
      throw new Error('Worker has been terminated')
    }
    return (this.api as any)[method](...args) as Promise<T>
  }
  
  /**
   * Get the worker API directly
   */
  getAPI(): Remote<GitWorkerAPI> {
    if (this.isTerminated) {
      throw new Error('Worker has been terminated')
    }
    return this.api
  }
  
  getTransport(): Transport | undefined {
    return this.transport
  }
  
  getWorkerId(): string {
    return this.workerId
  }
  
  terminate(): void {
    if (!this.isTerminated) {
      this.transport?.close()
      this.worker.terminate()
      this.isTerminated = true
    }
  }
}

