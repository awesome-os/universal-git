import { assignDefined } from './assignDefined.ts'
import type { Author, CommitObject } from "../models/GitCommit.ts"
import type { Repository } from "../core-utils/Repository.ts"

/**
 * Return committer object by using properties with this priority:
 * (1) provided committer object
 * -> (2) provided author object
 * -> (3) committer of provided commit object (if not amending)
 * -> (4) Config and current date/time
 *
 * @param {Object} args
 * @param {Repository} args.repo - Repository instance (required for config access)
 * @param {Object} [args.author] - The author object.
 * @param {Object} [args.committer] - The committer object.
 * @param {CommitObject} [args.commit] - A commit object.
 * @param {boolean} [args.amend] - If true, this is an amend operation and timestamp should be updated.
 *
 * @returns {Promise<void | {name: string, email: string, timestamp: number, timezoneOffset: number }>}
 */
export async function normalizeCommitterObject({
  repo,
  author,
  committer,
  commit,
  amend = false,
  configService,
}: {
  repo: Repository
  author?: Partial<Author>
  committer?: Partial<Author>
  commit?: CommitObject
  amend?: boolean
  configService?: Awaited<ReturnType<Repository['getConfig']>>
}): Promise<Author | undefined> {
  // CRITICAL: Use the Repository's config service to ensure state consistency
  // This ensures that setConfig() and getCommitter() use the same UnifiedConfigService instance
  const config = configService ?? await repo.getConfig()
  const nameConfig = (await config.get('user.name')) as string | undefined
  const emailConfig = ((await config.get('user.email')) as string | undefined) || '' // committer.email is allowed to be empty string
  
  // CRITICAL: When amending, don't use the commit's timestamp/timezoneOffset as fallback
  // The committer timestamp should be updated to current time when amending (unless explicitly provided)
  // This matches real git behavior where amend updates the committer timestamp
  // Priority: committer.timestamp > author.timestamp > (commit.committer.timestamp if not amending) > current time
  const providedTimestamp = committer?.timestamp ?? author?.timestamp ?? (amend ? undefined : commit?.committer?.timestamp)
  const timestamp = providedTimestamp ?? Math.floor(Date.now() / 1000)
  
  // CRITICAL: When amending, don't use the commit's timezoneOffset as fallback
  // Priority: committer.timezoneOffset > author.timezoneOffset > (commit.committer.timezoneOffset if not amending) > current timezone
  const providedTimezoneOffset = committer?.timezoneOffset ?? author?.timezoneOffset ?? (amend ? undefined : commit?.committer?.timezoneOffset)
  const timezoneOffset = providedTimezoneOffset !== undefined 
    ? providedTimezoneOffset 
    : new Date(timestamp * 1000).getTimezoneOffset()
  
  const defaultCommitter: Partial<Author> = {
    name: nameConfig,
    email: emailConfig,
    timestamp,
    timezoneOffset,
  }

  // When amending, we still want to preserve name/email from the old commit if not provided,
  // but we've already handled timestamp/timezoneOffset above to use current time
  const commitCommitterForMerge = commit?.committer ? {
    name: commit.committer.name,
    email: commit.committer.email,
    // Don't include timestamp/timezoneOffset when amending - we want fresh values
    ...(amend ? {} : { timestamp: commit.committer.timestamp, timezoneOffset: commit.committer.timezoneOffset })
  } : undefined

  const normalizedCommitter = assignDefined(
    {} as Partial<Author>,
    defaultCommitter,
    commitCommitterForMerge,
    author,
    committer
  ) as Author

  if (normalizedCommitter.name === undefined) {
    return undefined
  }
  return normalizedCommitter
}

