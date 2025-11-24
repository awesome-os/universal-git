import type { UniversalBuffer } from '../utils/UniversalBuffer.ts'

/**
 * Normalizes a filepath to use forward slashes (Git convention)
 */
export const normalize = (filepath: string): string => {
  return filepath.replace(/\\/g, '/')
}

/**
 * Normalizes a filepath buffer to use forward slashes
 */
export const normalizeBuffer = (buffer: Uint8Array | UniversalBuffer): Uint8Array | UniversalBuffer => {
  let idx: number
  while (~(idx = buffer.indexOf(92))) buffer[idx] = 47
  return buffer
}

import type { ObjectFormat } from '../utils/detectObjectFormat.ts'
import { getOidLength } from '../utils/detectObjectFormat.ts'

/**
 * Converts a full SHA OID to its object path components
 * 
 * @param oid - Object ID (40 chars for SHA-1, 64 chars for SHA-256)
 * @param objectFormat - Object format ('sha1' or 'sha256'), defaults to 'sha1'
 * @returns Object with 'dir' (first 2 chars) and 'file' (rest of OID)
 */
export const toOid = (oid: string, objectFormat: ObjectFormat = 'sha1'): { dir: string; file: string } => {
  const expectedLength = getOidLength(objectFormat)
  if (oid.length !== expectedLength) {
    throw new Error(`Invalid OID length: expected ${expectedLength}, got ${oid.length}`)
  }
  return {
    dir: oid.slice(0, 2), // Same for both SHA-1 and SHA-256
    file: oid.slice(2),   // Rest of OID
  }
}

/**
 * Constructs the object path from an OID
 * 
 * @param oid - Object ID (40 chars for SHA-1, 64 chars for SHA-256)
 * @param objectFormat - Object format ('sha1' or 'sha256'), defaults to 'sha1'
 * @returns Object path string (e.g., 'objects/ab/cdef...')
 */
export const toObjectPath = (oid: string, objectFormat: ObjectFormat = 'sha1'): string => {
  const { dir, file } = toOid(oid, objectFormat)
  return `objects/${dir}/${file}`
}

/**
 * Joins path segments with forward slashes
 */
export const join = (...args: string[]): string => {
  if (args.length === 0) return '.'
  let joined: string | undefined
  for (let i = 0; i < args.length; ++i) {
    const arg = args[i]
    if (arg.length > 0) {
      if (joined === undefined) joined = arg
      else joined += '/' + arg
    }
  }
  if (joined === undefined) return '.'
  return normalize(joined)
}

