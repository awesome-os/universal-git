import * as Comlink from 'comlink'
import type { Repository } from '../core-utils/Repository.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'

/**
 * Proxied Repository for worker threads
 * All Repository methods are automatically proxied via Comlink
 * This is the recommended approach - proxy the entire Repository
 */
export type ProxiedRepository = Comlink.Remote<Repository>

/**
 * Proxied GitBackend for worker threads
 * All GitBackend methods are automatically proxied via Comlink
 */
export type ProxiedGitBackend = Comlink.Remote<GitBackend>

/**
 * Proxied GitWorktreeBackend for worker threads
 * All GitWorktreeBackend methods are automatically proxied via Comlink
 */
export type ProxiedGitWorktreeBackend = Comlink.Remote<GitWorktreeBackend>

/**
 * Worker API that exposes Repository and backend instances
 * Supports both Repository-level and Backend-level proxying
 */
export interface GitWorkerAPI {
  /**
   * Creates a Repository instance in the worker thread
   * Returns a Comlink proxy to the Repository
   * This is the recommended approach for most use cases
   */
  createRepository(options: RepositoryOptions): Promise<ProxiedRepository>
  
  /**
   * Creates a GitBackend instance in the worker thread
   * Returns a Comlink proxy to the backend
   * Use this for backend-level proxying
   */
  createGitBackend(options: GitBackendOptions): Promise<ProxiedGitBackend>
  
  /**
   * Creates a GitWorktreeBackend instance in the worker thread
   * Returns a Comlink proxy to the backend
   * Use this for backend-level proxying
   */
  createGitWorktreeBackend(options: GitWorktreeBackendOptions): Promise<ProxiedGitWorktreeBackend>
  
  /**
   * Health check
   */
  ping(): Promise<'pong'>
  
  /**
   * Checkout subdirectories in worker thread
   * Used for multi-worker sparse checkout
   */
  checkoutSubdirectories(options: CheckoutSubdirectoriesOptions): Promise<CheckoutSubdirectoriesResult>
}

/**
 * Options for checking out subdirectories in worker
 */
export interface CheckoutSubdirectoriesOptions {
  // fs is not passed - workers use their own Node.js fs module
  dir: string
  gitdir: string
  tasks: Array<{
    path: string
    treeOid: string
    files: Array<{ path: string; oid: string; mode: string }>
  }>
  cache?: Record<string, unknown>
  workerId?: string
}

/**
 * Result from checking out subdirectories
 */
export interface CheckoutSubdirectoriesResult {
  processedFiles: number
  processedDirectories: number
  indexEntries?: Array<{
    filepath: string
    oid: string
    stats: unknown
    stage: number
  }>
  errors?: Array<{ path: string; error: string }>
}

/**
 * Options for creating a Repository in worker thread
 */
export interface RepositoryOptions {
  fs?: unknown // FileSystemProvider - will be serialized
  dir?: string
  gitdir?: string
  cache?: Record<string, unknown>
}

/**
 * Options for creating a GitBackend in worker thread
 */
export interface GitBackendOptions {
  type?: 'filesystem' | 'sqlite' | 'in-memory'
  fs?: unknown // FileSystemProvider - will be serialized
  gitdir?: string
  dbPath?: string // For SQLite
}

/**
 * Options for creating a GitWorktreeBackend in worker thread
 */
export interface GitWorktreeBackendOptions {
  fs?: unknown // FileSystemProvider - will be serialized
  dir: string
}

