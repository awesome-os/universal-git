import type { Repository } from './Repository.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'
import { join } from '../core-utils/GitPath.ts'
import { findRoot } from '../commands/findRoot.ts'

/**
 * Gets the git directory
 * 
 * If the git directory is not already cached, it tries to determine it from:
 * 1. The GitBackend (if it exposes getGitdir)
 * 2. The working directory (by finding the .git folder)
 */
export async function getGitdir(this: Repository): Promise<string> {
  // Access private property via type assertion or public getter if available
  // Since we are extracting methods, we assume 'this' is bound to Repository instance
  const repo = this as any
  
  if (repo._gitdir) {
    return repo._gitdir
  }
  
  // Use gitBackend if available
  if (repo._gitBackend) {
    // Check if backend is GitBackendFs which exposes getGitdir
    // We can't import GitBackendFs here easily due to circular deps, so check property
    if ('getGitdir' in repo._gitBackend && typeof repo._gitBackend.getGitdir === 'function') {
      repo._gitdir = repo._gitBackend.getGitdir()
      return repo._gitdir
    }
  }
  
  // Fallback: derive from dir if available (legacy support)
  if (repo._dir && repo._fs) {
    // Find .git directory
    try {
      const root = await findRoot({ fs: repo._fs, filepath: repo._dir })
      repo._gitdir = join(root, '.git')
      return repo._gitdir
    } catch (e) {
      // Ignore error and fall through
    }
  }
  
  // If we can't determine gitdir, we might be using a non-fs backend that doesn't expose it
  // In that case, return a placeholder or throw
  // For now, throw to match previous behavior
  throw new Error('Cannot determine gitdir: neither dir nor gitdir provided, and gitBackend does not provide gitdir')
}

