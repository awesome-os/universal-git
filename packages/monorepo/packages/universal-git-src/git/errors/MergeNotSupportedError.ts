import { BaseError } from './BaseError.ts'

export class MergeNotSupportedError extends BaseError {
  static readonly code = 'MergeNotSupportedError' as const

  constructor(cause?: Error) {
    super(`Merges with conflicts are not supported yet.`, cause)
    this.code = this.name = MergeNotSupportedError.code
    this.data = {}
  }
}

