import { BaseError } from './BaseError.ts'

export class NotFoundError extends BaseError {
  static readonly code = 'NotFoundError' as const
  declare data: { what: string }

  constructor(what: string) {
    super(`Could not find ${what}.`)
    this.code = this.name = NotFoundError.code
    this.data = { what }
  }
}

