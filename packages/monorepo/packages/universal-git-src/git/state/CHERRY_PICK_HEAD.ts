import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Reads CHERRY_PICK_HEAD OID
 */
export const readCherryPickHead = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<string | null> => {
  try {
    const content = await fs.read(join(gitdir, 'CHERRY_PICK_HEAD'), 'utf8')
    return (content as string).trim()
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return null
    }
    throw err
  }
}

/**
 * Writes CHERRY_PICK_HEAD OID
 */
export const writeCherryPickHead = async ({
  fs,
  gitdir,
  oid,
}: {
  fs: FileSystemProvider
  gitdir: string
  oid: string
}): Promise<void> => {
  await fs.write(join(gitdir, 'CHERRY_PICK_HEAD'), `${oid}\n`, 'utf8')
}

/**
 * Removes CHERRY_PICK_HEAD
 */
export const deleteCherryPickHead = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<void> => {
  try {
    await fs.rm(join(gitdir, 'CHERRY_PICK_HEAD'))
  } catch (err) {
    if ((err as { code?: string }).code !== 'NOENT') {
      throw err
    }
  }
}

