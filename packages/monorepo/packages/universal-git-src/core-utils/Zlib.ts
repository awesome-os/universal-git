import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import pako from 'pako'

let supportsCompressionStream: boolean | null = null
let supportsDecompressionStream: boolean | null = null

/**
 * Compresses a buffer using zlib deflate
 */
export const deflate = async (buffer: Uint8Array | UniversalBuffer): Promise<Uint8Array> => {
  if (supportsCompressionStream === null) {
    supportsCompressionStream = testCompressionStream()
  }
  return supportsCompressionStream ? browserDeflate(buffer) : pako.deflate(buffer)
}

const browserDeflate = async (buffer: Uint8Array | UniversalBuffer): Promise<Uint8Array> => {
  const cs = new CompressionStream('deflate')
  // Convert to concrete Uint8Array for Blob constructor
  // If it's already a Uint8Array (and not UniversalBuffer), use it directly
  // Otherwise, extract the underlying buffer from UniversalBuffer
  const concreteBuffer = buffer instanceof UniversalBuffer
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : buffer // Already a Uint8Array, use directly
  const c = new Blob([concreteBuffer as BlobPart]).stream().pipeThrough(cs)
  return new Uint8Array(await new Response(c).arrayBuffer())
}

const testCompressionStream = (): boolean => {
  try {
    const cs = new CompressionStream('deflate')
    cs.writable.close()
    // Test if `Blob.stream` is present. React Native does not have the `stream` method
    const stream = new Blob([]).stream()
    stream.cancel()
    return true
  } catch {
    return false
  }
}

/**
 * Decompresses a buffer using zlib inflate
 */
export const inflate = async (buffer: Uint8Array | UniversalBuffer): Promise<Uint8Array> => {
  if (supportsDecompressionStream === null) {
    supportsDecompressionStream = testDecompressionStream()
  }
  return supportsDecompressionStream ? browserInflate(buffer) : pako.inflate(buffer)
}

const browserInflate = async (buffer: Uint8Array | UniversalBuffer): Promise<Uint8Array> => {
  const ds = new DecompressionStream('deflate')
  // Convert to concrete Uint8Array for Blob constructor
  // If it's already a Uint8Array (and not UniversalBuffer), use it directly
  // Otherwise, extract the underlying buffer from UniversalBuffer
  const concreteBuffer = buffer instanceof UniversalBuffer
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : buffer // Already a Uint8Array, use directly
  const d = new Blob([concreteBuffer as BlobPart]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(d).arrayBuffer())
}

const testDecompressionStream = (): boolean => {
  try {
    const ds = new DecompressionStream('deflate')
    if (ds) return true
  } catch {
    // no bother
  }
  return false
}

