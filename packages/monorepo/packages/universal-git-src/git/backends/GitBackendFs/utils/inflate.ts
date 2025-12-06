/* eslint-env node, browser */
/* global DecompressionStream */
import { UniversalBuffer } from './UniversalBuffer.ts'

const DEBUG_INFLATE = 
  process.env.UNIVERSAL_GIT_DEBUG_INFLATE === '1' ||
  process.env.ISOGIT_DEBUG_INFLATE === '1' ||
  process.env.ISO_GIT_DEBUG_INFLATE === '1'

const debugLog = (message: string, extra?: Record<string, unknown>): void => {
  if (!DEBUG_INFLATE) return
  if (extra) {
    console.log(`[inflate] ${message}`, extra)
  } else {
    console.log(`[inflate] ${message}`)
  }
}

let supportsDecompressionStream: boolean | null = null

export const inflate = async (buffer: UniversalBuffer | Uint8Array): Promise<Uint8Array> => {
  if (supportsDecompressionStream === null) {
    supportsDecompressionStream = testDecompressionStream()
    debugLog('DecompressionStream support', { supported: supportsDecompressionStream })
  }
  
  const bufferSize = buffer instanceof UniversalBuffer 
    ? buffer.byteLength 
    : buffer instanceof Uint8Array 
      ? buffer.length 
      : buffer.length
  debugLog('Starting inflate', { 
    bufferSize, 
    isUniversalBuffer: buffer instanceof UniversalBuffer,
    usingDecompressionStream: supportsDecompressionStream
  })
  
  // Use Web Streams DecompressionStream everywhere (Node.js 18+ and browsers)
  // This avoids pako v2 compatibility issues
  if (supportsDecompressionStream) {
    const result = await browserInflate(buffer)
    debugLog('Inflate complete (DecompressionStream)', { 
      inputSize: bufferSize, 
      outputSize: result.length,
      compressionRatio: bufferSize > 0 ? (result.length / bufferSize).toFixed(2) : 'N/A'
    })
    return result
  }
  
  // Fallback to pako-stream only if DecompressionStream is not available
  // This should rarely happen in modern environments
  debugLog('Falling back to pako-stream')
  const { inflate: pakoInflate } = await import('./pako-stream.ts')
  const result = await pakoInflate(buffer)
  debugLog('Inflate complete (pako-stream)', { 
    inputSize: bufferSize, 
    outputSize: result.length,
    compressionRatio: bufferSize > 0 ? (result.length / bufferSize).toFixed(2) : 'N/A'
  })
  return result
}

const browserInflate = async (buffer: UniversalBuffer | Uint8Array): Promise<Uint8Array> => {
  debugLog('browserInflate: Creating DecompressionStream')
  const ds = new DecompressionStream('deflate')
  // Convert to concrete Uint8Array for Blob constructor
  // Create proper copy using underlying buffer
  const concreteBuffer = buffer instanceof UniversalBuffer
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : buffer
  debugLog('browserInflate: Creating Blob', { size: concreteBuffer.length })
  const blob = new Blob([concreteBuffer as BlobPart])
  const d = blob.stream().pipeThrough(ds)
  
  // Use a reader to collect chunks, so we can handle errors gracefully
  const reader = d.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalLength += value.length
    }
  } catch (error) {
    // Handle "Trailing junk" errors - if we got some data, use it
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    if ((errorMsg.includes('Trailing junk') || errorMsg.includes('TRAILING_JUNK') || 
         errorCode === 'ERR_TRAILING_JUNK_AFTER_STREAM_END') && chunks.length > 0) {
      debugLog('browserInflate: Got trailing junk error but have data, using partial result', { 
        error: errorMsg,
        chunksCollected: chunks.length,
        totalBytes: totalLength
      })
      // We have some decompressed data, combine it and return
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      return result
    }
    // Re-throw if it's not a trailing junk error or we have no data
    throw error
  } finally {
    reader.releaseLock()
  }
  
  // Combine all chunks
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  
  debugLog('browserInflate: Complete', { 
    inputSize: concreteBuffer.length, 
    outputSize: result.length 
  })
  return result
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

