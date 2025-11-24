import { WalkerFactory } from "../models/Walker.ts"
import type { Walker } from "../models/Walker.ts"

/**
 * Creates a WORKDIR walker for walking the working directory.
 * 
 * @deprecated Use `WalkerFactory.workdir()` instead. This function will be removed in a future version.
 * @returns {Walker}
 * 
 * @example
 * // Old API (deprecated)
 * const walker = WORKDIR()
 * 
 * // New API (recommended)
 * import { WalkerFactory } from '@awesome-os/universal-git-src/models/Walker.ts'
 * const walker = WalkerFactory.workdir()
 */
export function WORKDIR(): Walker {
  return WalkerFactory.workdir()
}

