/* eslint-env node, browser */
/* global DecompressionStream */

/**
 * # Pako-Stream: Web Streams-based Zlib Decompression Library
 * 
 * This module provides a replacement for the `pako` library's decompression functionality,
 * using the native Web Streams API (`DecompressionStream`) while maintaining the critical
 * low-level control required for parsing concatenated zlib streams (like Git packfiles).
 * 
 * ## The Problem
 * 
 * Git packfiles contain multiple concatenated zlib-compressed objects. When decompressing
 * one object, `DecompressionStream` inevitably reads beyond the end of that object's zlib
 * stream into the next object's data. Unlike `pako` (which provides `avail_in` to report
 * unused bytes), `DecompressionStream` is a "black box" that doesn't expose how many
 * bytes it consumed from the input.
 * 
 * ## The Solution
 * 
 * This library implements a "Metering Strategy" using a "Buffering Proxy" pattern:
 * 
 * 1. **`streamingInflate`**: A low-level function that decompresses a zlib stream and
 *    uses binary search to find the exact byte boundary of the compressed stream.
 * 
 * 2. **`StatefulPackDecompressor`**: A proxy wrapper around `StreamReader` that buffers
 *    over-read bytes and re-serves them on subsequent reads, ensuring byte-perfect
 *    stream synchronization.
 * 
 * ## Key Features
 * 
 * - **Accurate Byte Tracking**: Uses binary search with output length verification to
 *   find the exact end of each zlib stream, even when `DecompressionStream` accepts
 *   truncated streams.
 * 
 * - **Performance Optimized**: Limits input reading to prevent buffering entire packfiles
 *   for small objects, and uses heuristic search bounds to minimize binary search overhead.
 * 
 * - **Stream-Compatible**: Works with both `StreamReader` instances and `AsyncIterable`
 *   sources, making it flexible for different use cases.
 * 
 * @module pako-stream
 */

import { UniversalBuffer } from './UniversalBuffer.ts'
import { InternalError } from '../errors/InternalError.ts'
import { StreamReader } from './StreamReader.ts'

// ============================================================================
// Public API: streamingInflate
// ============================================================================

/**
 * Decompresses a zlib/deflate stream and calculates exactly how many input bytes
 * formed the valid zlib stream.
 * 
 * This function solves the fundamental problem that `DecompressionStream` doesn't
 * expose how many bytes it consumed. It uses a binary search strategy to find the
 * exact boundary of the compressed stream.
 * 
 * @param readerOrIterable - A `StreamReader`, `StatefulPackDecompressor`, or
 *                           `AsyncIterable<Uint8Array | UniversalBuffer>` that provides
 *                           the compressed data.
 * @param expectedLength - Optional. The expected uncompressed size. If provided:
 *                         - Validates that the decompressed output matches this size
 *                         - Limits input reading to prevent over-reading large files
 *                         - Optimizes binary search bounds
 * 
 * @returns A promise resolving to:
 *   - `data`: The decompressed output as a `Uint8Array`
 *   - `chunks`: The raw compressed chunks that were read from the source
 *   - `usedBytes`: The exact number of bytes from `chunks` that formed the valid
 *                  zlib stream (i.e., the boundary between this object and the next)
 * 
 * @throws {InternalError} If the decompressed size doesn't match `expectedLength`
 * 
 * @example
 * ```typescript
 * const reader = new StreamReader(packfileStream)
 * const { data, usedBytes } = await streamingInflate(reader, 1024)
 * // data.length === 1024
 * // usedBytes tells us exactly where the next object starts
 * ```
 */
