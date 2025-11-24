import { BaseError } from './BaseError.ts'

export class MergeConflictError extends BaseError {
  static readonly code = 'MergeConflictError' as const

  constructor(
    filepaths: string[],
    bothModified: string[],
    deleteByUs: string[],
    deleteByTheirs: string[],
    cause?: Error
  ) {
    super(
      `Automatic merge failed with one or more merge conflicts in the following files: ${filepaths.toString()}. Fix conflicts then commit the result.`,
      cause
    )
    this.code = this.name = MergeConflictError.code
    this.data = { filepaths, bothModified, deleteByUs, deleteByTheirs }
  }
}

