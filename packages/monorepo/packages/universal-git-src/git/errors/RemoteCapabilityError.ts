import { BaseError } from './BaseError.ts'

export class RemoteCapabilityError extends BaseError {
  static readonly code = 'RemoteCapabilityError' as const

  constructor(
    capability: 'shallow' | 'deepen-since' | 'deepen-not' | 'deepen-relative',
    parameter: 'depth' | 'since' | 'exclude' | 'relative',
    cause?: Error
  ) {
    super(
      `Remote does not support the "${capability}" so the "${parameter}" parameter cannot be used.`,
      cause
    )
    this.code = this.name = RemoteCapabilityError.code
    this.data = { capability, parameter }
  }
}

