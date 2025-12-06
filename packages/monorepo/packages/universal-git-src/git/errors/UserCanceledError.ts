import { BaseError } from './BaseError.ts'

export class UserCanceledError extends BaseError {
  static readonly code = 'UserCanceledError' as const

  constructor(cause?: Error) {
    super(`The operation was canceled.`, cause)
    this.code = this.name = UserCanceledError.code
    this.data = {}
  }
}

