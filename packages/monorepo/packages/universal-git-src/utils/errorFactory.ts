import { BaseError } from '../errors/BaseError.ts'

/**
 * Factory function to create standardized error classes
 * Reduces redundancy across error class definitions
 */
export function createErrorClass<TData extends Record<string, unknown> = Record<string, unknown>>(
  code: string,
  defaultMessage: string | ((data: TData) => string)
) {
  return class extends BaseError {
    static readonly code: string = code

    constructor(data: TData, customMessage?: string) {
      const message =
        customMessage || (typeof defaultMessage === 'function' ? defaultMessage(data) : defaultMessage)
      super(message)
      this.code = this.name = code
      this.data = data
    }
  }
}

/**
 * Helper to create error classes with typed data
 */
export function createTypedErrorClass<
  TData extends Record<string, unknown> = Record<string, unknown>
>(
  code: string,
  messageBuilder: (data: TData) => string
) {
  return class extends BaseError {
    static readonly code: string = code

    constructor(data: TData) {
      super(messageBuilder(data))
      this.code = this.name = code
      this.data = data
    }
  }
}