export async function streamingInflate(
  readerOrIterable: StreamReader | StatefulPackDecompressor | AsyncIterable<Uint8Array | UniversalBuffer>,
  expectedLength?: number
): Promise<{ data: Uint8Array; chunks: Uint8Array[]; usedBytes: number }> {
  
  // Detect if we have a reader (has .read method) or an async iterable
  const isReader = readerOrIterable && typeof (readerOrIterable as any).read === 'function'
  let chunkIterator: AsyncIterator<Uint8Array | UniversalBuffer> | undefined = undefined
  
  const chunks: Uint8Array[] = []
  let bytesRead = 0
  
  // Safety Limit: Prevent reading the whole file for small objects.
  // We assume compressed size won't exceed 2x uncompressed + 16KB padding.
  // This is critical for performance: without this, DecompressionStream might
  // buffer the entire 300KB packfile just to decompress a 1KB object.
  const safeInputLimit = expectedLength !== undefined 
    ? Math.max(expectedLength * 2 + 4096, 16384) 
    : Number.MAX_SAFE_INTEGER

  // Create a Metering ReadableStream that pulls small chunks (128 bytes) from the source.
  // Small chunks minimize over-reading while still being efficient.
  const readable = new ReadableStream({
    async pull(controller) {
      // Stop pulling if we've read enough to likely cover the object
      if (bytesRead >= safeInputLimit) {
        controller.close()
        return
      }
      
      try {
        let rawChunk: Uint8Array | UniversalBuffer | undefined
        
        if (isReader) {
          // Read small chunks to keep memory usage reasonable, but large enough for speed.
          // 128 bytes is a good balance for finding small object boundaries.
          rawChunk = await (readerOrIterable as StreamReader | StatefulPackDecompressor).read(128)
        } else {
          // Read from async iterable
          if (!chunkIterator) {
            chunkIterator = (readerOrIterable as AsyncIterable<Uint8Array | UniversalBuffer>)[Symbol.asyncIterator]()
          }
          if (!chunkIterator) {
            controller.close()
            return
          }
          const { value, done } = await chunkIterator.next()
          if (done) {
            controller.close()
            return
          }
          rawChunk = value
        }
        
        if (!rawChunk || rawChunk.length === 0) {
          controller.close()
          return
        }
        
        // Normalize to Uint8Array (handle UniversalBuffer)
        const chunk = rawChunk instanceof UniversalBuffer
          ? new Uint8Array(rawChunk.buffer, rawChunk.byteOffset, rawChunk.byteLength)
          : rawChunk

        chunks.push(chunk)
        bytesRead += chunk.length
        controller.enqueue(chunk)
      } catch (err) {
        controller.error(err)
      }
    }
  })

  // Decompress using native DecompressionStream
  const ds = new DecompressionStream('deflate')
  const decompressedStream = readable.pipeThrough(ds)
  const outReader = decompressedStream.getReader()
  
  const resultChunks: Uint8Array[] = []
  let totalLength = 0

  try {
    // Read all decompressed chunks
    while (true) {
      const { done, value } = await outReader.read()
      if (done) break
      resultChunks.push(value)
      totalLength += value.length
    }
  } catch (e: any) {
    // Ignore "Trailing Junk" errors - these are expected when DecompressionStream
    // finds the end of the zlib stream but there are extra bytes in the chunk.
    // We verify exact length in the binary search step, so this is safe to ignore.
    const msg = e.message || String(e)
    if (!msg.includes('Trailing junk') && 
        !msg.includes('TRAILING_JUNK') && 
        e.code !== 'ERR_TRAILING_JUNK_AFTER_STREAM_END') {
      throw e
    }
  } finally {
    outReader.releaseLock()
  }

  // Assemble the decompressed output into a single Uint8Array
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of resultChunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  // Validate length if expectedLength was provided
  if (expectedLength !== undefined && result.length !== expectedLength) {
    throw new InternalError(`Inflated object size is different: expected ${expectedLength}, got ${result.length}`)
  }

  // Find Exact Compressed Size via Binary Search
  // For readers, we can determine the exact boundary. For async iterables, we can't
  // "unread" bytes, so we use the total bytes read as an approximation.
  let usedBytes: number
  if (!isReader) {
    // For async iterables, we can't determine exact boundary, so use total bytes read
    usedBytes = bytesRead
  } else {
    // Use heuristic search to find the exact end of the zlib stream
    usedBytes = await measureCompressedSizeHeuristic(chunks, bytesRead, expectedLength)
  }

  return { data: result, chunks, usedBytes }
}

/**
 * Streaming inflate that yields chunks as they're decompressed.
 * 
 * Useful for processing large objects without loading everything into memory.
 * Note: This function does NOT calculate `usedBytes` - it's designed for streaming
 * scenarios where exact byte boundaries aren't needed.
 * 
 * @param chunks - An async iterable of compressed chunks
 * @yields Decompressed chunks as Uint8Array
 * 
 * @example
 * ```typescript
 * for await (const chunk of streamingInflateGenerator(compressedChunks)) {
 *   processChunk(chunk)
 * }
 * ```
 */
