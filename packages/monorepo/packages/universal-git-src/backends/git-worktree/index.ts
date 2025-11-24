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

export { FilesystemGitWorktreeBackend } from './FilesystemGitWorktreeBackend.ts'


