import { ComlinkWorker } from './ComlinkWorker.ts'
import type { Transport, TransportOptions } from '../transport/index.ts'
import { createTransport } from '../transport/index.ts'

/**
 * Manages a pool of worker threads with transport abstraction
 */
export class WorkerPool {
  private workers: ComlinkWorker[] = []
  private availableWorkers: ComlinkWorker[] = []
  private maxWorkers: number
  private workerScript: string
  private transport?: Transport | TransportOptions
  
  constructor(
    maxWorkers: number = 4,
    workerScript: string,
    transport?: Transport | TransportOptions
  ) {
    this.maxWorkers = maxWorkers
    this.workerScript = workerScript
    this.transport = transport
  }
  
  async acquire(): Promise<ComlinkWorker> {
    if (this.availableWorkers.length > 0) {
      return this.availableWorkers.pop()!
    }
    
    if (this.workers.length < this.maxWorkers) {
      try {
        const worker = new ComlinkWorker(this.workerScript, this.transport)
        this.workers.push(worker)
        return worker
      } catch (error) {
        // If worker creation fails (e.g., script not found), throw with helpful message
        throw new Error(`Failed to create worker: ${(error as Error).message}. Worker script: ${this.workerScript}`)
      }
    }
    
    // Wait for a worker to become available
    return new Promise((resolve) => {
      const checkAvailable = () => {
        if (this.availableWorkers.length > 0) {
          resolve(this.availableWorkers.pop()!)
        } else {
          setTimeout(checkAvailable, 10)
        }
      }
      checkAvailable()
    })
  }
  
  release(worker: ComlinkWorker): void {
    this.availableWorkers.push(worker)
  }
  
  /**
   * Broadcast a message to all workers using transport
   */
  broadcast(message: unknown): void {
    const transport = this.transport
      ? (typeof this.transport === 'object' && 'getType' in this.transport
          ? this.transport
          : createTransport(this.transport as TransportOptions))
      : undefined
    
    if (transport) {
      transport.send(message)
    }
  }
  
  async terminateAll(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()))
    this.workers = []
    this.availableWorkers = []
  }
  
  /**
   * Get the maximum number of workers in the pool
   */
  getMaxWorkers(): number {
    return this.maxWorkers
  }
  
  /**
   * Get the current number of active workers
   */
  getActiveWorkers(): number {
    return this.workers.length
  }
  
  /**
   * Get the number of available workers
   */
  getAvailableWorkerCount(): number {
    return this.availableWorkers.length
  }
}