export async function* streamingInflateGenerator(
  chunks: AsyncIterable<Uint8Array | UniversalBuffer>
): AsyncGenerator<Uint8Array, void, unknown> {
  const ds = new DecompressionStream('deflate')
  
  // Create a ReadableStream from the chunks
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          // Convert UniversalBuffer to plain Uint8Array
          const chunkArray = chunk instanceof UniversalBuffer
            ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            : chunk
          controller.enqueue(chunkArray)
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    }
  })
  
  // Pipe through decompression stream
  const decompressed = readable.pipeThrough(ds)
  const reader = decompressed.getReader()
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}

// ============================================================================
// Public API: StatefulPackDecompressor
// ============================================================================

/**
 * A wrapper around `StreamReader` that supports "unreading" bytes.
 * 
 * This class implements the "Buffering Proxy" pattern to solve the over-reading
 * problem with `DecompressionStream`. When decompressing a zlib stream, the decompressor
 * inevitably reads beyond the end of that stream into the next object's data. This class
 * buffers those over-read bytes and re-serves them on subsequent reads, ensuring
 * byte-perfect stream synchronization.
 * 
 * ## How It Works
 * 
 * 1. Wraps a `StreamReader` and maintains an internal `overflow` buffer
 * 2. All read operations (`read()`, `byte()`) first consume from `overflow`, then
 *    fall back to the underlying reader
 * 3. When `readAndDecompressObject()` is called, it uses `streamingInflate()` to
 *    decompress the next object and calculates which bytes were over-read
 * 4. Over-read bytes are pushed back into `overflow` for the next read operation
 * 
 * ## Position Tracking
 * 
 * The `tell()` method returns the logical position in the stream, accounting for
 * buffered bytes: `physicalPosition - overflow.length`. This ensures that position
 * tracking remains accurate even when bytes are buffered.
 * 
 * @example
 * ```typescript
 * const rawReader = new StreamReader(packfileStream)
 * const reader = new StatefulPackDecompressor(rawReader)
 * 
 * // Parse header (consumes from overflow if available)
 * const { type, length } = await parseHeader(reader)
 * 
 * // Decompress object (handles over-reading automatically)
 * const { decompressed, bytesConsumed } = await reader.readAndDecompressObject(length)
 * 
 * // Position is accurate, ready for next object
 * const nextOffset = reader.tell()
 * ```
 */
export class StatefulPackDecompressor {
  private reader: StreamReader
  private overflow: Uint8Array

  /**
   * Creates a new `StatefulPackDecompressor` wrapping the given `StreamReader`.
   * 
   * @param reader - The underlying `StreamReader` to wrap
   */
  constructor(reader: StreamReader) {
    this.reader = reader
    this.overflow = new Uint8Array(0)
  }

  /**
   * Reads `n` bytes from the stream.
   * 
   * First consumes from the internal `overflow` buffer (if any), then reads from
   * the underlying `StreamReader` if more bytes are needed.
   * 
   * @param n - Number of bytes to read
   * @returns A `Uint8Array` or `UniversalBuffer` containing the bytes, or `undefined` if EOF
   */
  async read(n: number): Promise<Uint8Array | UniversalBuffer | undefined> {
    try {
      if (this.overflow.length > 0) {
        if (this.overflow.length >= n) {
          // We have enough bytes in overflow
          const chunk = this.overflow.slice(0, n)
          this.overflow = this.overflow.slice(n)
          return chunk
        } else {
          // We need more bytes - combine overflow with reader data
          const chunk = this.overflow
          this.overflow = new Uint8Array(0)
          const rest = await this.reader.read(n - chunk.length)
          if (!rest) return chunk
          
          const combined = new Uint8Array(chunk.length + rest.length)
          combined.set(chunk)
          // Handle UniversalBuffer or Uint8Array from reader
          const restArray = rest instanceof UniversalBuffer 
            ? new Uint8Array(rest.buffer, rest.byteOffset, rest.byteLength) 
            : rest
          combined.set(restArray, chunk.length)
          return combined
        }
      }
      return this.reader.read(n)
    } catch (err) {
      throw err
    }
  }

  /**
   * Reads a single byte from the stream.
   * 
   * First consumes from the internal `overflow` buffer (if any), then reads from
   * the underlying `StreamReader` if needed.
   * 
   * @returns The byte value (0-255), or `undefined` if EOF
   */
  async byte(): Promise<number | undefined> {
    try {
      if (this.overflow.length > 0) {
        const b = this.overflow[0]
        this.overflow = this.overflow.slice(1)
        return b
      }
      return this.reader.byte()
    } catch (err) {
      throw err
    }
  }

