import { BaseError } from './BaseError.ts'

export class ObjectTypeError extends BaseError {
  static readonly code = 'ObjectTypeError' as const

  constructor(
    oid: string,
    actual: 'blob' | 'commit' | 'tag' | 'tree',
    expected: 'blob' | 'commit' | 'tag' | 'tree',
    filepath?: string,
    cause?: Error
  ) {
    super(
      `Object ${oid} ${
        filepath ? `at ${filepath} ` : ''
      }was anticipated to be a ${expected} but it is a ${actual}.`,
      cause
    )
    this.code = this.name = ObjectTypeError.code
    this.data = { oid, actual, expected, filepath }
  }
}

