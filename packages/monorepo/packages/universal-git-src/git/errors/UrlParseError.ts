import { BaseError } from './BaseError.ts'

export class UrlParseError extends BaseError {
  static readonly code = 'UrlParseError' as const

  constructor(url: string, cause?: Error) {
    super(`Cannot parse remote URL: "${url}"`, cause)
    this.code = this.name = UrlParseError.code
    this.data = { url }
  }
}

