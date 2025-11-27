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
 * If the error can't have properties set on it, wraps it in a new Error
 */
export function setErrorCaller(err: unknown, callerName: string): Error {
  if (err && typeof err === 'object') {
    try {
      ;(err as { caller?: string }).caller = callerName
      // Verify the property was set
      if ((err as { caller?: string }).caller === callerName) {
        return err as Error
      }
    } catch {
      // If we can't set the property, wrap the error
    }
    
    // Wrap the error in a new Error that can have properties set
    const wrappedErr = err instanceof Error ? new Error(err.message) : new Error(String(err))
    wrappedErr.caller = callerName
    if (err instanceof Error && err.stack) wrappedErr.stack = err.stack
    if ((err as any).code) (wrappedErr as any).code = (err as any).code
    if (err instanceof Error && err.name) wrappedErr.name = err.name
    return wrappedErr
  } else {
    // If err is not an object, wrap it
    const wrappedErr = new Error(String(err))
    wrappedErr.caller = callerName
    return wrappedErr
  }
}

