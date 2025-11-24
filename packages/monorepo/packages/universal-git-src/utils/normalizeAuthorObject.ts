import { assignDefined } from './assignDefined.ts'
import type { Author, CommitObject } from "../models/GitCommit.ts"
import type { Repository } from "../core-utils/Repository.ts"

/**
 * Return author object by using properties following this priority:
 * (1) provided author object
 * -> (2) author of provided commit object
 * -> (3) Config and current date/time
 *
 * @param {Object} args
 * @param {Repository} args.repo - Repository instance (required for config access)
 * @param {Object} [args.author] - The author object.
 * @param {CommitObject} [args.commit] - A commit object.
 *
 * @returns {Promise<void | {name: string, email: string, timestamp: number, timezoneOffset: number }>}
 */
export async function normalizeAuthorObject({
  repo,
  author,
  commit,
}: {
  repo: Repository
  author?: Partial<Author>
  commit?: CommitObject
}): Promise<Author | undefined> {
  // CRITICAL: Use the Repository's config service to ensure state consistency
  // This ensures that setConfig() and getAuthor() use the same UnifiedConfigService instance
  const config = await repo.getConfig()
  const nameConfig = (await config.get('user.name')) as string | undefined
  const emailConfig = ((await config.get('user.email')) as string | undefined) || ''
  
  // CRITICAL: Only use current timestamp if no timestamp is provided in author or commit
  // This ensures tests that provide specific timestamps get those exact timestamps
  // Priority: author.timestamp > commit.author.timestamp > current time
  const providedTimestamp = author?.timestamp ?? commit?.author?.timestamp
  const timestamp = providedTimestamp ?? Math.floor(Date.now() / 1000)
  
  // CRITICAL: Only use current timezoneOffset if no timezoneOffset is provided
  // Priority: author.timezoneOffset > commit.author.timezoneOffset > current timezone
  const providedTimezoneOffset = author?.timezoneOffset ?? commit?.author?.timezoneOffset
  const timezoneOffset = providedTimezoneOffset !== undefined
    ? providedTimezoneOffset
    : new Date(timestamp * 1000).getTimezoneOffset()
  
  const defaultAuthor: Partial<Author> = {
    name: nameConfig,
    email: emailConfig,
    timestamp,
    timezoneOffset,
  }

  // Populate author object by using properties with this priority:
  // (1) provided author object
  // -> (2) author of provided commit object
  // -> (3) default author
  const normalizedAuthor = assignDefined(
    {} as Partial<Author>,
    defaultAuthor,
    commit ? commit.author : undefined,
    author
  ) as Author

  if (normalizedAuthor.name === undefined) {
    return undefined
  }

  return normalizedAuthor
}

