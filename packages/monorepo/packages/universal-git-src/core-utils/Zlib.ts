import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import { deflate as pakoDeflate, inflate as pakoInflate } from '../utils/pako-stream.ts'

/**
 * Compresses a buffer using zlib deflate
 */
export const deflate = async (buffer: Uint8Array | UniversalBuffer): Promise<Uint8Array> => {
  return pakoDeflate(buffer)
}

/**
 * Decompresses a buffer using zlib inflate
 */
export const inflate = async (buffer: Uint8Array | UniversalBuffer): Promise<Uint8Array> => {
  return pakoInflate(buffer)
}

