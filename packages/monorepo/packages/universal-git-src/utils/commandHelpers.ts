/**
 * Command Helper Functions
 * 
 * Provides unified helpers for common command patterns to reduce code duplication
 * and ensure consistent type handling across commands.
 */

import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { createFileSystem } from './createFileSystem.ts'
import { join, normalize } from '../core-utils/GitPath.ts'
import { Repository } from '../core-utils/Repository.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'
import type { BaseCommandOptions } from '../types/commandOptions.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'
import { createBackend } from '../backends/index.ts'
import { createGitWorktreeBackend } from '../git/worktree/index.ts'

/**
 * Normalizes command arguments to handle repo, backend, and legacy fs/gitdir/dir patterns.
 * 
 * This unifies the common pattern where commands accept either:
 * - `repo: Repository` (preferred, modern API)
 * - `gitBackend: GitBackend` + `worktree: GitWorktreeBackend` (new advanced API)
 * - `fs` + `gitdir`/`dir` (backward compatibility - auto-creates backends)
 * 
 * **Parameter Precedence:**
 * 1. If `repo` is provided, everything is extracted from it (highest priority)
 * 2. If `gitBackend`/`worktree` are provided, they are used (and `gitdir`/`dir` are ignored)
 * 3. If only `fs`/`gitdir`/`dir` are provided, backends are auto-created from them
 * 
 * **Important Notes:**
 * - When `gitBackend` is provided, the `gitdir` parameter has no effect (gitdir is already set in the backend)
 * - When `worktree` is provided, the `dir` parameter has no effect (dir is already set in the worktree backend)
 * - The returned `fs` instance matches `repo.fs` for consistency
 * 
 * @param args - Command arguments with optional repo, gitBackend/worktree, or fs/gitdir/dir (extends BaseCommandOptions)
 * @returns Normalized arguments with repo, fs, gitdir, dir, and cache
 * 
 * @example
 * ```typescript
 * // Using repo (preferred)
 * const { repo, fs, gitdir, dir, cache } = await normalizeCommandArgs({
 *   repo: someRepo,
 *   // ... other args
 * })
 * 
 * // Using backends (new advanced API)
 * const { repo, fs, gitdir, dir, cache } = await normalizeCommandArgs({
 *   gitBackend: myGitBackend,
 *   worktree: myWorktreeBackend,
 *   // ... other args
 * })
 * 
 * // Using legacy parameters (auto-creates backends)
 * const { repo, fs, gitdir, dir, cache } = await normalizeCommandArgs({
 *   fs,
 *   dir: '/path/to/repo',
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
} & Omit<T, 'repo' | 'gitBackend' | 'worktree' | 'fs' | 'dir' | 'gitdir' | 'cache' | 'autoDetectConfig'>> {
  let repo: Repository
  let fs: FileSystemProvider
  let gitdir: string
  let dir: string | undefined
  let cache: Record<string, unknown>
  let gitBackend: GitBackend | undefined = args.gitBackend
  let worktree: GitWorktreeBackend | undefined = args.worktree

  if (args.repo) {
    // repo is provided - extract everything from it
    repo = args.repo
    
    // fs is not required when repo is provided - backends handle filesystem operations
    // Only set fs if it's explicitly needed (for legacy code paths)
    fs = args.fs ? createFileSystem(args.fs) : undefined
    gitdir = normalize(await repo.getGitdir())
    // dir is not available from repo (worktreeBackend is a black box)
    // Use args.dir if provided, otherwise undefined
    dir = args.dir ? normalize(args.dir) : undefined
    cache = repo.cache
  } else {
    // No repo provided - need to create one
    // Check if backends are provided, or if we need to auto-create them from legacy inputs
    
    if (!gitBackend && !worktree) {
      // No backends provided - need legacy inputs to auto-create backends
      if (!args.fs) {
        throw new MissingParameterError('fs')
      }
      if (!args.gitdir && !args.dir) {
        throw new MissingParameterError('dir OR gitdir')
      }
      
      // Normalize fs first - this ensures consistent FileSystemProvider instance
      fs = createFileSystem(args.fs)
      // Normalize paths to POSIX format (Git convention) for consistent handling across platforms
      const normalizedDir = args.dir ? normalize(args.dir) : undefined
      const normalizedGitdir = args.gitdir ? normalize(args.gitdir) : (normalizedDir ? normalize(join(normalizedDir, '.git')) : undefined)
      const effectiveGitdir = normalizedGitdir!
      dir = normalizedDir
      
      // Auto-create backends from legacy inputs
      // Use the same fs instance for both backends to ensure consistency
      gitBackend = createBackend({
        type: 'filesystem',
        fs,
        gitdir: effectiveGitdir,
      })
      
      // Only create worktree backend if dir is provided AND dir !== gitdir (not a bare repo)
      // For bare repos, dir === gitdir, so we skip worktree backend creation
      if (dir && dir !== effectiveGitdir) {
        worktree = createGitWorktreeBackend({ fs, dir })
      }
    } else {
      // Backends are provided - fs must be passed explicitly
      // Backends are black boxes and don't expose their internal filesystem
      if (args.fs) {
        fs = createFileSystem(args.fs)
      } else {
        throw new MissingParameterError('fs (required when using backends)')
      }
      
      // If backends are provided, gitdir/dir are ignored (already set in backends)
      // But we still need them for Repository.open() caching logic
      // Repository.open() will derive them from backends
    }
    
    cache = args.cache || {}
    const autoDetectConfig = args.autoDetectConfig !== undefined ? args.autoDetectConfig : true
    
    // Create repository with backends (if provided) or legacy inputs
    if (gitBackend) {
      // Use Repository constructor directly when backends are provided
      const { Repository } = await import('../core-utils/Repository.ts')
      repo = new Repository({
        gitBackend,
        worktreeBackend: worktree,
        cache,
        autoDetectConfig,
      })
    } else {
      // Use createRepository helper when backends are not provided
      // Normalize paths before passing to createRepository() for consistency
      const normalizedDirForOpen = dir ? normalize(dir) : undefined
      const normalizedGitdirForOpen = args.gitdir ? normalize(args.gitdir) : undefined
      const { createRepository } = await import('../core-utils/createRepository.ts')
      repo = await createRepository({
        fs,
        dir: normalizedDirForOpen,
        gitdir: normalizedGitdirForOpen,
        cache,
        autoDetectConfig,
      })
    }
    
    // Normalize paths returned from repository
    gitdir = normalize(await repo.getGitdir())
    // If worktree backend was provided, try to get dir from it
    if (!dir && worktree && worktree.getDirectory) {
      const worktreeDir = worktree.getDirectory()
      dir = worktreeDir ? normalize(worktreeDir) : undefined
    }
    // Fallback to repo.getDir() if still not set
    const repoDir = await repo.getDir()
    dir = repoDir ? normalize(repoDir) : dir
    cache = repo.cache
    
    // CRITICAL: Ensure fs matches repo.fs for consistency
    // When backends are auto-created, repo.fs should be the same instance
    // but we want to return the fs that was used (which should match repo.fs)
    const repoFs = repo.fs
    if (!repoFs) {
      throw new MissingParameterError('fs (filesystem is required. Checkout to a WorktreeBackend first.)')
    }
    fs = repoFs
  }

  const { repo: _, gitBackend: __, worktree: ___, fs: ____, dir: _____, gitdir: ______, cache: _______, autoDetectConfig: ________, ...rest } = args
  return {
    ...rest,
    repo,
    fs,
    gitdir,
    dir,
    cache,
  } as any
}
