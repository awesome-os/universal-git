import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Reads MERGE_MODE
 */
export const readMergeMode = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string | null> => {
  try {
    const content = await fs.read(join(gitdir, 'MERGE_MODE'), 'utf8')
    if (content === null || content === undefined) {
      return null
    }
    return (content as string).trim()
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return null
    }
    throw err
  }
}

/**
 * Writes MERGE_MODE
 */
export const writeMergeMode = async ({
  fs,
  gitdir,
  mode,
}: {
  fs: FileSystemProvider
  gitdir: string
  mode: string
}): Promise<void> => {
  await fs.write(join(gitdir, 'MERGE_MODE'), `${mode}\n`, 'utf8')
}

/**
 * Removes MERGE_MODE
 */
export const deleteMergeMode = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<void> => {
  try {
    await fs.rm(join(gitdir, 'MERGE_MODE'))
  } catch (err) {
    if ((err as { code?: string }).code !== 'NOENT') {
      throw err
    }
  }
}

