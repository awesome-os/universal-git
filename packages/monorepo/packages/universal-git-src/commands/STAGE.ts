import { WalkerFactory } from "../models/Walker.ts"
import type { Walker } from "../models/Walker.ts"

/**
 * Creates a STAGE walker for walking the Git index (staging area).
 * 
 * @deprecated Use `WalkerFactory.stage()` instead. This function will be removed in a future version.
 * @returns {Walker}
 * 
 * @example
 * // Old API (deprecated)
 * const walker = STAGE()
 * 
 * // New API (recommended)
 * import { WalkerFactory } from '@awesome-os/universal-git-src/models/Walker.ts'
 * const walker = WalkerFactory.stage()
 */
export function STAGE(): Walker {
  return WalkerFactory.stage()
}

