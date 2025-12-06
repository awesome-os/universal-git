import { BaseError } from './BaseError.ts'

export class CheckoutConflictError extends BaseError {
  static readonly code = 'CheckoutConflictError' as const

  constructor(filepaths: string[], cause?: Error) {
    super(
      `Your local changes to the following files would be overwritten by checkout: ${filepaths.join(
        ', '
      )}`,
      cause
    )
    this.code = this.name = CheckoutConflictError.code
    this.data = { filepaths }
  }
}

