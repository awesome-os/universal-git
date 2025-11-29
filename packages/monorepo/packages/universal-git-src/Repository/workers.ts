import type { Repository } from './Repository.ts'
import type { Transport, TransportOptions } from '../transport/index.ts'
import { createTransport, createDefaultTransport } from '../transport/index.ts'
import { WorkerPool } from '../workers/WorkerPool.ts'
import type { ProxiedRepository } from '../workers/Proxies.ts'

/**
 * Enable worker thread support with swappable transport
 */
export function enableWorkers(
  this: Repository,
  transport?: Transport | TransportOptions,
  maxWorkers: number = 4,
  workerScript?: string
): void {
  const repo = this as any
  
  // Auto-detect worker script path if not provided
  const scriptPath = workerScript || (() => {
    // Try to resolve worker script relative to current module
    try {
      // In Node.js, try to find the compiled worker
      if (typeof require !== 'undefined') {
        const path = require('path')
        const url = require('url')
        // Get the directory of the current file
        const currentFile = url.fileURLToPath(import.meta.url || 'file://' + __filename)
        const currentDir = path.dirname(currentFile)
        const workerPath = path.join(currentDir, '../workers/git-worker.js')
        return workerPath
      }
    } catch {
      // Fallback - try to resolve from package
      try {
        if (typeof require !== 'undefined') {
          const path = require('path')
          // Try to resolve from node_modules
          const resolved = require.resolve('@awesome-os/universal-git-src/workers/git-worker.js')
          return resolved
        }
      } catch {
        // Final fallback
      }
    }
    return './workers/git-worker.js'
  })()
  // Use local transport by default (simple, no BroadcastChannel required)
  const defaultTransport = transport || createDefaultTransport(`git-repo-${repo.instanceId}`)
  
  repo._transport = typeof defaultTransport === 'object' && defaultTransport !== null && 'getType' in defaultTransport
    ? defaultTransport
    : createTransport(defaultTransport as TransportOptions)
  
  // Create worker pool with transport (transport is optional in WorkerPool constructor)
  repo._workerPool = new WorkerPool(maxWorkers, workerScript || scriptPath, repo._transport || undefined)
}

/**
 * Get the worker pool if workers are enabled
 */
export function getWorkerPool(this: Repository): WorkerPool | undefined {
  const repo = this as any
  return repo._workerPool
}

/**
 * Get the transport instance if workers are enabled
 */
export function getTransport(this: Repository): Transport | undefined {
  const repo = this as any
  return repo._transport
}

/**
 * Broadcast a message to all workers using transport
 */
export function broadcastToWorkers(this: Repository, message: unknown): void {
  const repo = this as any
  if (repo._transport) {
    repo._transport.send(message)
  } else if (repo._workerPool) {
    repo._workerPool.broadcast(message)
  }
}

/**
 * Check if workers are enabled
 */
export function hasWorkers(this: Repository): boolean {
  const repo = this as any
  return repo._workerPool !== undefined
}

/**
 * Get a proxied Repository instance for worker thread execution
 */
export async function getProxiedRepository(this: Repository): Promise<ProxiedRepository | undefined> {
  const repo = this as any
  if (!repo._workerPool) {
    return undefined
  }

  if (repo._proxiedRepository) {
    return repo._proxiedRepository
  }

  // Acquire a worker and create Repository in it
  const worker = await repo._workerPool.acquire()
  try {
    const gitdir = await this.getGitdir()
    repo._proxiedRepository = await worker.call('createRepository', {
      fs: repo._fs, // Note: fs will need to be proxied via Comlink
      dir: repo._dir,
      gitdir,
      cache: this.cache,
    })
    return repo._proxiedRepository
  } finally {
    repo._workerPool.release(worker)
  }
}

/**
 * Clean up worker resources
 */
export async function cleanupWorkers(this: Repository): Promise<void> {
  const repo = this as any
  if (repo._workerPool) {
    await repo._workerPool.terminateAll()
    repo._workerPool = undefined
  }
  if (repo._transport) {
    repo._transport.close()
    repo._transport = undefined
  }
  repo._proxiedRepository = undefined
}