  /**
   * Returns the current logical position in the stream.
   * 
   * The logical position accounts for buffered bytes:
   * `logicalPosition = physicalPosition - overflow.length`
   * 
   * This ensures that position tracking remains accurate even when bytes are
   * buffered in the overflow.
   * 
   * @returns The current logical byte position
   */
  tell(): number {
    return this.reader.tell() - this.overflow.length
  }

  /**
   * Checks if the stream has reached end-of-file.
   * 
   * Returns `true` only if both the overflow buffer is empty AND the underlying
   * reader has reached EOF.
   * 
   * @returns `true` if EOF, `false` otherwise
   */
  eof(): boolean {
    return this.overflow.length === 0 && this.reader.eof()
  }

  /**
   * Decompresses the next zlib-compressed object from the stream.
   * 
   * This is the main method for decompressing objects in a packfile. It:
   * 1. Calls `streamingInflate()` to decompress the object and find the exact boundary
   * 2. Calculates which bytes were over-read (beyond the zlib stream end)
   * 3. Pushes over-read bytes back into the `overflow` buffer for subsequent reads
   * 4. Returns the decompressed data and exact byte count consumed
   * 
   * @param expectedLength - The expected uncompressed size of the object (from the header)
   * @returns A promise resolving to:
   *   - `decompressed`: The decompressed object data as `Uint8Array`
   *   - `bytesConsumed`: The exact number of compressed bytes consumed (including zlib overhead)
   * 
   * @throws {InternalError} If decompression fails or size mismatch occurs
   */
  async readAndDecompressObject(expectedLength: number): Promise<{
    decompressed: Uint8Array
    bytesConsumed: number
  }> {
    const startTell = this.tell()
    const startOverflow = new Uint8Array(this.overflow) // Save a copy of overflow before reading
    const startReaderPos = this.reader.tell() // Track physical reader position
    
    try {
      // Inflate using the `streamingInflate` helper.
      // It returns the data, the raw chunks it consumed from 'this', and the exact usedBytes.
      const { data, chunks, usedBytes } = await streamingInflate(this, expectedLength)

      // Calculate how many bytes came from reader vs overflow
      const endReaderPos = this.reader.tell()
      const bytesFromReader = endReaderPos - startReaderPos
      const totalReadSize = chunks.reduce((acc, c) => acc + c.length, 0)
      const bytesFromOverflow = Math.min(startOverflow.length, totalReadSize)
      
      // If we read more than the zlib stream needed, push leftovers back into overflow
      if (usedBytes < totalReadSize) {
        // Reconstruct the full read buffer to identify leftovers
        const allRead = new Uint8Array(totalReadSize)
        let cursor = 0
        for (const c of chunks) {
          allRead.set(c, cursor)
          cursor += c.length
        }

        const leftovers = allRead.slice(usedBytes)
        
        // Calculate which part of leftovers came from reader vs overflow
        if (usedBytes >= bytesFromOverflow) {
          // All overflow bytes were used, all leftovers are from reader
          this.overflow = leftovers
        } else {
          // Some overflow bytes remain unused
          const remainingOverflow = startOverflow.slice(usedBytes)
          const readerLeftoversStart = bytesFromOverflow
          const readerLeftoversEnd = totalReadSize
          const readerLeftovers = allRead.slice(readerLeftoversStart, readerLeftoversEnd)
          const newOverflow = new Uint8Array(remainingOverflow.length + readerLeftovers.length)
          newOverflow.set(remainingOverflow)
          newOverflow.set(readerLeftovers, remainingOverflow.length)
          this.overflow = newOverflow
        }
      } else {
        // All bytes were used - clear overflow if it was fully consumed
        if (bytesFromOverflow > 0 && usedBytes >= bytesFromOverflow) {
          this.overflow = new Uint8Array(0)
        }
      }
      
      return { 
        decompressed: data, 
        bytesConsumed: usedBytes 
      }
    } catch (err) {
      throw err
    }
  }
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Finds the exact length of the zlib stream using heuristic search.
 * 
 * This function reconstructs the full buffer from chunks and uses binary search
 * to find the exact byte boundary. It optimizes the search by limiting the range
 * based on `expectedLength` when available.
 * 
 * @param chunks - The raw compressed chunks that were read
 * @param totalSize - Total size of all chunks combined
 * @param expectedLength - Optional expected uncompressed size (for optimization)
 * @returns The exact number of bytes that form the valid zlib stream
 */
async function measureCompressedSizeHeuristic(
  chunks: Uint8Array[], 
  totalSize: number, 
  expectedLength?: number
): Promise<number> {
  if (chunks.length === 0) return 0
  
  // Reconstruct the full buffer for accurate searching
  const allData = new Uint8Array(totalSize)
  let cursor = 0
  for (const c of chunks) {
    allData.set(c, cursor)
    cursor += c.length
  }

  // Optimization: Don't search the entire buffer if we know the expected size.
  // We search up to (Expected * 3) or TotalSize, whichever is smaller.
  // The factor of 3 accounts for compression ratio (typically 2-3x for text).
  let maxSearch = totalSize
  if (expectedLength !== undefined) {
    const conservativeBound = Math.floor(expectedLength * 3) + 128
    if (conservativeBound < totalSize) {
      maxSearch = conservativeBound
    }
  }

  return binarySearchZlibEnd(allData, 0, maxSearch, expectedLength)
}

/**
 * Binary search for finding the exact length of the zlib stream.
 * 
 * **CRITICAL**: This function verifies that the decompressed output matches
 * `expectedLength` to find the true boundary. This is essential because
 * `DecompressionStream` can sometimes accept truncated zlib streams as "valid"
 * (especially if the ADLER32 checksum hasn't been fed yet). We must ensure
 * we find the byte prefix that produces the COMPLETE object, not just a prefix
 * that doesn't crash the decompressor.
 * 
 * @param data - The full compressed buffer to search
 * @param min - Minimum byte position to search (inclusive)
 * @param max - Maximum byte position to search (inclusive)
 * @param expectedLength - Optional expected uncompressed size (for verification)
 * @returns The exact number of bytes that form the valid zlib stream
 */
async function binarySearchZlibEnd(
  data: Uint8Array, 
  min: number, 
  max: number, 
  expectedLength?: number
): Promise<number> {
  let found = max

  while (min <= max) {
    const mid = Math.floor((min + max) / 2)
    if (mid === 0) { min = 1; continue }

    try {
      // This throws if output length != expectedLength
      await dryRunDecompress(data.slice(0, mid), expectedLength)
      
      // Valid stream found. Try smaller to find the minimal valid prefix.
      found = mid
      max = mid - 1
    } catch (e: any) {
      const msg = e.message || String(e)
      
      // If we have too much data (trailing junk) or mismatched size...
      if (msg.includes('Trailing junk') || 
          msg.includes('TRAILING_JUNK') || 
          e.code === 'ERR_TRAILING_JUNK_AFTER_STREAM_END' ||
          msg.includes('Too much data')) {
        // The slice `0..mid` was too big
        max = mid - 1
      } else {
        // "Unexpected end of file" or "Too little data" -> slice was too small
        min = mid + 1
      }
    }
  }
  return found
}

/**
 * Dry run decompression that verifies the output length matches `expectedLength`.
 * 
 * This function performs a test decompression of a byte slice and verifies that:
 * 1. The decompression completes without errors
 * 2. The output size exactly matches `expectedLength` (if provided)
 * 
 * This is critical for the binary search to find the true end of the compressed
 * stream, not just a prefix that doesn't crash the decompressor.
 * 
 * @param data - The byte slice to test decompress
 * @param expectedLength - Optional expected uncompressed size
 * @throws {Error} If decompression fails, output exceeds expected length, or
 *                 output doesn't match expected length exactly
 */
async function dryRunDecompress(data: Uint8Array, expectedLength?: number): Promise<void> {
  const ds = new DecompressionStream('deflate')
  const writer = ds.writable.getWriter()
  
  // We use a promise to catch async errors during writing/closing
  const writePromise = (async () => {
    await writer.write(new Uint8Array(data))
    await writer.close()
  })()

  const reader = ds.readable.getReader()
  let size = 0
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      
      // Fail fast if we exceed expected length
      if (expectedLength !== undefined && size > expectedLength) {
        throw new Error('Too much data')
      }
    }
    await writePromise // Ensure writing finished successfully
  } catch (e) {
    // Ensure we await the write promise to avoid unhandled rejections
    try { await writePromise } catch (_) {} 
    throw e
  } finally {
    reader.releaseLock()
    writer.releaseLock()
  }

  // Verify exact length match
  if (expectedLength !== undefined && size !== expectedLength) {
    throw new Error(`Too little data: expected ${expectedLength}, got ${size}`)
  }
}

