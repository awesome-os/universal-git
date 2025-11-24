import { getConfig, setConfig } from '../config.ts'
import { readWorktreeConfig, writeWorktreeConfig, hasWorktreeConfig } from './worktreeConfig.ts'
import { isWorktreeGitdir } from '../refs/worktreeRefs.ts'
import { parse as parseConfig, serialize as serializeConfig, type ConfigObject } from '../../core-utils/ConfigParser.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Gets branch tracking configuration for a branch
 * 
 * In worktrees, branch tracking can be stored in the worktree config,
 * which overrides the main repository config. This function checks
 * worktree config first, then falls back to main repo config.
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @param branchName - Branch name (without refs/heads/ prefix)
 * @returns Promise resolving to tracking config object with remote and merge, or null if not set
 */
export async function getBranchTracking({
  fs,
  gitdir,
  branchName,
}: {
  fs: FileSystemProvider
  gitdir: string
  branchName: string
}): Promise<{ remote: string; merge: string } | null> {
  // Check worktree config first (if we're in a worktree)
  if (isWorktreeGitdir(gitdir)) {
    const worktreeConfig = await readWorktreeConfig({ fs, gitdir })
    if (worktreeConfig) {
      const remote = worktreeConfig.get(`branch.${branchName}.remote`) as string | undefined
      const merge = worktreeConfig.get(`branch.${branchName}.merge`) as string | undefined
      if (remote && merge) {
        return { remote, merge }
      }
    }
  }

  // Fall back to main repository config
  const remote = (await getConfig({ fs, gitdir, path: `branch.${branchName}.remote` })) as string | undefined
  const merge = (await getConfig({ fs, gitdir, path: `branch.${branchName}.merge` })) as string | undefined

  if (remote && merge) {
    return { remote, merge }
  }

  return null
}

/**
 * Sets branch tracking configuration for a branch
 * 
 * In worktrees, branch tracking is stored in the worktree config.
 * In the main worktree, it's stored in the main repository config.
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @param branchName - Branch name (without refs/heads/ prefix)
 * @param remote - Remote name (e.g., 'origin')
 * @param merge - Merge ref (e.g., 'refs/heads/main')
 */
export async function setBranchTracking({
  fs,
  gitdir,
  branchName,
  remote,
  merge,
}: {
  fs: FileSystemProvider
  gitdir: string
  branchName: string
  remote: string
  merge: string
}): Promise<void> {
  // If we're in a worktree, write to worktree config
  if (isWorktreeGitdir(gitdir)) {
    let worktreeConfig = await readWorktreeConfig({ fs, gitdir })
    if (!worktreeConfig) {
      // Create empty config if it doesn't exist
      const { parse: parseConfig } = await import('../../core-utils/ConfigParser.ts')
      worktreeConfig = parseConfig(UniversalBuffer.alloc(0))
    }

    worktreeConfig.set(`branch.${branchName}.remote`, remote)
    worktreeConfig.set(`branch.${branchName}.merge`, merge)

    await writeWorktreeConfig({ fs, gitdir, config: worktreeConfig })
  } else {
    // Main worktree - write to main repository config
    await setConfig({ fs, gitdir, path: `branch.${branchName}.remote`, value: remote })
    await setConfig({ fs, gitdir, path: `branch.${branchName}.merge`, value: merge })
  }
}

/**
 * Removes branch tracking configuration for a branch
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @param branchName - Branch name (without refs/heads/ prefix)
 */
export async function removeBranchTracking({
  fs,
  gitdir,
  branchName,
}: {
  fs: FileSystemProvider
  gitdir: string
  branchName: string
}): Promise<void> {
  // If we're in a worktree, remove from worktree config
  if (isWorktreeGitdir(gitdir)) {
    const worktreeConfig = await readWorktreeConfig({ fs, gitdir })
    if (worktreeConfig) {
      worktreeConfig.set(`branch.${branchName}.remote`, null)
      worktreeConfig.set(`branch.${branchName}.merge`, null)
      await writeWorktreeConfig({ fs, gitdir, config: worktreeConfig })
    }
  } else {
    // Main worktree - remove from main repository config
    await setConfig({ fs, gitdir, path: `branch.${branchName}.remote`, value: null })
    await setConfig({ fs, gitdir, path: `branch.${branchName}.merge`, value: null })
  }
}

