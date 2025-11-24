/**
 * Progress Event Helpers
 * 
 * Provides unified helpers for creating GitProgressEvent objects
 * to ensure consistent type handling across commands.
 */

import type { GitProgressEvent } from '../git/remote/GitRemoteHTTP.ts'

/**
 * Creates a GitProgressEvent with proper type safety.
 * 
 * The `phase` property should contain descriptive text about the current operation.
 * If you need to pass additional information, include it in the `phase` string.
 * 
 * @param phase - Description of the current operation phase
 * @param loaded - Number of items/bytes loaded
 * @param total - Total number of items/bytes (0 if unknown)
 * @returns A properly typed GitProgressEvent
 * 
 * @example
 * ```typescript
 * if (onProgress) {
 *   await onProgress(createProgressEvent('Starting checkout', 0, 0))
 * }
 * ```
 */
export function createProgressEvent(
  phase: string,
  loaded: number,
  total: number
): GitProgressEvent {
  return {
    phase,
    loaded,
    total,
  }
}