// ============================================================================
// Utility Functions (ported from pako/lib/utils)
// ============================================================================

/**
 * Object.assign polyfill - assigns properties from sources to target object
 */
export function assign<T extends Record<string, any>>(obj: T, ...sources: Array<Partial<T>>): T {
  for (const source of sources) {
    if (!source) continue
    if (typeof source !== 'object') {
      throw new TypeError(`${source} must be non-object`)
    }
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        obj[key] = source[key] as any
      }
    }
  }
  return obj
}

/**
 * Join array of chunks to single Uint8Array
 */
export function flattenChunks(chunks: Uint8Array[]): Uint8Array {
  // Calculate total length
  let len = 0
  for (let i = 0; i < chunks.length; i++) {
    len += chunks[i].length
  }

  // Join chunks
  const result = new Uint8Array(len)
  for (let i = 0, pos = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    result.set(chunk, pos)
    pos += chunk.length
  }

  return result
}

/**
 * Convert string to Uint8Array (UTF-8 encoded)
 */
export function string2buf(str: string): Uint8Array {
  if (typeof TextEncoder === 'function' && TextEncoder.prototype.encode) {
    return new TextEncoder().encode(str)
  }

  let buf: Uint8Array
  let c: number
  let c2: number
  let m_pos: number
  let i: number
  const str_len = str.length
  let buf_len = 0

  // Count binary size
  for (m_pos = 0; m_pos < str_len; m_pos++) {
    c = str.charCodeAt(m_pos)
    if ((c & 0xfc00) === 0xd800 && (m_pos + 1 < str_len)) {
      c2 = str.charCodeAt(m_pos + 1)
      if ((c2 & 0xfc00) === 0xdc00) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
        m_pos++
      }
    }
    buf_len += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }

  // Allocate Uint8Array
  buf = new Uint8Array(buf_len)

  // Convert
  for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
    c = str.charCodeAt(m_pos)
    if ((c & 0xfc00) === 0xd800 && (m_pos + 1 < str_len)) {
      c2 = str.charCodeAt(m_pos + 1)
      if ((c2 & 0xfc00) === 0xdc00) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
        m_pos++
      }
    }
    if (c < 0x80) {
      /* one byte */
      buf[i++] = c
    } else if (c < 0x800) {
      /* two bytes */
      buf[i++] = 0xC0 | (c >>> 6)
      buf[i++] = 0x80 | (c & 0x3f)
    } else if (c < 0x10000) {
      /* three bytes */
      buf[i++] = 0xE0 | (c >>> 12)
      buf[i++] = 0x80 | (c >>> 6 & 0x3f)
      buf[i++] = 0x80 | (c & 0x3f)
    } else {
      /* four bytes */
      buf[i++] = 0xf0 | (c >>> 18)
      buf[i++] = 0x80 | (c >>> 12 & 0x3f)
      buf[i++] = 0x80 | (c >>> 6 & 0x3f)
      buf[i++] = 0x80 | (c & 0x3f)
    }
  }

  return buf
}

