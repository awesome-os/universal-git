import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Reads MERGE_HEAD OID
 */
export const readMergeHead = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string | null> => {
  try {
    const content = await fs.read(join(gitdir, 'MERGE_HEAD'), 'utf8')
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
 * Writes MERGE_HEAD OID
 */
export const writeMergeHead = async ({
  fs,
  gitdir,
  oid,
}: {
  fs: FileSystemProvider
  gitdir: string
  oid: string
}): Promise<void> => {
  await fs.write(join(gitdir, 'MERGE_HEAD'), `${oid}\n`, 'utf8')
}

/**
 * Removes MERGE_HEAD
 */
export const deleteMergeHead = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<void> => {
  try {
    await fs.rm(join(gitdir, 'MERGE_HEAD'))
  } catch (err) {
    if ((err as { code?: string }).code !== 'NOENT') {
      throw err
    }
  }
}

