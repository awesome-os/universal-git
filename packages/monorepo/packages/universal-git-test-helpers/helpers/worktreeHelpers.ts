/**
 * Worktree Test Helpers
 * 
 * Provides utility functions for managing worktrees in tests.
 * These helpers ensure test isolation by properly cleaning up worktrees
 * and generating unique worktree paths.
 */

// worktree is not exported correctly, use relative path
import { worktree } from '@awesome-os/universal-git-src/commands/worktree.ts'
// join is not exported as subpath, use relative path
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
// FileSystemProvider is not exported as subpath, use relative path
import type { FileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { tmpdir } from 'os'

/**
 * Clean up all worktrees except the main worktree
 *
 * This helper ensures test isolation by removing all worktrees created during tests.
 * It should be called in test teardown (try...finally blocks) to guarantee clean state.
 *
 * @param fs - File system client
 * @param dir - Main worktree directory
 * @param gitdir - Git directory path
 */
export async function cleanupWorktrees(
  fs: FileSystemProvider,
  dir: string,
  gitdir: string
): Promise<void> {
  try {
    const worktrees = (await worktree({ fs, dir, gitdir, list: true })) as Array<{ path: string }>
    for (const wt of worktrees) {
      if (wt.path !== dir) {
        // Don't remove main worktree
        try {
          await worktree({ fs, dir, gitdir, remove: true, path: wt.path, force: true })
        } catch {
          // Ignore cleanup errors (worktree may already be removed or locked)
        }
      }
    }
    // Prune any stale worktrees
    await worktree({ fs, dir, gitdir, prune: true }).catch(() => {
      // Ignore prune errors
    })
  } catch {
    // Ignore cleanup errors - tests should continue even if cleanup fails
  }
}

/**
 * Create a unique worktree path for testing
 *
 * Creates worktrees in a dedicated test directory (system temp directory)
 * to avoid polluting the project root or fixture directories.
 *
 * @param baseDir - Base directory for worktrees (used to determine relative location)
 * @param prefix - Prefix for the worktree name (default: 'worktree')
 * @returns Unique worktree path in system temp directory
 */
export function createWorktreePath(baseDir: string, prefix: string = 'worktree'): string {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`
  // Use system temp directory to avoid creating files in project root
  // This matches the pattern used by makeNodeFixture for test fixtures
  const testWorktreeDir = join(tmpdir(), 'ugit-test-worktrees')
  return join(testWorktreeDir, `${prefix}-${uniqueId}`)
}

/**
 * Commit in a worktree with proper symbolic HEAD setup
 *
 * CRITICAL: When committing in a worktree, the worktree's HEAD must be set as a symbolic ref
 * pointing to the branch. Otherwise, commits will only update the worktree's detached HEAD,
 * not the branch ref. This helper encapsulates that logic to avoid repeating it.
 *
 * @param repo - Main repository instance
 * @param worktreePath - Path to the worktree directory
 * @param message - Commit message
 * @param author - Author information (optional)
 * @param branch - Branch name (optional, will be detected from worktree if not provided)
 * @returns Promise resolving to the commit OID
 */
export async function commitInWorktree({
  repo,
  worktreePath,
  message,
  author,
  branch,
}: {
  repo: { fs: FileSystemProvider; cache: Record<string, unknown>; getGitdir(): Promise<string> }
  worktreePath: string
  message: string
  author?: { name: string; email: string; timestamp?: number; timezoneOffset?: number }
  branch?: string
}): Promise<string> {
  // Repository is not exported, use relative path from packages/test-helpers/helpers to src
  const { createRepository } = await import('@awesome-os/universal-git-src/core-utils/createRepository.ts')
  const mainGitdir = await repo.getGitdir()
  
  // Create repository for the worktree
  const worktreeRepo = await createRepository({
    fs: repo.fs!,
    dir: worktreePath,
    gitdir: mainGitdir,
    cache: repo.cache,
    autoDetectConfig: true,
  })

  // Get branch name from worktree or use provided branch
  let branchName = branch
  if (!branchName) {
    const { currentBranch } = await import('@awesome-os/universal-git-src/commands/currentBranch.ts')
    const currentBranchName = await currentBranch({
      fs: repo.fs,
      dir: worktreePath,
      gitdir: mainGitdir,
    })
    if (currentBranchName) {
      branchName = currentBranchName
    }
  }

  // CRITICAL: Set HEAD as symbolic ref if committing in worktree
  if (branchName) {
    // Ensure branch name has refs/heads/ prefix
    const fullBranchRef = branchName.startsWith('refs/heads/') 
      ? branchName 
      : `refs/heads/${branchName}`
    
    try {
      // Resolve branch ref from main gitdir (branch refs are in main gitdir, not worktree gitdir)
      // worktreeRepo.resolveRef() automatically handles this worktree context
      const branchOid = await worktreeRepo.resolveRef(fullBranchRef)
      
      // Write HEAD symbolic ref to worktree gitdir (HEAD is worktree-specific)
      // worktreeRepo.writeSymbolicRefDirect() automatically handles this worktree context
      await worktreeRepo.writeSymbolicRefDirect('HEAD', fullBranchRef, branchOid)
    } catch {
      // If branch doesn't exist yet, that's okay - it will be created by the commit
      // Still set the symbolic ref so the commit updates the branch
      await worktreeRepo.writeSymbolicRefDirect('HEAD', fullBranchRef)
    }
  }

  // Commit in worktree
  // CRITICAL: Pass worktreeRepo so commit reads HEAD from worktree gitdir
  // Repository.writeRef() will automatically route branch refs to main gitdir
  // This ensures:
  // 1. Commit reads HEAD from worktree gitdir (where we set the symbolic ref)
  // 2. Commit writes branch refs to main gitdir (via Repository.writeRef worktree handling)
  const { commit } = await import('@awesome-os/universal-git-src/commands/commit.ts')
  return await commit({
    repo: worktreeRepo,
    message,
    author,
  })
}

