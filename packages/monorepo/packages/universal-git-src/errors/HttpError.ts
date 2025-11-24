import { BaseError } from './BaseError.ts'

export class HttpError extends BaseError {
  static readonly code = 'HttpError' as const

  constructor(statusCode: number, statusMessage: string, response: string) {
    super(`HTTP Error: ${statusCode} ${statusMessage}`)
    this.code = this.name = HttpError.code
    this.data = { statusCode, statusMessage, response }
  }
}

