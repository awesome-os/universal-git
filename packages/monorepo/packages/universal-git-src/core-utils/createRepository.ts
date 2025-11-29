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
import { createFileSystem } from '../utils/createFileSystem.ts'
import { normalize, join } from './GitPath.ts'
import { Repository } from './Repository.ts'
import { GitBackendFs } from '../backends/GitBackendFs/index.ts'
import { createGitWorktreeBackend } from '../git/worktree/index.ts'
import { findRoot } from '../commands/findRoot.ts'
import { NotFoundError } from '../errors/NotFoundError.ts'
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
  
  // Initialize repository if requested
  if (init) {
    // Check if already initialized
    if (!(await gitBackend.isInitialized())) {
      // Initialize backend structure
      await gitBackend.initialize()
      
      // Set initial config values
      const config = await repo.getConfig()
      if (objectFormat === 'sha256') {
        await config.set('core.repositoryformatversion', '1', 'local')
        await config.set('extensions.objectformat', 'sha256', 'local')
      } else {
        await config.set('core.repositoryformatversion', '0', 'local')
      }
      await config.set('core.filemode', 'false', 'local')
      await config.set('core.bare', bare.toString(), 'local')
      if (!bare) {
        await config.set('core.logallrefupdates', 'true', 'local')
      }
      await config.set('core.symlinks', 'false', 'local')
      await config.set('core.ignorecase', 'true', 'local')
      
      // Set HEAD to default branch
      await gitBackend.writeHEAD(`ref: refs/heads/${defaultBranch}`)
    }
  }
  
  // If worktree backend was provided, automatically checkout to it
  // This makes fs available immediately
  if (worktreeBackend) {
    // Set Repository reference on WorktreeBackend for submodule delegation
    if ('setRepository' in worktreeBackend) {
      (worktreeBackend as any).setRepository(repo)
    }
    // Automatically checkout to the provided worktree
    // This ensures fs is available immediately
    // For empty repositories, checkout will just set up the worktree without requiring a ref
    try {
      // If we are just opening an existing repository (not initializing), we should NOT
      // perform a checkout which would reset the working directory and index.
      // We just want to attach the worktree.
      await repo.checkout(worktreeBackend, { noCheckout: !init })
    } catch (err) {
      // If checkout fails (e.g., empty repo), just set up the worktree without checking out a ref
      // This allows createRepository to succeed even for empty repositories
      if (err instanceof Error && err.message.includes('Not a 40-char OID')) {
        // Empty repository - just set up the worktree without checking out
        ;(repo as any)._worktreeBackend = worktreeBackend
        const worktreeDir = worktreeBackend.getDirectory?.() || null
        if (worktreeDir) {
          ;(repo as any)._dir = worktreeDir
        }
        const { Worktree } = await import('./Worktree.ts')
        ;(repo as any)._worktree = new Worktree(repo, worktreeDir || '', null, null, worktreeBackend)
      } else {
        throw err
      }
    }
  }
  
  return repo
}

