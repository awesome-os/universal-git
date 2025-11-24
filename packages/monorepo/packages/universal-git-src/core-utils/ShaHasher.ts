import Hash from 'sha.js/sha1.js'
import Hash256 from 'sha.js/sha256.js'
import { toHex } from "../utils/toHex.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

let supportsSubtleSHA1: boolean | null = null
let supportsSubtleSHA256: boolean | null = null

export type ObjectFormat = 'sha1' | 'sha256'

/**
 * Computes the SHA-1 hash of a buffer
 */
export const shasum = async (buffer: Uint8Array | UniversalBuffer): Promise<string> => {
  if (supportsSubtleSHA1 === null) {
    supportsSubtleSHA1 = await testSubtleSHA1()
  }
  return supportsSubtleSHA1 ? subtleSHA1(buffer) : shasumSync(buffer)
}

/**
 * Computes the SHA-256 hash of a buffer
 */
export const shasum256 = async (buffer: Uint8Array | UniversalBuffer): Promise<string> => {
  if (supportsSubtleSHA256 === null) {
    supportsSubtleSHA256 = await testSubtleSHA256()
  }
  return supportsSubtleSHA256 ? subtleSHA256(buffer) : shasum256Sync(buffer)
}

const shasumSync = (buffer: Uint8Array | UniversalBuffer): string => {
  return new Hash().update(buffer).digest('hex')
}

const shasum256Sync = (buffer: Uint8Array | UniversalBuffer): string => {
  return new Hash256().update(buffer).digest('hex')
}

const subtleSHA1 = async (buffer: Uint8Array | UniversalBuffer): Promise<string> => {
  // crypto.subtle.digest accepts ArrayBuffer, TypedArray, or DataView
  // Uint8Array (which UniversalBuffer extends) should work directly
  // If it's already a Uint8Array (and not UniversalBuffer), use it directly
  // Otherwise, extract the underlying buffer from UniversalBuffer
  const concreteBuffer = buffer instanceof UniversalBuffer
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : buffer // Already a Uint8Array, use directly
  const hash = await crypto.subtle.digest('SHA-1', concreteBuffer as BufferSource)
  return toHex(hash)
}

const subtleSHA256 = async (buffer: Uint8Array | UniversalBuffer): Promise<string> => {
  // crypto.subtle.digest accepts ArrayBuffer, TypedArray, or DataView
  // Uint8Array (which UniversalBuffer extends) should work directly
  // If it's already a Uint8Array (and not UniversalBuffer), use it directly
  // Otherwise, extract the underlying buffer from UniversalBuffer
  const concreteBuffer = buffer instanceof UniversalBuffer
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : buffer // Already a Uint8Array, use directly
  const hash = await crypto.subtle.digest('SHA-256', concreteBuffer as BufferSource)
  return toHex(hash)
}

const testSubtleSHA1 = async (): Promise<boolean> => {
  try {
    const hash = await subtleSHA1(new Uint8Array([]))
    return hash === 'da39a3ee5e6b4b0d3255bfef95601890afd80709'
  } catch {
    return false
  }
}

const testSubtleSHA256 = async (): Promise<boolean> => {
  try {
    const hash = await subtleSHA256(new Uint8Array([]))
    return hash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  } catch {
    return false
  }
}

/**
 * Hashes a Git object by prepending the Git header and computing SHA-1 or SHA-256
 * 
 * @param type - Object type ('blob', 'tree', 'commit', 'tag')
 * @param content - Object content
 * @param objectFormat - Object format ('sha1' or 'sha256'), defaults to 'sha1'
 * @returns Promise resolving to the OID (hex string)
 */
export const hashObject = async ({
  type,
  content,
  objectFormat = 'sha1',
}: {
  type: string
  content: Uint8Array | UniversalBuffer
  objectFormat?: ObjectFormat
}): Promise<string> => {
  const header = `${type} ${content.length}\x00`
  const headerLen = header.length
  const totalLength = headerLen + content.length

  const wrappedObject = new Uint8Array(totalLength)
  for (let i = 0; i < headerLen; i++) {
    wrappedObject[i] = header.charCodeAt(i)
  }
  wrappedObject.set(content, headerLen)

  return objectFormat === 'sha256' 
    ? await shasum256(wrappedObject)
    : await shasum(wrappedObject)
}

