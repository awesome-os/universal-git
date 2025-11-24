import { WalkerFactory } from "../models/Walker.ts"
import type { Walker } from "../models/Walker.ts"

/**
 * Creates a TREE walker for walking Git tree objects.
 * 
 * @deprecated Use `WalkerFactory.tree({ ref })` instead. This function will be removed in a future version.
 * @param {object} args
 * @param {string} [args.ref='HEAD']
 * @returns {Walker}
 * 
 * @example
 * // Old API (deprecated)
 * const walker = TREE({ ref: 'HEAD' })
 * 
 * // New API (recommended)
 * import { WalkerFactory } from '@awesome-os/universal-git-src/models/Walker.ts'
 * const walker = WalkerFactory.tree({ ref: 'HEAD' })
 */
export function TREE({ ref = 'HEAD' }: { ref?: string } = {}): Walker {
  return WalkerFactory.tree({ ref })
}

