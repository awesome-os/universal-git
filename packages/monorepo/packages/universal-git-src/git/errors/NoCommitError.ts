import { BaseError } from './BaseError.ts'

export class NoCommitError extends BaseError {
  static readonly code = 'NoCommitError' as const

  constructor(ref: string, cause?: Error) {
    super(
      `"${ref}" does not point to any commit. You're maybe working on a repository with no commits yet. `,
      cause
    )
    this.code = this.name = NoCommitError.code
    this.data = { ref }
  }
}

