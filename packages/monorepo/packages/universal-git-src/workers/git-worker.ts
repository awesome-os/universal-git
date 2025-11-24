import * as Comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs'
import type { GitWorkerAPI } from './Proxies.ts'
import { GitWorkerImpl } from './GitWorkerImpl.ts'

/**
 * Worker thread entry point
 * Exposes git operations via Comlink
 * Supports different transport mechanisms
 */
const workerImpl = new GitWorkerImpl()

// Handle unhandled errors in worker
if (typeof process !== 'undefined') {
  process.on('unhandledRejection', (error) => {
    console.error('[Worker] Unhandled rejection:', error)
    if ((error as Error).stack) {
      console.error('[Worker] Stack:', (error as Error).stack)
    }
  })
  process.on('uncaughtException', (error) => {
    console.error('[Worker] Uncaught exception:', error)
    if (error.stack) {
      console.error('[Worker] Stack:', error.stack)
    }
    process.exit(1)
  })
}

// Log worker startup
console.log('[Worker] Worker script loaded and initialized')

// Handle Node.js worker_threads (ESM and CommonJS)
// Use top-level await or synchronous initialization
async function initializeWorker() {
  try {
    // Try ESM import first (for --experimental-strip-types)
    let parentPort: any = null
    try {
      const workerThreads = await import('worker_threads')
      parentPort = workerThreads.parentPort
      console.log('[Worker] Loaded worker_threads via ESM import')
    } catch (importError) {
      // Fallback to require if import fails
      if (typeof require !== 'undefined') {
        try {
          const workerThreads = require('worker_threads')
          parentPort = workerThreads.parentPort
          console.log('[Worker] Loaded worker_threads via require')
        } catch (requireError) {
          console.error('[Worker] Failed to load worker_threads via require:', requireError)
        }
      } else {
        console.error('[Worker] require is not available and ESM import failed:', importError)
      }
    }
    
    if (parentPort) {
      // Node.js worker_threads
      console.log('[Worker] Setting up Comlink endpoint with nodeEndpoint')
      const endpoint = nodeEndpoint(parentPort)
      console.log('[Worker] Exposing GitWorkerImpl via Comlink...')
      Comlink.expose(workerImpl, endpoint)
      console.log('[Worker] Comlink endpoint exposed, ready to receive calls')
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(workerImpl)).filter(name => name !== 'constructor')
      console.log('[Worker] Available methods:', methods)
    } else {
      console.error('[Worker] parentPort is null or undefined - worker_threads not available')
      // Fall through to browser WebWorker handling
      if (typeof self !== 'undefined') {
        // Browser WebWorker
        // Check if we received a MessagePort for transport
        if ((self as any).onmessage) {
          (self as any).onmessage = (event: MessageEvent) => {
            if (event.data?.type === 'init' && event.ports?.[0]) {
              // Use MessageChannel transport
              const port = event.ports[0]
              Comlink.expose(workerImpl, port)
            }
          }
        }
        
        // Default: use standard Comlink endpoint
        Comlink.expose(workerImpl)
      }
    }
  } catch (error) {
    // Fallback if worker_threads not available
    console.error('[Worker] Worker thread error:', error)
    if ((error as Error).stack) {
      console.error('[Worker] Stack:', (error as Error).stack)
    }
  }
}

// Initialize worker (use void to handle promise)
void initializeWorker()

