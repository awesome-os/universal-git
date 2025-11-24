import { readCommit } from '../../commands/readCommit.ts'
import { writeCommit } from '../../commands/writeCommit.ts'
import { InvalidRefNameError } from '../../errors/InvalidRefNameError.ts'
import { MissingNameError } from '../../errors/MissingNameError.ts'
import { GitRefStash } from '../../models/GitRefStash.ts'
import { join } from '../../utils/join.ts'
import { normalizeAuthorObject } from '../../utils/normalizeAuthorObject.ts'
import { acquireLock } from '../../utils/walkerToTreeEntryMap.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { writeRef } from './writeRef.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import type { Author } from '../../models/GitCommit.ts'
import type { Repository } from '../../core-utils/Repository.ts'

/**
 * Reference name for stash
 */
export const refStash = 'refs/stash'

/**
 * Reference name for stash reflogs
 */
export const refLogsStash = 'logs/refs/stash'

/**
 * Gets the file path for the stash reference
 */
export function getStashRefPath(gitdir: string): string {
  return join(gitdir, refStash)
}

/**
 * Gets the file path for the stash reflogs
 */
export function getStashReflogsPath(gitdir: string): string {
  return join(gitdir, refLogsStash)
}

/**
 * Retrieves the author information for stash operations
 * Uses Repository's config service to ensure state consistency
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param repo - Optional Repository instance (required for config access)
 * @returns Promise resolving to Author object
 */
export async function getStashAuthor({
  fs,
  gitdir,
  repo,
}: {
  fs: FileSystemProvider
  gitdir: string
  repo?: Repository
}): Promise<Author> {
  if (!repo) {
    throw new Error('Repository instance is required for getStashAuthor')
  }
  
  // CRITICAL: Use the Repository's config service to ensure state consistency
  // This ensures that setConfig() and getStashAuthor() use the same UnifiedConfigService instance
  let author: Author | undefined
  try {
    author = await normalizeAuthorObject({ repo, author: {} })
  } catch (err) {
    // If normalizeAuthorObject throws an error (e.g., from getConfig()),
    // convert it to MissingNameError since the author is effectively missing
    const { NotFoundError } = await import('../../errors/NotFoundError.ts')
    if (err instanceof NotFoundError || err instanceof Error) {
      // If we can't access the config, the author is effectively missing
      // Throw MissingNameError to match the expected error type
      const error = new MissingNameError('author')
      ;(error as any).data = { role: 'author' }
      throw error
    }
    throw err
  }
  
  // Check if author is missing (name is undefined)
  if (!author || !author.name) {
    const error = new MissingNameError('author')
    ;(error as any).data = { role: 'author' }
    throw error
  }
  
  return author
}

/**
 * Gets the SHA of a stash entry by its index
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param refIdx - Index of the stash entry
 * @param stashEntries - Optional preloaded stash entries
 * @returns Promise resolving to stash SHA or null if not found
 */
export async function getStashSHA({
  fs,
  gitdir,
  refIdx,
  stashEntries,
}: {
  fs: FileSystemProvider
  gitdir: string
  refIdx: number
  stashEntries?: string[]
}): Promise<string | null> {
  const normalizedFs = createFileSystem(fs)
  const stashRefPath = getStashRefPath(gitdir)
  
  if (!(await normalizedFs.exists(stashRefPath))) {
    return null
  }

  const entries = stashEntries || (await readStashReflogs({ fs, gitdir, parsed: false }))
  if (refIdx >= entries.length) {
    return null
  }
  const entry = entries[refIdx]
  if (typeof entry === 'string') {
    return entry.split(' ')[1]
  }
  return null
}

/**
 * Writes a stash commit to the repository
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param message - Commit message
 * @param tree - Tree object ID
 * @param parent - Parent commit object IDs
 * @param repo - Optional Repository instance (required for author)
 * @returns Promise resolving to the object ID of the written commit
 */
