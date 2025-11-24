import { parse as parseConfig, serialize as serializeConfig, type ConfigObject } from '../../core-utils/ConfigParser.ts'
import { join } from '../../utils/join.ts'
import { getMainGitdir, getWorktreeName, isWorktreeGitdir } from '../refs/worktreeRefs.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Reads the worktree config file
 * 
 * Worktrees can have their own config file at `.git/worktrees/<name>/config`
 * that overrides settings from the main repository config.
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @returns Promise resolving to the parsed worktree config object, or null if not found
 */
export async function readWorktreeConfig({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<ConfigObject | null> {
  // Check if we're in a worktree
  if (!isWorktreeGitdir(gitdir)) {
    return null // Not a worktree, no worktree config
  }

  const worktreeName = getWorktreeName(gitdir)
  if (!worktreeName) {
    return null // Couldn't extract worktree name
  }

  const mainGitdir = await getMainGitdir({ fs, worktreeGitdir: gitdir })
  const worktreeConfigPath = join(mainGitdir, 'worktrees', worktreeName, 'config')

  try {
    const buffer = await fs.read(worktreeConfigPath)
    const configBuffer = UniversalBuffer.isBuffer(buffer) ? buffer : UniversalBuffer.from(buffer as string | Uint8Array)
    return parseConfig(configBuffer)
  } catch {
    // Worktree config doesn't exist - that's okay
    return null
  }
}

/**
 * Writes the worktree config file
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @param config - Config object to write
 */
export async function writeWorktreeConfig({
  fs,
  gitdir,
  config,
}: {
  fs: FileSystemProvider
  gitdir: string
  config: ConfigObject
}): Promise<void> {
  // Check if we're in a worktree
  if (!isWorktreeGitdir(gitdir)) {
    throw new Error('Cannot write worktree config: not in a worktree')
  }

  const worktreeName = getWorktreeName(gitdir)
  if (!worktreeName) {
    throw new Error('Cannot write worktree config: could not determine worktree name')
  }

  const mainGitdir = await getMainGitdir({ fs, worktreeGitdir: gitdir })
  const worktreeDir = join(mainGitdir, 'worktrees', worktreeName)
  
  // Ensure worktree directory exists
  if (!(await fs.exists(worktreeDir))) {
    await fs.mkdir(worktreeDir, { recursive: true })
  }

  const worktreeConfigPath = join(worktreeDir, 'config')
  const serialized = serializeConfig(config)
  await fs.write(worktreeConfigPath, serialized)
}

/**
 * Checks if a worktree config file exists
 * 
 * @param fs - File system client
 * @param gitdir - Path to gitdir (can be worktree gitdir or main gitdir)
 * @returns Promise resolving to true if worktree config exists
 */
export async function hasWorktreeConfig({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<boolean> {
  if (!isWorktreeGitdir(gitdir)) {
    return false
  }

  const worktreeName = getWorktreeName(gitdir)
  if (!worktreeName) {
    return false
  }

  const mainGitdir = await getMainGitdir({ fs, worktreeGitdir: gitdir })
  const worktreeConfigPath = join(mainGitdir, 'worktrees', worktreeName, 'config')

  try {
    return await fs.exists(worktreeConfigPath)
  } catch {
    return false
  }
}