/**
 * Helper to convert buffer to binary string
 */
const buf2binstring = (buf: Uint8Array, len: number): string => {
  // On Chrome, the arguments in a function call that are allowed is `65534`.
  // If the length of the Uint8Array is smaller than that, we can use this optimization,
  // otherwise we will take a slower path.
  if (len < 65534) {
    if (buf.subarray) {
      try {
        return String.fromCharCode.apply(null, buf.length === len ? Array.from(buf) : Array.from(buf.subarray(0, len)))
      } catch {
        // Fall through to slow path
      }
    }
  }

  let result = ''
  for (let i = 0; i < len; i++) {
    result += String.fromCharCode(buf[i])
  }
  return result
}

/**
 * Convert Uint8Array to string (UTF-8 decoded)
 */
export function buf2string(buf: Uint8Array, max?: number): string {
  const len = max ?? buf.length

  if (typeof TextDecoder === 'function' && TextDecoder.prototype.decode) {
    return new TextDecoder().decode(buf.subarray(0, len))
  }

  // UTF-8 length table
  const _utf8len = new Uint8Array(256)
  for (let q = 0; q < 256; q++) {
    _utf8len[q] = (q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1)
  }
  _utf8len[254] = _utf8len[254] = 1 // Invalid sequence start

  let i: number
  let out: number

  // Reserve max possible length (2 words per char)
  // NB: by unknown reasons, Array is significantly faster for
  //     String.fromCharCode.apply than Uint16Array.
  const utf16buf = new Array(len * 2)

  for (out = 0, i = 0; i < len;) {
    let c = buf[i++]
    // quick process ascii
    if (c < 0x80) { utf16buf[out++] = c; continue }

    let c_len = _utf8len[c]
    // skip 5 & 6 byte codes
    if (c_len > 4) { utf16buf[out++] = 0xfffd; i += c_len - 1; continue }

    // apply mask on first byte
    c &= c_len === 2 ? 0x1f : c_len === 3 ? 0x0f : 0x07
    // join the rest
    while (c_len > 1 && i < len) {
      c = (c << 6) | (buf[i++] & 0x3f)
      c_len--
    }

    // terminated by end of string?
    if (c_len > 1) { utf16buf[out++] = 0xfffd; continue }

    if (c < 0x10000) {
      utf16buf[out++] = c
    } else {
      c -= 0x10000
      utf16buf[out++] = 0xd800 | ((c >> 10) & 0x3ff)
      utf16buf[out++] = 0xdc00 | (c & 0x3ff)
    }
  }

  return buf2binstring(new Uint8Array(utf16buf), out)
}

