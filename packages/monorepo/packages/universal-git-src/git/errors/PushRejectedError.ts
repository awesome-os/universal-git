import { BaseError } from './BaseError.ts'

export class PushRejectedError extends BaseError {
  static readonly code = 'PushRejectedError' as const

  constructor(reason: 'not-fast-forward' | 'tag-exists', cause?: Error) {
    let message = ''
    if (reason === 'not-fast-forward') {
      message = ' because it was not a simple fast-forward'
    } else if (reason === 'tag-exists') {
      message = ' because tag already exists'
    }
    super(`Push rejected${message}. Use "force: true" to override.`, cause)
    this.code = this.name = PushRejectedError.code
    this.data = { reason }
  }
}

