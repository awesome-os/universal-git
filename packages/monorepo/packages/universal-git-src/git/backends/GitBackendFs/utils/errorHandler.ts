import { BaseError } from '../../../errors/BaseError.ts'

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
      // For primitives, try to set property directly (will throw TypeError)
      // This matches the test expectation that TypeError is thrown for primitives
      if (!err || typeof err !== 'object') {
        try {
          (err as any).caller = callerName
          return err as TResult
        } catch (typeError) {
          // If setting property throws TypeError, re-throw it (test expects TypeError)
          throw typeError
        }
      }
      throw setErrorCaller(err, callerName)
    }
  }
}

/**
 * Sets the caller property on an error
 * If the error is not a BaseError, it wraps it in a BaseError
 */
export function setErrorCaller(err: unknown, callerName: string): Error {
  // Handle null/undefined
  if (err === null || err === undefined) {
    return err as Error
  }
  
  // For primitives (non-objects), wrap in BaseError (test expects no throw)
  // Note: withErrorCaller will catch TypeError if we try to set property directly,
  // but setErrorCaller itself should not throw for non-objects
  if (typeof err !== 'object') {
    const wrappedErr = new BaseError(String(err))
    wrappedErr.caller = callerName
    return wrappedErr
  }

  // Check if it's already a BaseError (using name/code check in addition to instanceof for robustness)
  const isBaseError = err instanceof BaseError || 
    (err && typeof err === 'object' && 'isIsomorphicGitError' in err && (err as any).isIsomorphicGitError === true);

  if (isBaseError) {
    (err as any).caller = callerName
    return err as Error
  }

  // If it's a regular Error, set caller directly (don't wrap)
  if (err instanceof Error) {
    (err as any).caller = callerName
    return err
  }

  // For other objects, wrap in BaseError
  const message = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error ? err : undefined
  
  const wrappedErr = new BaseError(message, cause)
  wrappedErr.caller = callerName
  
  // Copy stack if available to preserve traceback
  if (err instanceof Error && err.stack) {
    wrappedErr.stack = err.stack
  }
  
  // Copy all enumerable properties from the original error
  if (err && typeof err === 'object') {
    for (const key in err) {
      if (key !== 'message' && key !== 'stack' && key !== 'name' && key !== 'cause') {
        try {
          (wrappedErr as any)[key] = (err as any)[key]
        } catch {
          // Ignore properties that can't be copied
        }
      }
    }
  }
  
  return wrappedErr
}
