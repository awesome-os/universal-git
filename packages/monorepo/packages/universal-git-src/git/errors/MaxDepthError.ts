import { BaseError } from './BaseError.ts'

export class MaxDepthError extends BaseError {
  static readonly code = 'MaxDepthError' as const

  constructor(depth: number, cause?: Error) {
    super(`Maximum search depth of ${depth} exceeded.`, cause)
    this.code = this.name = MaxDepthError.code
    this.data = { depth }
  }
}

