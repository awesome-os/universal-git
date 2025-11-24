import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Reads ORIG_HEAD OID
 */
export const readOrigHead = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string | null> => {
  try {
    const content = await fs.read(join(gitdir, 'ORIG_HEAD'), 'utf8')
    return (content as string).trim()
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return null
    }
    throw err
  }
}

/**
 * Writes ORIG_HEAD OID
 */
export const writeOrigHead = async ({
  fs,
  gitdir,
  oid,
}: {
  fs: FileSystemProvider
  gitdir: string
  oid: string
}): Promise<void> => {
  await fs.write(join(gitdir, 'ORIG_HEAD'), `${oid}\n`, 'utf8')
}

/**
 * Removes ORIG_HEAD
 */
export const deleteOrigHead = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<void> => {
  try {
    await fs.rm(join(gitdir, 'ORIG_HEAD'))
  } catch (err) {
    if ((err as { code?: string }).code !== 'NOENT') {
      throw err
    }
  }
}

