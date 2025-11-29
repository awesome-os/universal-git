import type { Repository } from './Repository.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'
import { Worktree } from '../core-utils/Worktree.ts'

/**
 * Gets the current worktree (synchronous version)
 * Returns null for bare repositories
 */
export function getWorktreeSync(this: Repository): Worktree | null {
  const repo = this as any
  
  // If we have a worktree backend, we have a worktree
  if (!repo._worktreeBackend) {
    return null // Bare repository has no worktree
  }
  
  if (!repo._worktree) {
    // Create worktree - worktreeBackend is a black box
    // Pass empty string for dir since Worktree doesn't strictly need it when worktreeBackend is provided
    // but the constructor expects it. If we can get it from backend, great.
    let dir = ''
    if (repo._worktreeBackend.getDirectory) {
      dir = repo._worktreeBackend.getDirectory() || ''
    } else if (repo._dir) {
      dir = repo._dir
    }
    
    // We need gitdir for Worktree constructor (legacy requirement)
    // Try to get it from cache or backend
    let gitdir = repo._gitdir || ''
    if (!gitdir && repo._gitBackend && 'getGitdir' in repo._gitBackend) {
      gitdir = (repo._gitBackend as any).getGitdir()
    }
    
    repo._worktree = new Worktree(this, dir, gitdir, null, repo._worktreeBackend)
  }
  return repo._worktree
}

/**
 * Gets the current worktree (async version for compatibility)
 */
export async function getWorktree(this: Repository): Promise<Worktree | null> {
  return this.getWorktreeSync()
}

