/**
 * Command Helper Functions
 * 
 * Provides unified helpers for common command patterns to reduce code duplication
 * and ensure consistent type handling across commands.
 */

import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { createFileSystem } from './createFileSystem.ts'
import { join } from './join.ts'
import { Repository } from '../core-utils/Repository.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'
import type { BaseCommandOptions } from '../types/commandOptions.ts'

/**
 * Normalizes command arguments to handle both repo and fs/gitdir/dir patterns.
 * 
 * This unifies the common pattern where commands accept either:
 * - repo: Repository (preferred, modern API)
 * - fs + gitdir/dir (backward compatibility)
 * 
 * @param args - Command arguments with optional repo or fs/gitdir/dir (extends BaseCommandOptions)
 * @returns Normalized arguments with repo, fs, gitdir, dir, and cache
 * 
 * @example
 * ```typescript
 * const { repo, fs, gitdir, dir, cache } = await normalizeCommandArgs({
 *   repo: someRepo,
 *   // ... other args
 * })
 * ```
 */
export async function normalizeCommandArgs<T extends Record<string, unknown>>(
  args: BaseCommandOptions & T
): Promise<{
  repo: Repository
  fs: FileSystemProvider
  gitdir: string
  dir?: string
  cache: Record<string, unknown>
} & Omit<T, 'repo' | 'fs' | 'dir' | 'gitdir' | 'cache' | 'autoDetectConfig'>> {
  let repo: Repository
  let fs: FileSystemProvider
  let gitdir: string
  let dir: string | undefined
  let cache: Record<string, unknown>

  if (args.repo) {
    repo = args.repo
    fs = repo.fs
    gitdir = await repo.getGitdir()
    dir = await repo.getDir() || args.dir
    cache = repo.cache
  } else {
    if (!args.fs) {
      throw new MissingParameterError('fs')
    }
    if (!args.gitdir && !args.dir) {
      throw new MissingParameterError('dir OR gitdir')
    }
    fs = createFileSystem(args.fs)
    gitdir = args.gitdir || join(args.dir!, '.git')
    dir = args.dir
    cache = args.cache || {}
    const autoDetectConfig = args.autoDetectConfig !== undefined ? args.autoDetectConfig : true
    repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig })
    gitdir = await repo.getGitdir()
    cache = repo.cache
  }

  const { repo: _, fs: __, dir: ___, gitdir: ____, cache: _____, autoDetectConfig: ______, ...rest } = args
  return {
    ...rest,
    repo,
    fs,
    gitdir,
    dir,
    cache,
  } as any
}
