/**
 * Git Worktree Backend - Storage abstraction for Git working directory files
 * 
 * This package provides interfaces and implementations for storing Git working directory
 * files using different storage backends (filesystem, blob storage, SQL, in-memory, etc.).
 * 
 * The working directory contains the actual project files (not Git repository data).
 * Git repository data (refs, objects, config, etc.) is handled by GitBackend.
 */

export type { GitWorktreeBackend } from './GitWorktreeBackend.ts'
export type {
  GitWorktreeBackendType,
  FilesystemGitWorktreeBackendOptions,
  BlobStorageGitWorktreeBackendOptions,
  SQLGitWorktreeBackendOptions,
  InMemoryGitWorktreeBackendOptions,
  IndexedDBGitWorktreeBackendOptions,
  GitWorktreeBackendOptions,
  GitWorktreeBackendFactory,
} from './types.ts'

export { GitWorktreeFs } from './fs/GitWorktreeFs.ts'
// Export legacy name for backward compatibility during migration
export { GitWorktreeFs as FilesystemGitWorktreeBackend } from './fs/GitWorktreeFs.ts'

import type { GitWorktreeBackend } from './GitWorktreeBackend.ts'
import type { FileSystemProvider, RawFileSystemProvider } from '../../models/FileSystem.ts'
import { GitWorktreeFs } from './fs/GitWorktreeFs.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'

/**
 * Creates a GitWorktreeBackend instance based on the provided options
 * 
 * Currently only supports filesystem backend. Future backends (S3, SQL, etc.) will be added.
 * 
 * @param options - Backend creation options
 * @param options.fs - File system client (FileSystemProvider or RawFileSystemProvider)
 * @param options.dir - Working directory path
 * @returns The backend instance
 */
export function createGitWorktreeBackend(options: {
  fs: FileSystemProvider | RawFileSystemProvider
  dir: string
}): GitWorktreeBackend {
  // Normalize filesystem using factory pattern to ensure consistent caching and normalization
  const normalizedFs = createFileSystem(options.fs)
  return new GitWorktreeFs(normalizedFs, options.dir)
}

