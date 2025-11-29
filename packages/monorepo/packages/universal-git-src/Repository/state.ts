import type { Repository } from './Repository.ts'
import type { ObjectFormat } from '../utils/detectObjectFormat.ts'

/**
 * Checks if repository is bare
 */
export async function isBare(this: Repository): Promise<boolean> {
  const repo = this as any
  if (repo._isBare === null) {
    if (repo._gitBackend) {
      try {
        const bare = await repo._gitBackend.getConfig('core.bare')
        repo._isBare = bare === 'true' || bare === true
      } catch {
        repo._isBare = false
      }
    } else {
      repo._isBare = false
    }
  }
  return repo._isBare as boolean
}

/**
 * Gets the object format (sha1 or sha256)
 */
export async function getObjectFormat(this: Repository): Promise<ObjectFormat> {
  const repo = this as any
  if (!repo._objectFormat) {
    if (repo._gitBackend) {
      repo._objectFormat = await repo._gitBackend.getObjectFormat(repo.cache)
    } else {
      const gitdir = await this.getGitdir()
      const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
      // Use gitBackend if available, otherwise fall back to fs
      repo._objectFormat = await detectObjectFormat(
        repo._fs,
        gitdir,
        repo.cache,
        repo._gitBackend
      )
    }
  }
  return repo._objectFormat as ObjectFormat
}

/**
 * Gets the current HEAD OID
 */
export async function getHead(this: Repository): Promise<string> {
  return await (this as any)._gitBackend.readHEAD()
}