/**
 * Calculate max possible position in utf8 Uint8Array,
 * that will not break sequence. If that's not possible
 * - (very small limits) return max size as is.
 */
export function utf8border(buf: Uint8Array, max: number = buf.length): number {
  if (max > buf.length) { max = buf.length }

  // UTF-8 length table
  const _utf8len = new Uint8Array(256)
  for (let q = 0; q < 256; q++) {
    _utf8len[q] = (q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1)
  }
  _utf8len[254] = _utf8len[254] = 1 // Invalid sequence start

  // go back from last position, until start of sequence found
  let pos = max - 1
  while (pos >= 0 && (buf[pos] & 0xC0) === 0x80) { pos-- }

  // Very small and broken sequence,
  // return max, because we should return something anyway.
  if (pos < 0) { return max }

  // If we came to start of Uint8Array - that means Uint8Array is too small,
  // return max too.
  if (pos === 0) { return max }

  return (pos + _utf8len[buf[pos]] > max) ? pos : max
}

// ============================================================================
// Constants (ported from pako/lib/zlib/constants.js)
// ============================================================================

// --- Allowed flush values ---
export const Z_NO_FLUSH = 0
export const Z_PARTIAL_FLUSH = 1
export const Z_SYNC_FLUSH = 2
export const Z_FULL_FLUSH = 3
export const Z_FINISH = 4
export const Z_BLOCK = 5
export const Z_TREES = 6

// --- Return codes ---
export const Z_OK = 0
export const Z_STREAM_END = 1
export const Z_NEED_DICT = 2
export const Z_ERRNO = -1
export const Z_STREAM_ERROR = -2
export const Z_DATA_ERROR = -3
export const Z_MEM_ERROR = -4
export const Z_BUF_ERROR = -5

// --- Compression levels ---
export const Z_NO_COMPRESSION = 0
export const Z_BEST_SPEED = 1
export const Z_BEST_COMPRESSION = 9
export const Z_DEFAULT_COMPRESSION = -1

// --- Compression strategy values ---
export const Z_FILTERED = 1
export const Z_HUFFMAN_ONLY = 2
export const Z_RLE = 3
export const Z_FIXED = 4
export const Z_DEFAULT_STRATEGY = 0

// --- Possible data_type values ---
export const Z_BINARY = 0
export const Z_TEXT = 1
export const Z_UNKNOWN = 2

// --- The deflate compression method ---
export const Z_DEFLATED = 8

// ============================================================================
// Simple Compression/Decompression Functions
// ============================================================================

/**
 * Compresses data using deflate algorithm (zlib wrapper)
 * 
 * This is a simple, non-streaming version that compresses the entire buffer at once.
 * For streaming compression, use CompressionStream directly.
 * 
 * @param data - Input data to compress (Uint8Array, UniversalBuffer, or string)
 * @param options - Optional compression options (currently unused, for API compatibility)
 * @returns Compressed data as Uint8Array
 */
