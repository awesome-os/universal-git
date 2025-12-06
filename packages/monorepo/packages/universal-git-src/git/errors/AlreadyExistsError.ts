import { BaseError } from './BaseError.ts'

export class AlreadyExistsError extends BaseError {
  static readonly code = 'AlreadyExistsError' as const

  constructor(noun: 'note' | 'remote' | 'tag' | 'branch', where: string, canForce = true) {
    super(
      `Failed to create ${noun} at ${where} because it already exists.${
        canForce ? ` (Hint: use 'force: true' parameter to overwrite existing ${noun}.)` : ''
      }`
    )
    this.code = this.name = AlreadyExistsError.code
    this.data = { noun, where, canForce }
  }
}

