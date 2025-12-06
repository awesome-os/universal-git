import { BaseError } from './BaseError.ts'

export class InvalidOidError extends BaseError {
  static readonly code = 'InvalidOidError' as const

  constructor(value: string, expectedLength?: number) {
    const length = expectedLength || (value.length === 64 ? 64 : 40)
    super(`Expected a ${length}-char hex object id but saw "${value}" (length: ${value.length}).`)
    this.code = this.name = InvalidOidError.code
    this.data = { value, expectedLength: length }
  }
}

