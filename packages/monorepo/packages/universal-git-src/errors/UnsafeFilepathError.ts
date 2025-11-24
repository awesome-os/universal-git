import { BaseError } from './BaseError.ts'

export class UnsafeFilepathError extends BaseError {
  static readonly code = 'UnsafeFilepathError' as const

  constructor(filepath: string) {
    super(`The filepath "${filepath}" contains unsafe character sequences`)
    this.code = this.name = UnsafeFilepathError.code
    this.data = { filepath }
  }
}

