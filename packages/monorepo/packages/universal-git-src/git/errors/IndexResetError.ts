import { BaseError } from './BaseError.ts'

export class IndexResetError extends BaseError {
  static readonly code = 'IndexResetError' as const

  constructor(filepath: string, cause?: Error) {
    super(
      `Could not merge index: Entry for '${filepath}' is not up to date. Either reset the index entry to HEAD, or stage your unstaged changes.`,
      cause
    )
    this.code = this.name = IndexResetError.code
    this.data = { filepath }
  }
}

