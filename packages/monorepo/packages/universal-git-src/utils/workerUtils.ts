/**
 * Utility functions for worker thread integration
 */

import type { Repository } from '../core-utils/Repository.ts'
import type { ProxiedRepository } from '../workers/Proxies.ts'

/**
 * Check if a Repository has workers enabled and return the proxied version if available
 */
export async function getRepositoryForExecution(
  repo?: Repository
): Promise<Repository | ProxiedRepository | undefined> {
  if (!repo) {
    return undefined
  }

  // If workers are enabled, try to get proxied repository
  if (repo.hasWorkers()) {
    const proxied = await repo.getProxiedRepository()
    if (proxied) {
      return proxied
    }
  }

  // Fallback to regular repository
  return repo
}

/**
 * Execute a function with either proxied or regular repository
 */
export async function executeWithRepository<T>(
  repo: Repository | ProxiedRepository | undefined,
  fn: (repo: Repository | ProxiedRepository) => Promise<T>
): Promise<T> {
  if (!repo) {
    throw new Error('Repository is required')
  }
  return fn(repo)
}

