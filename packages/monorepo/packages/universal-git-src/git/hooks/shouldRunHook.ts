import { getConfig } from '../config.ts'
import { join } from '../../utils/join.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import type { GitBackend } from '../../backends/GitBackend.ts'

/**
 * Determines the hooks directory path for a repository
 * 
 * Respects the `core.hooksPath` config setting. If not set, defaults to `.git/hooks`.
 * 
 * Supports both GitBackend (preferred) and legacy fs/gitdir parameters.
 * 
 * @param gitBackend - GitBackend instance (preferred)
 * @param fs - File system client (legacy, used if gitBackend not provided)
 * @param gitdir - Path to .git directory (legacy, used if gitBackend not provided)
 * @returns Promise resolving to the hooks directory path
 */
export async function getHooksPath({
  gitBackend,
  fs,
  gitdir,
}: {
  gitBackend?: GitBackend
  fs?: FileSystemProvider
  gitdir?: string
}): Promise<string> {
  // Use GitBackend if provided (preferred)
  if (gitBackend) {
    // Get config from GitBackend
    const configBuffer = await gitBackend.readConfig()
    const { parse } = await import('../../core-utils/ConfigParser.ts')
    const config = parse(configBuffer)
    const hooksPath = config.get('core.hooksPath') as string | undefined

    if (hooksPath && typeof hooksPath === 'string') {
      // If it's an absolute path, use it directly
      // If it's a relative path, we need gitdir to resolve it
      if (hooksPath.startsWith('/') || hooksPath.match(/^[A-Za-z]:/)) {
        return hooksPath
      }
      // For relative paths, we need gitdir - try to get it from GitBackend
      if (gitBackend.getGitdir) {
        const backendGitdir = await gitBackend.getGitdir()
        if (backendGitdir) {
          return join(backendGitdir, hooksPath)
        }
      }
      // Can't resolve relative path without gitdir - default to hooks
      return 'hooks'
    }

    // Default to hooks (relative to gitdir, but we can't resolve it here)
    // The actual path resolution will happen in FilesystemBackend.runHook
    return 'hooks'
  }

  // Legacy: use fs/gitdir
  if (!fs || !gitdir) {
    throw new Error('Either gitBackend or both fs and gitdir must be provided')
  }

  // Check for custom hooks path in config
  const hooksPath = await getConfig({
    fs,
    gitdir,
    path: 'core.hooksPath',
  })

  if (hooksPath && typeof hooksPath === 'string') {
    // If it's an absolute path, use it directly
    // If it's a relative path, it's relative to gitdir
    if (hooksPath.startsWith('/') || hooksPath.match(/^[A-Za-z]:/)) {
      return hooksPath
    }
    return join(gitdir, hooksPath)
  }

  // Default to .git/hooks
  return join(gitdir, 'hooks')
}

/**
 * Checks if a hook should run (exists and is executable)
 * 
 * Supports both GitBackend (preferred) and legacy fs/gitdir parameters.
 * 
 * @param gitBackend - GitBackend instance (preferred)
 * @param fs - File system client (legacy, used if gitBackend not provided)
 * @param gitdir - Path to .git directory (legacy, used if gitBackend not provided)
 * @param hookName - Name of the hook (e.g., 'pre-commit', 'post-commit')
 * @returns Promise resolving to true if hook should run, false otherwise
 */
export async function shouldRunHook({
  gitBackend,
  fs,
  gitdir,
  hookName,
}: {
  gitBackend?: GitBackend
  fs?: FileSystemProvider
  gitdir?: string
  hookName: string
}): Promise<boolean> {
  // Use GitBackend if provided (preferred)
  if (gitBackend) {
    return await gitBackend.hasHook(hookName)
  }

  // Legacy: use fs/gitdir
  if (!fs || !gitdir) {
    throw new Error('Either gitBackend or both fs and gitdir must be provided')
  }

  try {
    const hooksPath = await getHooksPath({ fs, gitdir })
    const hookPath = join(hooksPath, hookName)

    // Check if hook file exists
    try {
      const stat = await fs.lstat(hookPath)
      if (!stat || typeof stat !== 'object') {
        return false
      }

      // Check if it's a file (not a directory)
      if ('isFile' in stat && typeof stat.isFile === 'function' && !stat.isFile()) {
        return false
      }

      // In Node.js, check if file is executable
      // In browser environments, we can't check executability, so assume true if file exists
      // Note: Actual execution will fail in browser environments anyway
      return true
    } catch {
      // File doesn't exist
      return false
    }
  } catch {
    // Error checking hook - assume it shouldn't run
    return false
  }
}

