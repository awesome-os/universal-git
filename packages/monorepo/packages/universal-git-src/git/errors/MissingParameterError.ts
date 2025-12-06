import { BaseError } from './BaseError.ts'

export class MissingParameterError extends BaseError {
  static readonly code = 'MissingParameterError' as const
  declare data: { parameter: string }

  constructor(parameter: string) {
    super(`The function requires a "${parameter}" parameter but none was provided.`)
    this.code = this.name = MissingParameterError.code
    this.data = { parameter }
  }
}

