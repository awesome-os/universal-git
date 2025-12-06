import { BaseError } from './BaseError.ts'

export class InvalidFilepathError extends BaseError {
  static readonly code = 'InvalidFilepathError' as const

  constructor(reason?: 'leading-slash' | 'trailing-slash' | 'directory', cause?: Error) {
    let message = 'invalid filepath'
    if (reason === 'leading-slash' || reason === 'trailing-slash') {
      message = `"filepath" parameter should not include leading or trailing directory separators because these can cause problems on some platforms.`
    } else if (reason === 'directory') {
      message = `"filepath" should not be a directory.`
    }
    super(message, cause)
    this.code = this.name = InvalidFilepathError.code
    this.data = { reason }
  }
}

