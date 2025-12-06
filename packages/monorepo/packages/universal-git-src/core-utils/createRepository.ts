/**
 * Helper function to create a Repository instance from filesystem paths
 * 
 * This is a convenience function for creating backends from fs/dir/gitdir
 * and then creating a Repository instance. For direct control, create backends
 * yourself and pass them to the Repository constructor.
 * 
 * @param options - Repository creation options
 * @param options.fs - FileSystemProvider instance (required)
 * @param options.dir - Working directory (optional, for non-bare repos)
 * @param options.gitdir - Git directory path (optional, defaults to dir/.git)
 * @param options.cache - Cache object for performance (optional)
 * @param options.systemConfigPath - Explicit path to system git config (optional)
 * @param options.globalConfigPath - Explicit path to global git config (optional)
 * @param options.autoDetectConfig - Auto-detect system/global config paths (default: true)
 * @param options.ignoreSystemConfig - Skip auto-detection of system/global config (default: false)
 * @param options.init - Initialize repository if it doesn't exist (default: false)
 * @param options.bare - Create a bare repository (default: false)
 * @param options.defaultBranch - Default branch name (default: 'master')
 * @param options.objectFormat - Object format ('sha1' or 'sha256', default: 'sha1')
 * @returns Repository instance
 * 
 * @example
 * ```typescript
 * // Create repository from filesystem paths
 * const repo = await createRepository({
 *   fs,
 *   dir: '/path/to/repo',
 *   cache: {}
 * })
 * 
 * // Or create backends yourself for more control
 * const gitBackend = new GitBackendFs(fs, gitdir)
 * const worktreeBackend = new GitWorktreeFs(fs, dir)
 * const repo = new Repository({
 *   gitBackend,
 *   worktreeBackend,
 *   cache: {}
 * })
 * ```
 */
import { createFileSystem } from '../git/backends/GitBackendFs/utils/createFileSystem.ts'
import { normalize, join } from './GitPath.ts'
import { Repository } from './Repository.ts'
import { GitBackendFs } from '../git/backends/GitBackendFs/GitBackendFs.ts'
import { createGitWorktreeBackend } from '../git/worktree/index.ts'
import { findRoot } from '../git/backends/GitBackendFs/commands/findRoot.ts'
import { NotFoundError } from '../git/errors/NotFoundError.ts'
import type { FileSystemProvider, RawFileSystemProvider } from '../models/FileSystem.ts'

export async function createRepository(options: {
  fs: FileSystemProvider | RawFileSystemProvider
  dir?: string
  gitdir?: string
  cache?: Record<string, unknown>
  systemConfigPath?: string
  globalConfigPath?: string
  autoDetectConfig?: boolean
  ignoreSystemConfig?: boolean
  init?: boolean
  bare?: boolean
  defaultBranch?: string
  objectFormat?: 'sha1' | 'sha256'
}): Promise<Repository> {
  const {
    fs: inputFs,
    dir,
    gitdir: providedGitdir,
    cache = {},
    systemConfigPath,
    globalConfigPath,
    autoDetectConfig = true,
    ignoreSystemConfig = false,
    init = false,
    bare = false,
    defaultBranch = 'master',
    objectFormat = 'sha1',
  } = options

  // Normalize fs
  const fs = createFileSystem(inputFs)
  
  // Normalize dir first to POSIX format (Git convention)
  const normalizedDir = dir ? normalize(dir) : undefined
  
  // Determine gitdir
  let finalGitdir: string
  if (providedGitdir) {
    finalGitdir = normalize(providedGitdir)
  } else if (normalizedDir) {
    // When only dir is provided: gitdir = dir/.git
    // CRITICAL: If init is true, NEVER call findRoot - always create new repo at dir/.git
    // This prevents accidentally finding and modifying a parent directory's .git folder
    if (init) {
      // Always create new repository at dir/.git when init is true
      finalGitdir = normalize(join(normalizedDir, '.git'))
    } else {
      // Check if dir itself is a bare repo (has config file directly)
      const configPath = join(normalizedDir, 'config')
      const isBare = await fs.exists(configPath)
      if (isBare) {
        finalGitdir = normalizedDir
      } else {
        // Find .git directory by walking up from dir
        // WARNING: This can find a parent directory's .git folder
        // Only use this when init is false and we're sure we want to find an existing repo
        try {
          const root = await findRoot({ fs, filepath: normalizedDir })
          finalGitdir = normalize(join(root, '.git'))
        } catch (err) {
          if (err instanceof NotFoundError) {
            throw new NotFoundError(`Not a git repository: ${normalizedDir}`)
          } else {
            throw err
          }
        }
      }
    }
  } else {
    throw new Error("Either 'dir' or 'gitdir' is required.")
  }
  
  // Create GitBackend
  const gitBackend = new GitBackendFs(fs, finalGitdir)
  
  // Create WorktreeBackend if dir is provided and it's not a bare repo
  let worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend | undefined
  if (normalizedDir && normalizedDir !== finalGitdir) {
    // Not a bare repo - create worktree backend
    worktreeBackend = createGitWorktreeBackend({ fs, dir: normalizedDir })
  }
  
  // Create Repository instance
  const repo = new Repository({
    gitBackend,
    worktreeBackend,
    cache,
    systemConfigPath,
    globalConfigPath,
    autoDetectConfig: autoDetectConfig && !ignoreSystemConfig,
  })

  // Set private fields for internal use (bypassing getters that throw)
  ;(repo as any).__fs = fs
  ;(repo as any).__dir = normalizedDir || null
  ;(repo as any).__gitdir = finalGitdir

  // Initialize repository if requested
  if (init) {
    await repo.init({ defaultBranch, objectFormat })
  }
  
  // If worktree backend was provided, we might want to ensure the worktree is usable
  // But strictly speaking, createRepository creates a Repo instance.
  // It shouldn't necessarily checkout files unless requested.
  // The only setup needed is ensuring internal references.
  // Repository constructor handles setRepository.
  // The catch block handling empty repos was trying to compensate for checkout failure.
  // Since we rely on Repository constructor for setup, we can skip checkout here.
  
  return repo
}

