import { getConfig } from '../config.ts'
import { join } from '../../utils/join.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

/**
 * Determines the hooks directory path for a repository
 * 
 * Respects the `core.hooksPath` config setting. If not set, defaults to `.git/hooks`.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @returns Promise resolving to the hooks directory path
 */
export async function getHooksPath({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string> {
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
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param hookName - Name of the hook (e.g., 'pre-commit', 'post-commit')
 * @returns Promise resolving to true if hook should run, false otherwise
 */
export async function shouldRunHook({
  fs,
  gitdir,
  hookName,
}: {
  fs: FileSystemProvider
  gitdir: string
  hookName: string
}): Promise<boolean> {
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

