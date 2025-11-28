export type { GitBackend } from './GitBackend.ts'
export { FilesystemBackend } from './FilesystemBackend.ts'
export { SQLiteBackend } from './SQLiteBackend.ts'
export { InMemoryBackend } from './InMemoryBackend.ts'
export { NativeGitBackend } from './NativeGitBackend.ts'
export { BackendRegistry } from './BackendRegistry.ts'
export type {
  BackendType,
  BackendFactory,
  BackendOptions,
  FilesystemBackendOptions,
  SQLiteBackendOptions,
  BlobStorageBackendOptions,
  InMemoryBackendOptions,
  IndexedDBBackendOptions,
  WebStorageBackendOptions,
  CustomBackendOptions,
  BlobStorage,
  BackendCapabilities,
  BackendMetadata,
  GitBackendWithMetadata,
  NativeGitBackendOptions,
} from './types.ts'

// Import registry and types
import type {
  BackendOptions,
  FilesystemBackendOptions,
  SQLiteBackendOptions,
  NativeGitBackendOptions,
} from './types.ts'
import type { GitBackend } from './GitBackend.ts'
import { BackendRegistry } from './BackendRegistry.ts'
import { FilesystemBackend } from './FilesystemBackend.ts'
import { SQLiteBackend } from './SQLiteBackend.ts'
import { InMemoryBackend } from './InMemoryBackend.ts'
import { NativeGitBackend } from './NativeGitBackend.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'

/**
 * Creates a GitBackend instance based on the provided options
 * 
 * This function uses the BackendRegistry to create backends dynamically.
 * Built-in backends (filesystem, sqlite) are automatically registered.
 * 
 * @param options - Backend creation options
 * @returns The backend instance
 */
export function createBackend(options: BackendOptions): GitBackend {
  // Register built-in backends if not already registered
  if (!BackendRegistry.isRegistered('filesystem')) {
    BackendRegistry.register('filesystem', (opts) => {
      const opt = opts as FilesystemBackendOptions
      if (!opt.fs || !opt.gitdir) {
        throw new Error('Filesystem backend requires fs and gitdir options')
      }
      // Normalize fs using factory pattern to ensure consistent caching and normalization
      const normalizedFs = createFileSystem(opt.fs)
      return new FilesystemBackend(normalizedFs, opt.gitdir)
    })
  }

  if (!BackendRegistry.isRegistered('sqlite')) {
    BackendRegistry.register('sqlite', (opts) => {
      const opt = opts as SQLiteBackendOptions
      if (!opt.dbPath) {
        throw new Error('SQLite backend requires dbPath option')
      }
      return new SQLiteBackend(opt.dbPath, opt.sqliteModule)
    })
  }

  if (!BackendRegistry.isRegistered('in-memory')) {
    BackendRegistry.register('in-memory', () => {
      return new InMemoryBackend()
    })
  }

  if (!BackendRegistry.isRegistered('native-git')) {
    BackendRegistry.register('native-git', (opts) => {
      const opt = opts as NativeGitBackendOptions
      if (!opt.fs || !opt.gitdir) {
        throw new Error('Native git backend requires fs and gitdir options')
      }
      // Normalize fs using factory pattern to ensure consistent caching and normalization
      const normalizedFs = createFileSystem(opt.fs)
      return new NativeGitBackend(normalizedFs, opt.gitdir, opt.workdir)
    })
  }

  // Use registry to create backend
  return BackendRegistry.createBackend(options)
}

