import { BaseError } from './BaseError.ts'

export class MissingNameError extends BaseError {
  static readonly code = 'MissingNameError' as const

  constructor(role: 'author' | 'committer' | 'tagger', cause?: Error) {
    super(
      `No name was provided for ${role} in the argument or in the .git/config file.`,
      cause
    )
    this.code = this.name = MissingNameError.code
    this.data = { role }
  }
}

