/**
 * Buffer type alias for UniversalBuffer
 * 
 * This file provides a unified Buffer type that works across Node.js and browser environments.
 * In Node.js, it can use the native Buffer, but UniversalBuffer provides cross-platform compatibility.
 * 
 * For new code, prefer using UniversalBuffer directly.
 * For existing code, this alias provides backward compatibility.
 */

import { UniversalBuffer } from './UniversalBuffer.ts'

// Export UniversalBuffer as Buffer for compatibility
// In Node.js environments, we can still use native Buffer where needed
// but UniversalBuffer provides cross-platform support
export type Buffer = UniversalBuffer

// Re-export UniversalBuffer methods as Buffer methods for drop-in replacement
export const Buffer = {
  from: UniversalBuffer.from.bind(UniversalBuffer),
  alloc: UniversalBuffer.alloc.bind(UniversalBuffer),
  isBuffer: UniversalBuffer.isBuffer.bind(UniversalBuffer),
  concat: UniversalBuffer.concat.bind(UniversalBuffer),
} as {
  from: typeof UniversalBuffer.from
  alloc: typeof UniversalBuffer.alloc
  isBuffer: typeof UniversalBuffer.isBuffer
  concat: typeof UniversalBuffer.concat
}

// Also export UniversalBuffer for explicit usage
export { UniversalBuffer }

