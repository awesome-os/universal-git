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

