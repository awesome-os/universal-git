import { BaseError } from './BaseError.ts'

export class SmartHttpError extends BaseError {
  static readonly code = 'SmartHttpError' as const

  constructor(preview: string, response: string, cause?: Error) {
    super(
      `Remote did not reply using the "smart" HTTP protocol. Expected "001e# service=git-upload-pack" but received: ${preview}`,
      cause
    )
    this.code = this.name = SmartHttpError.code
    this.data = { preview, response }
  }
}

