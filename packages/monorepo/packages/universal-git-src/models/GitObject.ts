import { InternalError } from '../errors/InternalError.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'

// ============================================================================
// GIT OBJECT TYPES
// ============================================================================

/**
 * Git object type identifiers
 */
export type ObjectType = 'commit' | 'blob' | 'tree' | 'tag'

/**
 * Represents a Git object and provides methods to wrap and unwrap Git objects
 * according to the Git object format.
 */
export class GitObject {
  /**
   * Wraps a raw object with a Git header.
   */
  static wrap({ type, object }: { type: string; object: Uint8Array | UniversalBuffer }): Uint8Array {
    const objectLength = object.length
    const header = `${type} ${objectLength}\x00`
    const headerLen = header.length
    const totalLength = headerLen + objectLength

    // OPTIMIZATION: Allocate a single buffer and write header directly without string operations
    // This avoids multiple string operations and buffer copies
    const wrappedObject = new Uint8Array(totalLength)
    
    // Write header bytes directly (faster than charCodeAt loop for small headers)
    let headerPos = 0
    for (let i = 0; i < headerLen; i++) {
      wrappedObject[headerPos++] = header.charCodeAt(i)
    }
    
    // Copy object data directly
    wrappedObject.set(object, headerLen)

    return wrappedObject
  }

  /**
   * Unwraps a Git object buffer into its type and raw object data.
   */
  static unwrap(buffer: UniversalBuffer | Uint8Array): { type: string; object: UniversalBuffer } {
    const buf = UniversalBuffer.from(buffer)
    const s = buf.indexOf(32) // first space
    const i = buf.indexOf(0) // first null value
    const type = buf.slice(0, s).toString('utf8') // get type of object
    const length = buf.slice(s + 1, i).toString('utf8') // get type of object
    const actualLength = buf.length - (i + 1)
    // verify length
    if (parseInt(length, 10) !== actualLength) {
      throw new InternalError(
        `Length mismatch: expected ${length} bytes but got ${actualLength} instead.`
      )
    }
    return {
      type,
      object: UniversalBuffer.from(buf.slice(i + 1)),
    }
  }
}

