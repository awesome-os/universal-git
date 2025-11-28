/**
 * Submodule Management Utilities for WorktreeBackend
 * 
 * Provides shared utilities for managing submodules across all WorktreeBackend implementations.
 * This ensures consistent submodule handling regardless of the storage backend type.
 */

import type { GitWorktreeBackend } from './GitWorktreeBackend.ts'
import type { Repository } from '../../core-utils/Repository.ts'
import { normalize } from '../../core-utils/GitPath.ts'

/**
 * Submodule cache structure for WorktreeBackend implementations
 */
export class SubmoduleCache {
  private _submoduleBackends: Map<string, GitWorktreeBackend> = new Map()
  private _submoduleLoading: Map<string, Promise<GitWorktreeBackend | null>> = new Map()

  /**
   * Get a cached submodule backend
   */
  get(path: string): GitWorktreeBackend | undefined {
    return this._submoduleBackends.get(normalize(path))
  }

  /**
   * Set a cached submodule backend
   */
  set(path: string, backend: GitWorktreeBackend): void {
    this._submoduleBackends.set(normalize(path), backend)
  }

  /**
   * Check if a submodule is currently being loaded
   */
  isLoading(path: string): boolean {
    return this._submoduleLoading.has(normalize(path))
  }

  /**
   * Get the loading promise for a submodule
   */
  getLoading(path: string): Promise<GitWorktreeBackend | null> | undefined {
    return this._submoduleLoading.get(normalize(path))
  }

  /**
   * Set a loading promise for a submodule
   */
  setLoading(path: string, promise: Promise<GitWorktreeBackend | null>): void {
    this._submoduleLoading.set(normalize(path), promise)
  }

  /**
   * Remove a loading promise (when loading completes)
   */
  removeLoading(path: string): void {
    this._submoduleLoading.delete(normalize(path))
  }

  /**
   * Clear all cached submodules
   */
  clear(): void {
    this._submoduleBackends.clear()
    this._submoduleLoading.clear()
  }

  /**
   * Get all cached submodule paths
   */
  keys(): string[] {
    return Array.from(this._submoduleBackends.keys())
  }
}

/**
 * Helper function to add a submodule to any WorktreeBackend implementation
 * 
 * This provides a standard implementation that all WorktreeBackend implementations can use.
 * 
 * @param backend - The WorktreeBackend to add the submodule to
 * @param normalizedPath - Normalized path to the submodule
 * @param submoduleRepo - Repository instance for the submodule
 * @param cache - Submodule cache instance
 */
export async function addSubmoduleToBackend(
  backend: GitWorktreeBackend,
  normalizedPath: string,
  submoduleRepo: Repository,
  cache: SubmoduleCache
): Promise<void> {
  // Normalize the path
  const path = normalize(normalizedPath)
  
  // Get the submodule's WorktreeBackend
  const submoduleWorktree = await submoduleRepo.getWorktree()
  if (!submoduleWorktree) {
    throw new Error(`Submodule at ${path} does not have a worktree`)
  }
  
  const submoduleBackend = submoduleWorktree.backend
  if (!submoduleBackend) {
    throw new Error(`Submodule at ${path} does not have a WorktreeBackend`)
  }
  
  // Set the Repository reference on the submodule's WorktreeBackend
  // This ensures the submodule can also handle its own submodules
  if ('setRepository' in submoduleBackend && typeof submoduleBackend.setRepository === 'function') {
    (submoduleBackend as any).setRepository(submoduleRepo)
  }
  
  // Cache the submodule backend
  cache.set(path, submoduleBackend)
}

/**
 * Helper function to get a submodule backend, with caching and loading support
 * 
 * @param backend - The WorktreeBackend to get the submodule from
 * @param submodulePath - Path to the submodule
 * @param cache - Submodule cache instance
 * @param loadSubmoduleBackend - Function to load a submodule backend if not cached
 */
export async function getSubmoduleFromBackend(
  backend: GitWorktreeBackend,
  submodulePath: string,
  cache: SubmoduleCache,
  loadSubmoduleBackend: (path: string) => Promise<GitWorktreeBackend | null>
): Promise<GitWorktreeBackend | null> {
  // Check cache first
  const normalizedPath = normalize(submodulePath)
  const cached = cache.get(normalizedPath)
  if (cached) {
    return cached
  }

  // Check if already loading
  if (cache.isLoading(normalizedPath)) {
    return cache.getLoading(normalizedPath)!
  }

  // Start loading
  const loadPromise = loadSubmoduleBackend(normalizedPath)
  cache.setLoading(normalizedPath, loadPromise)

  try {
    const submoduleBackend = await loadPromise
    if (submoduleBackend) {
      cache.set(normalizedPath, submoduleBackend)
    }
    return submoduleBackend
  } finally {
    cache.removeLoading(normalizedPath)
  }
}

