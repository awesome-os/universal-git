import { join } from '../../utils/join.ts'
import { readRef, resolveRef } from './readRef.ts'
import { writeRef, writeSymbolicRef } from './writeRef.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

/**
 * Gets the main repository gitdir from a worktree gitdir
 * 
 * Worktrees have their gitdir at `.git/worktrees/<name>`, but refs are stored
 * in the main repository's `.git/refs/` directory. This function extracts the
 * main gitdir from a worktree gitdir.
 * 
 * @param fs - File system client
 * @param worktreeGitdir - Path to worktree gitdir (e.g., `.git/worktrees/<name>`)
 * @returns Path to main repository gitdir (e.g., `.git`)
 */
export async function getMainGitdir({
  fs,
  worktreeGitdir,
}: {
  fs: FileSystemProvider
  worktreeGitdir: string
}): Promise<string> {
  // Check if this is a worktree gitdir (contains 'worktrees' in path)
  if (isWorktreeGitdir(worktreeGitdir)) {
    // Extract main gitdir by going up from worktrees/<name> to .git
    // Path format: <repo>/.git/worktrees/<name>
    // We want: <repo>/.git
    const parts = worktreeGitdir.split(/[/\\]/)
    const worktreesIndex = parts.findIndex(part => part === 'worktrees')
    if (worktreesIndex > 0) {
      // Main gitdir is everything up to (but not including) 'worktrees'
      // Use the same path separator as the original
      const separator = worktreeGitdir.includes('\\') ? '\\' : '/'
      return parts.slice(0, worktreesIndex).join(separator)
    }
  }
  // Not a worktree, return as-is
  return worktreeGitdir
}

/**
 * Checks if a gitdir is a worktree gitdir
 * 
 * @param gitdir - Path to gitdir
 * @returns true if this is a worktree gitdir
 */
export function isWorktreeGitdir(gitdir: string): boolean {
  return gitdir.includes('worktrees')
}

/**
 * Resolves a ref in worktree context
 * 
 * In worktrees, HEAD is stored in the worktree gitdir, but other refs
 * (branches, tags, etc.) are stored in the main repository gitdir.
 * This function handles the correct resolution based on the ref type.
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @param ref - Reference name (e.g., 'HEAD', 'refs/heads/main')
 * @returns Resolved OID or null if not found
 */
export async function resolveRefInWorktree({
  fs,
  gitdir,
  ref,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
}): Promise<string | null> {
  // HEAD is always in the worktree gitdir (if it's a worktree)
  // or in the main gitdir (if it's the main worktree)
  if (ref === 'HEAD' || ref === 'refs/HEAD') {
    return readRef({ fs, gitdir, ref })
  }

  // For other refs, use the main repository gitdir
  const mainGitdir = await getMainGitdir({ fs, worktreeGitdir: gitdir })
  return readRef({ fs, gitdir: mainGitdir, ref })
}

/**
 * Writes a ref in worktree context
 * 
 * HEAD is written to the worktree gitdir, while other refs are written
 * to the main repository gitdir.
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @param ref - Reference name (e.g., 'HEAD', 'refs/heads/main')
 * @param value - OID or target ref to write
 * @param symbolic - Whether this is a symbolic ref
 */
export async function writeRefInWorktree({
  fs,
  gitdir,
  ref,
  value,
  symbolic = false,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  value: string
  symbolic?: boolean
}): Promise<void> {
  // HEAD is always written to the worktree gitdir (if it's a worktree)
  // or to the main gitdir (if it's the main worktree)
  if (ref === 'HEAD' || ref === 'refs/HEAD') {
    if (symbolic) {
      return writeSymbolicRef({ fs, gitdir, ref, value })
    }
    return writeRef({ fs, gitdir, ref, value })
  }

  // For other refs, write to the main repository gitdir
  const mainGitdir = await getMainGitdir({ fs, worktreeGitdir: gitdir })
  if (symbolic) {
    return writeSymbolicRef({ fs, gitdir: mainGitdir, ref, value })
  }
  return writeRef({ fs, gitdir: mainGitdir, ref, value })
}

/**
 * Gets the worktree name from a worktree gitdir
 * 
 * @param worktreeGitdir - Path to worktree gitdir (e.g., `.git/worktrees/<name>`)
 * @returns Worktree name or null if not a worktree gitdir
 */
export function getWorktreeName(worktreeGitdir: string): string | null {
  if (!isWorktreeGitdir(worktreeGitdir)) {
    return null
  }
  
  const parts = worktreeGitdir.split(/[/\\]/)
  const worktreesIndex = parts.findIndex(part => part === 'worktrees')
  if (worktreesIndex >= 0 && worktreesIndex < parts.length - 1) {
    return parts[worktreesIndex + 1]
  }
  
  return null
}

/**
 * Checks if a ref should be worktree-specific
 * 
 * Some refs are worktree-specific (like HEAD), while others are shared
 * across all worktrees (like branches and tags).
 * 
 * @param ref - Reference name
 * @returns true if the ref should be worktree-specific
 */
export function isWorktreeSpecificRef(ref: string): boolean {
  // HEAD is worktree-specific
  if (ref === 'HEAD' || ref === 'refs/HEAD') {
    return true
  }
  
  // Refs that are typically worktree-specific (if implemented)
  // Note: In native Git, most refs are shared, but some operations
  // like bisect create worktree-specific refs
  const worktreeSpecificPrefixes = [
    'refs/bisect/', // Bisect refs (if implemented per-worktree)
  ]
  
  return worktreeSpecificPrefixes.some(prefix => ref.startsWith(prefix))
}

