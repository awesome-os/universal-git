/**
 * Blob parser - trivial passthrough since blobs are just raw content
 */

import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

/**
 * Parses a blob buffer (trivial passthrough)
 */
export const parse = (buffer: UniversalBuffer | Uint8Array): UniversalBuffer => {
  return UniversalBuffer.from(buffer)
}

/**
 * Serializes a blob (trivial passthrough)
 */
export const serialize = (content: UniversalBuffer | Uint8Array | string): UniversalBuffer => {
  if (typeof content === 'string') {
    return UniversalBuffer.from(content, 'utf8')
  }
  return UniversalBuffer.from(content)
}

