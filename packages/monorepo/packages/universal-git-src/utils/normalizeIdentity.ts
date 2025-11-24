import { getConfigValue } from './configAccess.ts'
import { assignDefined } from './assignDefined.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { Author, CommitObject } from "../models/GitCommit.ts"

/**
 * Unified identity normalization for author and committer
 * Reduces redundancy between normalizeAuthorObject and normalizeCommitterObject
 */
export async function normalizeIdentity({
  fs,
  gitdir,
  provided,
  fallback,
  commit,
  type = 'author',
}: {
  fs: FileSystemProvider
  gitdir: string
  provided?: Partial<Author>
  fallback?: Partial<Author>
  commit?: CommitObject
  type?: 'author' | 'committer'
}): Promise<Partial<Author> | undefined> {
  const timestamp = Math.floor(Date.now() / 1000)

  const defaultIdentity = {
    name: (await getConfigValue(fs, gitdir, 'user.name')) as string | undefined,
    email: ((await getConfigValue(fs, gitdir, 'user.email')) as string) || '',
    timestamp,
    timezoneOffset: new Date(timestamp * 1000).getTimezoneOffset(),
  }

  // Priority chain depends on type
  let priorityChain: (Partial<Author> | undefined)[]
  if (type === 'author') {
    // Author: default -> commit.author -> provided
    priorityChain = [defaultIdentity, commit?.author, provided]
  } else {
    // Committer: default -> commit.committer -> fallback (author) -> provided
    priorityChain = [defaultIdentity, commit?.committer, fallback, provided]
  }

  const normalized = assignDefined({} as Partial<Author>, ...priorityChain)

  if (normalized.name === undefined) {
    return undefined
  }

  return normalized
}

