import { BaseError } from './BaseError.ts'

export class InvalidRefNameError extends BaseError {
  static readonly code = 'InvalidRefNameError' as const

  constructor(ref: string, suggestion: string, cause?: Error) {
    super(
      `"${ref}" would be an invalid git reference. (Hint: a valid alternative would be "${suggestion}".)`,
      cause
    )
    this.code = this.name = InvalidRefNameError.code
    this.data = { ref, suggestion }
  }
}

