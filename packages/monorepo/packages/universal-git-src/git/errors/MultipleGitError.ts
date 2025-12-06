import { BaseError } from './BaseError.ts'

export class MultipleGitError extends BaseError {
  errors: Error[]

  static readonly code = 'MultipleGitError' as const

  constructor(errors: Error[]) {
    const firstError = errors.length > 0 ? errors[0] : undefined
    super(
      `There are multiple errors that were thrown by the method. Please refer to the "errors" property to see more`,
      firstError instanceof Error ? firstError : undefined
    )
    this.code = this.name = MultipleGitError.code
    this.data = { errors }
    this.errors = errors
  }
}