export async function deflate(
  data: Uint8Array | UniversalBuffer | string,
  options?: Record<string, any>
): Promise<Uint8Array> {
  // Convert string to buffer if needed
  let buffer: Uint8Array
  if (typeof data === 'string') {
    buffer = string2buf(data)
  } else if (data instanceof UniversalBuffer) {
    buffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  } else {
    buffer = data
  }

  const cs = new CompressionStream('deflate')
  const blob = new Blob([buffer])
  const compressed = blob.stream().pipeThrough(cs)
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

/**
 * Compresses data using raw deflate (no zlib wrapper)
 * 
 * Note: CompressionStream doesn't support raw deflate directly.
 * This function currently uses deflate format (zlib wrapper).
 * For true raw deflate, you would need a different implementation.
 * 
 * @param data - Input data to compress
 * @param options - Optional compression options
 * @returns Compressed data as Uint8Array
 */
export async function deflateRaw(
  data: Uint8Array | UniversalBuffer | string,
  options?: Record<string, any>
): Promise<Uint8Array> {
  // CompressionStream doesn't support raw deflate, so we use deflate format
  // This is a limitation of the Web Streams API
  return deflate(data, options)
}

/**
 * Compresses data using gzip format
 * 
 * @param data - Input data to compress
 * @param options - Optional compression options (including gzip header options)
 * @returns Compressed data as Uint8Array
 */
export async function gzip(
  data: Uint8Array | UniversalBuffer | string,
  options?: Record<string, any>
): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  
  // Convert string to buffer if needed
  let buffer: Uint8Array
  if (typeof data === 'string') {
    buffer = string2buf(data)
  } else if (data instanceof UniversalBuffer) {
    buffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  } else {
    buffer = data
  }

  const blob = new Blob([buffer])
  const compressed = blob.stream().pipeThrough(cs)
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

/**
 * Decompresses data using inflate algorithm (zlib wrapper)
 * 
 * This is a simple, non-streaming version that decompresses the entire buffer at once.
 * For streaming decompression or packfile parsing, use streamingInflate() instead.
 * 
 * @param data - Compressed data to decompress
 * @param options - Optional decompression options
 * @returns Decompressed data as Uint8Array
 */
export async function inflate(
  data: Uint8Array | UniversalBuffer,
  options?: Record<string, any>
): Promise<Uint8Array> {
  // Convert UniversalBuffer to Uint8Array if needed
  const buffer = data instanceof UniversalBuffer
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : data

  const ds = new DecompressionStream('deflate')
  const blob = new Blob([buffer])
  const decompressed = blob.stream().pipeThrough(ds)
  
  // Collect all chunks
  const reader = decompressed.getReader()
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
    // Handle "Trailing junk" errors gracefully
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    if ((errorMsg.includes('Trailing junk') || errorMsg.includes('TRAILING_JUNK') || 
         errorCode === 'ERR_TRAILING_JUNK_AFTER_STREAM_END') && chunks.length > 0) {
      // We have some decompressed data, use it
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      return result
    }
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
  
  return result
}

/**
 * Decompresses data using raw inflate (no zlib wrapper)
 * 
 * Note: DecompressionStream doesn't support raw inflate directly.
 * This function currently uses deflate format (zlib wrapper).
 * For true raw inflate, you would need a different implementation.
 * 
 * @param data - Compressed data to decompress
 * @param options - Optional decompression options
 * @returns Decompressed data as Uint8Array
 */
export async function inflateRaw(
  data: Uint8Array | UniversalBuffer,
  options?: Record<string, any>
): Promise<Uint8Array> {
  // DecompressionStream doesn't support raw inflate, so we use deflate format
  // This is a limitation of the Web Streams API
  return inflate(data, options)
}

/**
 * Decompresses gzip data
 * 
 * @param data - Compressed gzip data to decompress
 * @param options - Optional decompression options
 * @returns Decompressed data as Uint8Array
 */
export async function ungzip(
  data: Uint8Array | UniversalBuffer,
  options?: Record<string, any>
): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  
  // Convert UniversalBuffer to Uint8Array if needed
  const buffer = data instanceof UniversalBuffer
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : data

  const blob = new Blob([buffer])
  const decompressed = blob.stream().pipeThrough(ds)
  
  // Collect all chunks
  const reader = decompressed.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalLength += value.length
    }
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
  
  return result
}

