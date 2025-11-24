import type { GitWorktreeBackend } from './GitWorktreeBackend.ts'
import type { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Supported Git worktree backend types
 */
export type GitWorktreeBackendType = 'filesystem' | 'blob-storage' | 'sql' | 'in-memory' | 'indexeddb'

/**
 * Options for FilesystemGitWorktreeBackend
 */
export interface FilesystemGitWorktreeBackendOptions {
  /** Base directory for working directory files */
  dir: string
}

/**
 * Options for BlobStorageGitWorktreeBackend
 */
export interface BlobStorageGitWorktreeBackendOptions {
  /** Blob storage client (S3, Azure Blob, GCS, etc.) */
  storage: {
    get(key: string): Promise<UniversalBuffer | null>
    put(key: string, data: UniversalBuffer): Promise<void>
    delete(key: string): Promise<void>
    list(prefix: string): Promise<string[]>
  }
  /** Storage bucket/container name */
  bucket: string
  /** Optional prefix for all paths */
  prefix?: string
}

/**
 * Options for SQLGitWorktreeBackend
 */
export interface SQLGitWorktreeBackendOptions {
  /** SQL database connection */
  db: {
    query(sql: string, params?: unknown[]): Promise<unknown[]>
    execute(sql: string, params?: unknown[]): Promise<void>
  }
  /** Optional table name prefix */
  tablePrefix?: string
}

/**
 * Options for InMemoryGitWorktreeBackend
 */
export interface InMemoryGitWorktreeBackendOptions {
  /** Optional initial file tree */
  initialFiles?: Map<string, UniversalBuffer | string>
}

/**
 * Options for IndexedDBGitWorktreeBackend (browser-only)
 */
export interface IndexedDBGitWorktreeBackendOptions {
  /** IndexedDB database name */
  dbName: string
  /** Optional database version */
  version?: number
}

/**
 * Union type for all Git worktree backend options
 */
export type GitWorktreeBackendOptions =
  | FilesystemGitWorktreeBackendOptions
  | BlobStorageGitWorktreeBackendOptions
  | SQLGitWorktreeBackendOptions
  | InMemoryGitWorktreeBackendOptions
  | IndexedDBGitWorktreeBackendOptions

/**
 * Factory function type for creating Git worktree backends
 */
export type GitWorktreeBackendFactory = (
  options: GitWorktreeBackendOptions
) => GitWorktreeBackend


