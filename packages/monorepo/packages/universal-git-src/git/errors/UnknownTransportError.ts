import { BaseError } from './BaseError.ts'

export class UnknownTransportError extends BaseError {
  static readonly code = 'UnknownTransportError' as const

  constructor(url: string, transport: string, suggestion?: string, cause?: Error) {
    super(
      `Git remote "${url}" uses an unrecognized transport protocol: "${transport}"`,
      cause
    )
    this.code = this.name = UnknownTransportError.code
    this.data = { url, transport, suggestion }
  }
}

