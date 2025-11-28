/**
 * Type definitions for Git Backend system
 */

import type { GitBackend } from './GitBackend.ts'
import type { UniversalBuffer } from '../utils/UniversalBuffer.ts'

/**
 * Backend type identifiers
 */
export type BackendType =
  | 'filesystem'
  | 'sqlite'
  | 'blob-storage'
  | 'in-memory'
  | 'indexeddb'
  | 'webstorage'
  | 'native-git'
  | string // Allow custom backend types

/**
 * Backend capabilities
 */
export interface BackendCapabilities {
  /**
   * Whether the backend supports transactions
   */
  transactions: boolean

  /**
   * Whether the backend supports atomic operations
   */
  atomic: boolean

  /**
   * Whether the backend is persistent
   */
  persistent: boolean

  /**
   * Whether the backend supports concurrent access
   */
  concurrent: boolean

  /**
   * Maximum recommended repository size (in bytes, or null for unlimited)
   */
  maxSize: number | null

  /**
   * Whether the backend supports streaming for large objects
   */
  streaming: boolean
}

/**
 * Backend metadata
 */
export interface BackendMetadata {
  /**
   * Backend type name
   */
  type: string

  /**
   * Backend version (if applicable)
   */
  version?: string

  /**
   * Backend capabilities
   */
  capabilities: BackendCapabilities

  /**
   * Backend-specific information
   */
  info?: Record<string, any>
}

/**
 * Extended GitBackend with metadata
 */
export interface GitBackendWithMetadata extends GitBackend {
  /**
   * Get backend metadata
   */
  getMetadata(): BackendMetadata
}

/**
 * Factory function type for creating backend instances
 */
export type BackendFactory = (options: BackendOptions) => GitBackend

/**
 * Options for creating a backend
 */
export type BackendOptions =
  | FilesystemBackendOptions
  | SQLiteBackendOptions
  | BlobStorageBackendOptions
  | InMemoryBackendOptions
  | IndexedDBBackendOptions
  | WebStorageBackendOptions
  | NativeGitBackendOptions
  | CustomBackendOptions

/**
 * Options for filesystem backend
 */
export interface FilesystemBackendOptions {
  type: 'filesystem'
  /**
   * Filesystem client - can be RawFileSystemProvider (callback or promise-based) or FileSystemProvider.
   * The factory will normalize this using createFileSystem before creating FilesystemBackend.
   */
  fs: any // RawFileSystemProvider | FileSystemProvider (typed as any, factory normalizes it)
  gitdir: string
}

/**
 * Options for native git backend
 */
export interface NativeGitBackendOptions {
  type: 'native-git'
  /**
   * Filesystem client - can be RawFileSystemProvider (callback or promise-based) or FileSystemProvider.
   * The factory will normalize this using createFileSystem before creating NativeGitBackend.
   */
  fs: any // RawFileSystemProvider | FileSystemProvider (typed as any, factory normalizes it)
  gitdir: string
  /**
   * Working directory for git commands (optional, defaults to parent of gitdir)
   */
  workdir?: string | null
}

/**
 * Options for SQLite backend
 */
export interface SQLiteBackendOptions {
  type: 'sqlite'
  dbPath: string
  sqliteModule?: any // Optional SQLite module
}

/**
 * Options for blob storage backend
 */
export interface BlobStorageBackendOptions {
  type: 'blob-storage'
  storage: BlobStorage
  bucket?: string // For S3/GCS-style storage
  container?: string // For Azure Blob Storage
  prefix?: string // Path prefix within storage
}

/**
 * Blob storage interface
 */
export interface BlobStorage {
  get(key: string): Promise<UniversalBuffer | null>
  put(key: string, data: UniversalBuffer): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
  exists?(key: string): Promise<boolean>
}

/**
 * Options for in-memory backend
 */
export interface InMemoryBackendOptions {
  type: 'in-memory'
  // No additional options needed
}

/**
 * Options for IndexedDB backend (browser-only)
 */
export interface IndexedDBBackendOptions {
  type: 'indexeddb'
  dbName?: string // Database name (default: 'git-repo')
  storeName?: string // Object store name (default: 'objects')
}

/**
 * Options for WebStorage backend (browser-only)
 */
export interface WebStorageBackendOptions {
  type: 'webstorage'
  storage?: Storage // localStorage or sessionStorage (default: localStorage)
  prefix?: string // Key prefix (default: 'git-')
}

/**
 * Options for custom backend
 */
export interface CustomBackendOptions {
  type: string // Custom backend type name
  [key: string]: any // Backend-specific options
}

