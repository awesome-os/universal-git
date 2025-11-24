import { getHooksPath } from './shouldRunHook.ts'
import { join } from '../../utils/join.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Reads a hook file from the repository
 * 
 * Respects the `core.hooksPath` config setting.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param hookName - Name of the hook (e.g., 'pre-commit', 'post-commit')
 * @returns Promise resolving to the hook file content as Buffer, or null if not found
 */
export async function readHook({
  fs,
  gitdir,
  hookName,
}: {
  fs: FileSystemProvider
  gitdir: string
  hookName: string
}): Promise<UniversalBuffer | null> {
  try {
    const hooksPath = await getHooksPath({ fs, gitdir })
    const hookPath = join(hooksPath, hookName)

    const data = await fs.read(hookPath)
    if (UniversalBuffer.isBuffer(data)) {
      return data
    }
    if (typeof data === 'string') {
      return UniversalBuffer.from(data, 'utf8')
    }
    return data ? UniversalBuffer.from(data as Uint8Array) : null
  } catch {
    // Hook file doesn't exist
    return null
  }
}

