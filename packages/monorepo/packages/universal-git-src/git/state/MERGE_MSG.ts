import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Reads MERGE_MSG
 */
export const readMergeMsg = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string | null> => {
  try {
    const content = await fs.read(join(gitdir, 'MERGE_MSG'), 'utf8')
    return (content as string).trim()
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return null
    }
    throw err
  }
}

/**
 * Writes MERGE_MSG
 */
export const writeMergeMsg = async ({
  fs,
  gitdir,
  message,
}: {
  fs: FileSystemProvider
  gitdir: string
  message: string
}): Promise<void> => {
  await fs.write(join(gitdir, 'MERGE_MSG'), `${message}\n`, 'utf8')
}

/**
 * Removes MERGE_MSG
 */
export const deleteMergeMsg = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<void> => {
  try {
    await fs.rm(join(gitdir, 'MERGE_MSG'))
  } catch (err) {
    if ((err as { code?: string }).code !== 'NOENT') {
      throw err
    }
  }
}

