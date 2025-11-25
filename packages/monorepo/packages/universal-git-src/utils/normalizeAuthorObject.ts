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
  let nameConfig: string | undefined
  let emailConfig: string | undefined
  try {
    const config = await repo.getConfig()
    nameConfig = (await config.get('user.name')) as string | undefined
    emailConfig = ((await config.get('user.email')) as string | undefined) || ''
    // Ensure nameConfig is truly undefined (not empty string) if config is missing
    if (nameConfig === '' || nameConfig === null) {
      nameConfig = undefined
    }
  } catch {
    // If config access fails (e.g., repository doesn't exist), return undefined
    // This will be handled by the caller (e.g., getStashAuthor) to throw MissingNameError
    nameConfig = undefined
    emailConfig = undefined
  }
  
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
  ) as Partial<Author>

  // Check if name is missing - this must be checked before returning
  // name can be undefined if it's not a property of the object, or if it's explicitly undefined
  if (normalizedAuthor.name === undefined || normalizedAuthor.name === null || normalizedAuthor.name === '') {
    return undefined
  }

  // TypeScript assertion: we know name exists at this point
  return normalizedAuthor as Author
}

