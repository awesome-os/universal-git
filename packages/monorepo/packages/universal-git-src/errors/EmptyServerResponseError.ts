import { BaseError } from './BaseError.ts'

export class EmptyServerResponseError extends BaseError {
  static readonly code = 'EmptyServerResponseError' as const

  constructor(cause?: Error) {
    super(`Empty response from git server.`, cause)
    this.code = this.name = EmptyServerResponseError.code
    this.data = {}
  }
}

