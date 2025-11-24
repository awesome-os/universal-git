/**
 * Lists Git references matching a given prefix
 * Reads from both loose refs (.git/refs/) and packed refs (.git/packed-refs)
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param filepath - Prefix to match (e.g., 'refs/heads', 'refs/tags')
 * @returns Array of ref names (without the prefix)
 */
import { readPackedRefs } from './packedRefs.ts'
import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

/**
 * Lists all refs matching a given filepath prefix
 */
export async function listRefs({
  fs,
  gitdir,
  filepath,
}: {
  fs: FileSystemProvider
  gitdir: string
  filepath: string
}): Promise<string[]> {
  const packedMap = await readPackedRefs({ fs, gitdir })
  let files: string[] = []

  try {
    const readdirResult = await fs.readdirDeep(`${gitdir}/${filepath}`)
    files = (readdirResult as string[]).map(x => x.replace(`${gitdir}/${filepath}/`, ''))
  } catch {
    // Directory doesn't exist, that's okay
  }

  for (let key of packedMap.keys()) {
    // filter by prefix
    if (key.startsWith(filepath)) {
      // remove prefix
      key = key.replace(filepath + '/', '')
      // Don't include duplicates; the loose files have precedence anyway
      if (!files.includes(key)) {
        files.push(key)
      }
    }
  }

  // Sort them
  files.sort()
  return files
}

