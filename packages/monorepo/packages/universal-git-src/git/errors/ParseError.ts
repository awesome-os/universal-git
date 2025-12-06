import { BaseError } from './BaseError.ts'

export class ParseError extends BaseError {
  static readonly code = 'ParseError' as const

  constructor(expected: string, actual: string, cause?: Error) {
    super(`Expected "${expected}" but received "${actual}".`, cause)
    this.code = this.name = ParseError.code
    this.data = { expected, actual }
  }
}

