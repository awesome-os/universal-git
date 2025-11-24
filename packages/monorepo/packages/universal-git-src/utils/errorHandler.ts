/**
 * Utility for consistent error handling and caller assignment
 * Extracted from apiWrapper for independent use
 */

/**
 * Wraps a function to automatically set the error caller property
 */
export function withErrorCaller<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  callerName: string
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args)
    } catch (err) {
      ;(err as { caller?: string }).caller = callerName
      throw err
    }
  }
}

/**
 * Sets the caller property on an error
 */
export function setErrorCaller(err: unknown, callerName: string): void {
  if (err && typeof err === 'object') {
    ;(err as { caller?: string }).caller = callerName
  }
}

