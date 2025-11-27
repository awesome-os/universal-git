import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { dirname } from "../utils/dirname.ts"
import { join, normalize } from "../core-utils/GitPath.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Find the root git directory
 *
 * Starting at `filepath`, walks upward until it finds a directory that contains a subdirectory called '.git'.
 *
 * @param {Object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} args.filepath - The file directory to start searching in.
 *
 * @returns {Promise<string>} Resolves successfully with a root git directory path
 * @throws {NotFoundError}
 *
 * @example
 * let gitroot = await git.findRoot({
 *   fs,
 *   filepath: '/tutorial/src/utils'
 * })
 * console.log(gitroot)
 *
 */
export async function findRoot({
  fs: _fs,
  filepath,
}: {
  fs?: FileSystemProvider
  filepath: string
}): Promise<string> {
  try {
    // Note: findRoot doesn't need Repository pattern since it's just searching for .git directory
    // It doesn't access repository internals, just filesystem
    if (!_fs) {
      throw new MissingParameterError('fs')
    }
    assertParameter('filepath', filepath)

    const fs = createFileSystem(_fs)
    
    // Normalize the starting path to POSIX format (Git convention)
    // This ensures consistent path handling across platforms, especially Windows
    let currentPath = normalize(filepath)
    
    // Track visited paths to avoid infinite loops (using normalized POSIX paths)
    const visited = new Set<string>()
    
    while (true) {
      // Check if we've visited this path before (infinite loop protection)
      if (visited.has(currentPath)) {
        throw new NotFoundError(`git root for ${filepath}`)
      }
      visited.add(currentPath)
      
      // Check if .git exists in current directory
      const gitPath = join(currentPath, '.git')
      if (await fs.exists(gitPath)) {
        return currentPath
      }
      
      // Move to parent directory
      const parent = normalize(dirname(currentPath))
      if (parent === currentPath) {
        // Reached filesystem root
        throw new NotFoundError(`git root for ${filepath}`)
      }
      currentPath = parent
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.findRoot'
    throw err
  }
}

