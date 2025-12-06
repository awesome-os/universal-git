import { forAwait } from './forAwait.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'

const STREAM_DEBUG_ENABLED =
  process.env.UNIVERSAL_GIT_DEBUG_STREAMS === '1' ||
  process.env.ISOGIT_DEBUG_STREAMS === '1' ||
  process.env.ISO_GIT_DEBUG_STREAMS === '1'

const debugStream = (message: string, extra?: Record<string, unknown>): void => {
  if (!STREAM_DEBUG_ENABLED) return
  if (extra) {
    console.log(`[Git Stream] ${message}`, extra)
  } else {
    console.log(`[Git Stream] ${message}`)
  }
}

export const collect = async (
  iterable: AsyncIterable<Uint8Array | UniversalBuffer> | Iterable<Uint8Array | UniversalBuffer>
): Promise<Uint8Array> => {
  const buffers: (Uint8Array | UniversalBuffer)[] = []
  let chunkCount = 0
  let totalBytes = 0
  const start = STREAM_DEBUG_ENABLED ? Date.now() : 0
  // This will be easier once `for await ... of` loops are available.
  await forAwait(iterable, value => {
    buffers.push(value)
    chunkCount++
    const chunkSize = value instanceof Uint8Array ? value.byteLength : (value as UniversalBuffer).length
    totalBytes += chunkSize
    if (STREAM_DEBUG_ENABLED && chunkCount % 50 === 0) {
      debugStream('collect progress', { chunkCount, totalBytes })
    }
  })
  if (STREAM_DEBUG_ENABLED) {
    debugStream('collect finished streaming', {
      chunkCount,
      totalBytes,
      duration: Date.now() - start,
    })
  }
  if (buffers.length === 0) {
    return new Uint8Array(0)
  }
  // Calculate total size using the actual array lengths
  let size = 0
  for (const buffer of buffers) {
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    size += uint8Array.length
  }
  if (size === 0) {
    return new Uint8Array(0)
  }
  const result = new Uint8Array(size)
  let nextIndex = 0
  for (const buffer of buffers) {
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    result.set(uint8Array, nextIndex)
    nextIndex += uint8Array.length
  }
  if (STREAM_DEBUG_ENABLED) {
    debugStream('collect assembled buffer', {
      totalBytes: size,
      chunkCount,
      duration: Date.now() - start,
    })
  }
  return result
}