export async function writeStashCommit({
  fs,
  gitdir,
  message,
  tree,
  parent,
  repo,
}: {
  fs: FileSystemProvider
  gitdir: string
  message: string
  tree: string
  parent: string[]
  repo?: Repository
}): Promise<string> {
  const author = await getStashAuthor({ fs, gitdir, repo })
  return writeCommit({
    fs,
    gitdir,
    commit: {
      message,
      tree,
      parent,
      author,
      committer: author,
    },
  })
}

/**
 * Reads a stash commit by its index
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param refIdx - Index of the stash entry
 * @returns Promise resolving to commit object or empty object if not found
 */
export async function readStashCommit({
  fs,
  gitdir,
  refIdx,
}: {
  fs: FileSystemProvider
  gitdir: string
  refIdx: number
}): Promise<{
  oid: string
  commit: {
    message: string
    tree: string
    parent: string[]
    author: Author
    committer: Author
    gpgsig?: string
  }
} | Record<string, never>> {
  const stashEntries = await readStashReflogs({ fs, gitdir, parsed: false })
  if (refIdx !== 0) {
    // non-default case, throw exceptions if not valid
    if (refIdx < 0 || refIdx > stashEntries.length - 1) {
      throw new InvalidRefNameError(
        `stash@${refIdx}`,
        'number that is in range of [0, num of stash pushed]'
      )
    }
  }

  const stashSHA = await getStashSHA({ fs, gitdir, refIdx, stashEntries: stashEntries as string[] })
  if (!stashSHA) {
    return {} // no stash found
  }

  // get the stash commit object
  return readCommit({
    fs,
    cache: {},
    gitdir,
    oid: stashSHA,
  })
}

/**
 * Writes a stash reference to the repository
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param stashCommit - Stash commit OID
 */
export async function writeStashRef({
  fs,
  gitdir,
  stashCommit,
}: {
  fs: FileSystemProvider
  gitdir: string
  stashCommit: string
}): Promise<void> {
  return writeRef({
    fs,
    gitdir,
    ref: refStash,
    value: stashCommit,
  })
}

/**
 * Writes a reflog entry for a stash commit
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param stashCommit - Stash commit OID
 * @param message - Stash message
 * @param repo - Optional Repository instance (required for author)
 */
export async function writeStashReflogEntry({
  fs,
  gitdir,
  stashCommit,
  message,
  repo,
}: {
  fs: FileSystemProvider
  gitdir: string
  stashCommit: string
  message: string
  repo?: Repository
}): Promise<void> {
  const author = await getStashAuthor({ fs, gitdir, repo })
  const entry = GitRefStash.createStashReflogEntry(
    author,
    stashCommit,
    message
  )
  const filepath = getStashReflogsPath(gitdir)
  const normalizedFs = createFileSystem(fs)

  await acquireLock({ filepath }, async () => {
    const existingContent = (await normalizedFs.exists(filepath))
      ? await normalizedFs.read(filepath, { encoding: 'utf8' })
      : ''
    if (typeof existingContent === 'string') {
      // Git reflogs store entries with newest first
      // Prepend the new entry to maintain this order
      // entry already ends with \n
      // Simply prepend: new entry + existing content
      const content = existingContent ? entry + existingContent : entry
      await normalizedFs.write(filepath, content, 'utf8')
    }
  })
}

/**
 * Reads the stash reflogs
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param parsed - Whether to parse the reflog entries (default: false)
 * @returns Promise resolving to array of reflog entries (strings or parsed objects)
 */
export async function readStashReflogs({
  fs,
  gitdir,
  parsed = false,
}: {
  fs: FileSystemProvider
  gitdir: string
  parsed?: boolean
}): Promise<string[] | Array<Record<string, unknown>>> {
  const normalizedFs = createFileSystem(fs)
  const reflogsPath = getStashReflogsPath(gitdir)
  
  if (!(await normalizedFs.exists(reflogsPath))) {
    return []
  }

  const reflogString = await normalizedFs.read(reflogsPath, { encoding: 'utf8' })
  if (typeof reflogString !== 'string') {
    return []
  }

  // If the reflog string is empty or only whitespace, return empty array
  if (!reflogString.trim()) {
    return []
  }

  return GitRefStash.getStashReflogEntry(reflogString, parsed)
}

