import { BaseError } from './BaseError.ts'

export class CommitNotFetchedError extends BaseError {
  static readonly code = 'CommitNotFetchedError' as const

  constructor(ref: string, oid: string, cause?: Error) {
    super(
      `Failed to checkout "${ref}" because commit ${oid} is not available locally. Do a git fetch to make the branch available locally.`,
      cause
    )
    this.code = this.name = CommitNotFetchedError.code
    this.data = { ref, oid }
  }
}

