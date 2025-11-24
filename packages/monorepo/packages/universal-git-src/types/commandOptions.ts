import type { Repository } from '../core-utils/Repository.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'

/**
 * Base command options that are common to most Git commands
 * These options are handled by normalizeCommandArgs
 */
export interface BaseCommandOptions {
  /**
   * Repository instance (preferred way to pass context)
   * If provided, fs, gitdir, dir, and cache are extracted from it
   */
  repo?: Repository

  /**
   * File system client (required if repo is not provided)
   */
  fs?: FileSystemProvider

  /**
   * Working directory path (optional, can be derived from repo)
   */
  dir?: string

  /**
   * Git directory path (optional, can be derived from dir or repo)
   */
  gitdir?: string

  /**
   * Cache object for object storage (optional, can be derived from repo)
   */
  cache?: Record<string, unknown>

  /**
   * Whether to auto-detect config (default: true)
   */
  autoDetectConfig?: boolean
}

/**
 * Command options with a ref parameter
 * Used by commands that operate on a specific ref (branch, tag, commit)
 */
export interface CommandWithRefOptions extends BaseCommandOptions {
  /**
   * Git reference (branch, tag, commit OID, etc.)
   */
  ref: string
}

/**
 * Command options with a filepath parameter
 * Used by commands that operate on specific files
 */
export interface CommandWithFilepathOptions extends BaseCommandOptions {
  /**
   * File path relative to the working directory
   */
  filepath: string
}

/**
 * Command options with multiple filepaths
 * Used by commands that operate on multiple files
 */
export interface CommandWithFilepathsOptions extends BaseCommandOptions {
  /**
   * Array of file paths relative to the working directory
   */
  filepaths: string[]
}

/**
 * Command options with remote parameters
 * Used by commands that interact with remote repositories
 */
export interface CommandWithRemoteOptions extends BaseCommandOptions {
  /**
   * Remote name (default: 'origin')
   */
  remote?: string

  /**
   * Remote URL (optional, can be derived from config)
   */
  url?: string
}

/**
 * Helper type to extract command-specific options
 * Excludes base options that are handled by normalizeCommandArgs
 */
export type CommandSpecificOptions<T> = Omit<
  T,
  'repo' | 'fs' | 'dir' | 'gitdir' | 'cache' | 'autoDetectConfig'
>

