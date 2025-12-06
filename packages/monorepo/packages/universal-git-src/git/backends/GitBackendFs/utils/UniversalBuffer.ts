/**
 * UniversalBuffer - A cross-platform Buffer polyfill based on Uint8Array
 * 
 * This class provides Buffer-like functionality that works in both Node.js and browser environments.
 * It extends Uint8Array to ensure compatibility with existing code while providing proper iterator support.
 * 
 * Key features:
 * - Based on Uint8Array (works everywhere)
 * - Implements only the Buffer methods actually used in the codebase
 * - Proper iterator support for async iterables
 * - Type-safe and compatible with existing Buffer usage
 */

export type BufferEncoding = 'utf8' | 'hex' | 'ascii' | 'latin1' | 'base64'

// Type alias for Node.js Buffer (for compatibility in type annotations)
// In Node.js, this refers to the global Buffer type
// In browser environments, this will be undefined but TypeScript will still allow the type annotation
type NodeBuffer = typeof globalThis extends { Buffer: infer T } ? T : Uint8Array

export class UniversalBuffer extends Uint8Array {
  /**
   * Creates a UniversalBuffer from various input types
   * This is the primary factory method for creating UniversalBuffer instances
   * Handles null/undefined by returning an empty buffer
   * 
   * Overloads are provided to maintain compatibility with Uint8Array.from() signature
   * while also supporting Buffer-like functionality with encoding options
   */
  static from(
    input: string | Uint8Array | ArrayBuffer | number[] | UniversalBuffer | Buffer | null | undefined,
    encoding?: BufferEncoding
  ): UniversalBuffer
  // Overload for Uint8Array.from() compatibility
  static from(arrayLike: ArrayLike<number>): UniversalBuffer
  static from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): UniversalBuffer
  static from(elements: Iterable<number>): UniversalBuffer
  static from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): UniversalBuffer
  static from(
    input: string | Uint8Array | ArrayBuffer | number[] | UniversalBuffer | Buffer | ArrayLike<number> | Iterable<number> | null | undefined,
    encodingOrMapfn?: BufferEncoding | ((v: any, k: number) => number),
    thisArg?: any
  ): UniversalBuffer {
    // Handle null/undefined
    if (input == null) {
      return new UniversalBuffer(0)
    }
    
    // Handle mapfn parameter (Uint8Array.from() compatibility)
    if (typeof encodingOrMapfn === 'function') {
      const mapfn = encodingOrMapfn
      if (typeof input === 'object' && input !== null) {
        if (Array.isArray(input) || typeof (input as any).length === 'number') {
          // ArrayLike with mapfn
          const arrayLike = input as ArrayLike<any>
          const mapped = Array.from(arrayLike, mapfn, thisArg)
          return new UniversalBuffer(mapped)
        } else if (Symbol.iterator in input) {
          // Iterable with mapfn
          const mapped = Array.from(input as Iterable<any>, mapfn, thisArg)
          return new UniversalBuffer(mapped)
        }
      }
    }
    
    // Handle encoding parameter (Buffer-like functionality)
    const encoding = typeof encodingOrMapfn === 'string' ? encodingOrMapfn : undefined
    
    // Handle UniversalBuffer or Buffer instances
    if (input instanceof UniversalBuffer) {
      return input
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input)) {
      // Convert Node.js Buffer to UniversalBuffer
      return new UniversalBuffer(input)
    }
    if (typeof input === 'string') {
      if (encoding === 'hex') {
        // Convert hex string to bytes
        const bytes: number[] = []
        for (let i = 0; i < input.length; i += 2) {
          bytes.push(parseInt(input.slice(i, i + 2), 16))
        }
        return new UniversalBuffer(bytes)
      } else if (encoding === 'base64') {
        // Decode base64 string to bytes
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        const bytes: number[] = []
        
        // Count padding characters
        let paddingCount = 0
        if (input.endsWith('==')) {
          paddingCount = 2
        } else if (input.endsWith('=')) {
          paddingCount = 1
        }
        
        const base64 = input.replace(/=+$/, '')
        
        for (let i = 0; i < base64.length; i += 4) {
          // Get 4 base64 characters and convert to 24-bit value
          const enc1 = chars.indexOf(base64.charAt(i))
          const enc2 = chars.indexOf(base64.charAt(i + 1))
          const enc3 = i + 2 < base64.length ? chars.indexOf(base64.charAt(i + 2)) : -1
          const enc4 = i + 3 < base64.length ? chars.indexOf(base64.charAt(i + 3)) : -1
          
          if (enc1 === -1 || enc2 === -1) {
            throw new Error('Invalid base64 string')
          }
          
          const bitmap = (enc1 << 18) | (enc2 << 12) | ((enc3 !== -1 ? enc3 : 0) << 6) | (enc4 !== -1 ? enc4 : 0)
          
          // Extract bytes based on padding
          bytes.push((bitmap >> 16) & 255)
          if (enc3 !== -1 && (i + 2 < base64.length || paddingCount < 2)) {
            bytes.push((bitmap >> 8) & 255)
          }
          if (enc4 !== -1 && (i + 3 < base64.length || paddingCount < 1)) {
            bytes.push(bitmap & 255)
          }
        }
        
        return new UniversalBuffer(bytes)
      } else {
        // Default to utf8
        const encoder = new TextEncoder()
        return new UniversalBuffer(encoder.encode(input))
      }
    } else if (input instanceof Uint8Array) {
      return new UniversalBuffer(input)
    } else if (input instanceof ArrayBuffer) {
      return new UniversalBuffer(input)
    } else if (Array.isArray(input)) {
      return new UniversalBuffer(input)
    } else if (input && typeof (input as any).length === 'number') {
      // ArrayLike (Uint8Array.from() compatibility)
      return new UniversalBuffer(Array.from(input as ArrayLike<number>))
    } else if (input && Symbol.iterator in input) {
      // Iterable (Uint8Array.from() compatibility)
      return new UniversalBuffer(Array.from(input as Iterable<number>))
    } else {
      throw new TypeError('Invalid input type for UniversalBuffer.from')
    }
  }

  /**
   * @deprecated Use UniversalBuffer.from() instead. This method is kept for backward compatibility only.
   * Unified helper to convert any buffer-like type to UniversalBuffer
   * This method handles Buffer, UniversalBuffer, Uint8Array, and other compatible types
   * Use UniversalBuffer.from() instead when you need to ensure a value is a UniversalBuffer regardless of input type
   */
  static bufferFrom(
    input: string | Uint8Array | ArrayBuffer | number[] | UniversalBuffer | Buffer | null | undefined,
    encoding?: BufferEncoding
  ): UniversalBuffer {
    // Delegate to from() which now handles all cases including null/undefined
    return UniversalBuffer.from(input, encoding)
  }

  /**
   * Allocates a new UniversalBuffer of the specified size
   */
  static alloc(size: number, fill?: number | string, encoding?: BufferEncoding): UniversalBuffer {
    const buffer = new UniversalBuffer(size)
    if (fill !== undefined) {
      if (typeof fill === 'number') {
        buffer.fill(fill)
      } else if (typeof fill === 'string') {
        if (encoding === 'hex') {
          const fillBuffer = UniversalBuffer.from(fill, 'hex')
          for (let i = 0; i < size; i++) {
            buffer[i] = fillBuffer[i % fillBuffer.length]
          }
        } else {
          const fillBuffer = UniversalBuffer.from(fill, encoding)
          for (let i = 0; i < size; i++) {
            buffer[i] = fillBuffer[i % fillBuffer.length]
          }
        }
      }
    }
    return buffer
  }

  /**
   * Checks if a value is a UniversalBuffer or Node.js Buffer
   */
  static isBuffer(value: unknown): value is UniversalBuffer | NodeBuffer {
    return value instanceof UniversalBuffer || (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value))
  }

  /**
   * Returns the byte length of a string when encoded
   * This is a static method like Buffer.byteLength
   * @param string - The string to measure
   * @param encoding - The encoding to use (default: 'utf8')
   * @returns The byte length
   */
  static byteLength(string: string, encoding: BufferEncoding = 'utf8'): number {
    if (encoding === 'utf8' || encoding === 'ascii' || encoding === 'latin1') {
      return new TextEncoder().encode(string).length
    } else if (encoding === 'hex') {
      return Math.ceil(string.length / 2)
    } else if (encoding === 'base64') {
      // Base64 encoding: 4 chars represent 3 bytes
      // Remove padding
      const base64 = string.replace(/=+$/, '')
      return Math.floor((base64.length * 3) / 4)
    }
    // Default to utf8
    return new TextEncoder().encode(string).length
  }

  /**
   * Concatenates an array of buffers into a single buffer
   */
  static concat(buffers: (UniversalBuffer | Uint8Array | Buffer)[], totalLength?: number): UniversalBuffer {
    if (buffers.length === 0) {
      return new UniversalBuffer(0)
    }

    // Calculate total length if not provided
    if (totalLength === undefined) {
      totalLength = 0
      for (const buf of buffers) {
        totalLength += buf.length
      }
    }

    const result = new UniversalBuffer(totalLength)
    let offset = 0
    for (const buf of buffers) {
      const uint8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
      result.set(uint8, offset)
      offset += uint8.length
    }
    return result
  }

  /**
   * Creates an async iterable stream from an array of buffers
   * This is useful for creating streams from buffer arrays, commonly used in wire protocol tests
   * and when working with async iterables that consume buffers
   * 
   * @param buffers - Array of buffers to stream
   * @returns Async iterable iterator that yields each buffer in sequence
   * 
   * @example
   * ```typescript
   * const buffers = [
   *   UniversalBuffer.from('hello'),
   *   UniversalBuffer.from('world')
   * ]
   * const stream = UniversalBuffer.createStream(buffers)
   * for await (const chunk of stream) {
   *   console.log(chunk) // yields each buffer
   * }
   * ```
   */
  static async *createStream(
    buffers: (UniversalBuffer | Uint8Array | Buffer)[]
  ): AsyncIterableIterator<Uint8Array> {
    for (const buffer of buffers) {
      // Convert to Uint8Array for compatibility with async iterables
      // Check UniversalBuffer first since it extends Uint8Array
      if (buffer instanceof UniversalBuffer) {
        yield buffer
      } else if (buffer instanceof Uint8Array) {
        yield buffer
      } else {
        // Handle Node.js Buffer
        yield new Uint8Array(buffer)
      }
    }
  }

  /**
   * Creates an async iterable iterator from an array of buffers
   * This is an alias for createStream() for consistency with test helper naming
   * 
   * @deprecated Use UniversalBuffer.createStream() instead. This method is kept for backward compatibility.
   * 
   * @example
   * const buffers = [UniversalBuffer.from('hello'), UniversalBuffer.from(' world')]
   * const iterator = UniversalBuffer.createAsyncIterator(buffers)
   * for await (const chunk of iterator) {
   *   console.log(chunk.toString('utf8'))
   * }
   */
  static async *createAsyncIterator(
    chunks: (UniversalBuffer | Uint8Array | Buffer)[]
  ): AsyncIterableIterator<UniversalBuffer | Uint8Array> {
    // Delegate to createStream for consistency
    yield* UniversalBuffer.createStream(chunks)
  }

  /**
   * Converts a Node.js stream to an Async Iterator
   * 
   * This method provides a reliable way to convert Node.js streams into async iterators.
   * It first checks if the stream already implements Symbol.asyncIterator (native async iteration).
   * If not, it implements a queue-based approach that handles stream events ('data', 'error', 'end')
   * and converts them into async iterator results.
   * 
   * Implementation notes:
   * - Uses an internal queue to buffer stream data chunks
   * - Handles backpressure by deferring Promise resolution until data is available
   * - Properly handles stream errors and end events
   * - This approach was chosen after evaluating multiple alternatives including
   *   stream-to-async-iterator modules and direct stream.read() methods, as it provides
   *   the most reliable behavior across different Node.js stream implementations
   * 
   * @param stream - The Node.js stream to convert
   * @returns An async iterable iterator that yields stream chunks
   * 
   * @example
   * const stream = fs.createReadStream('file.txt')
   * const iterator = UniversalBuffer.fromNodeStream(stream)
   * for await (const chunk of iterator) {
   *   console.log(chunk.toString('utf8'))
   * }
   */
  static fromNodeStream<T = UniversalBuffer>(stream: any): AsyncIterableIterator<T> {
    // Check if stream already implements async iteration (Node.js 10.17.0+)
    const asyncIterator = Object.getOwnPropertyDescriptor(
      stream,
      Symbol.asyncIterator
    )
    if (asyncIterator && asyncIterator.enumerable) {
      return stream
    }
    
    // Fallback implementation: Convert stream events to async iterator
    // This approach uses a queue to buffer chunks and deferred promises to handle
    // the asynchronous nature of stream events while maintaining iterator semantics
    // Internal state for queue-based stream conversion
    let ended = false
    const queue: T[] = []
    // Deferred promise handlers for backpressure management
    let defer: { resolve?: (value: IteratorResult<T>) => void; reject?: (err: any) => void } = {}
    
    // Handle incoming data chunks from the stream
    stream.on('data', (chunk: T) => {
      queue.push(chunk)
      // If there's a pending promise waiting for data, resolve it immediately
      if (defer.resolve) {
        defer.resolve({ value: queue.shift()!, done: false })
        defer = {}
      }
    })
    
    // Handle stream errors by rejecting pending promises
    stream.on('error', (err: any) => {
      if (defer.reject) {
        defer.reject(err)
        defer = {}
      }
    })
    
    // Handle stream end by marking as ended and resolving any pending promises
    stream.on('end', () => {
      ended = true
      if (defer.resolve) {
        defer.resolve({ done: true } as IteratorResult<T>)
        defer = {}
      }
    })
    return {
      /**
       * Returns the next chunk from the stream
       * If data is available in the queue, returns it immediately.
       * If the stream has ended, returns done: true.
       * Otherwise, defers resolution until data arrives or stream ends.
       */
      next(): Promise<IteratorResult<T>> {
        return new Promise((resolve, reject) => {
          // Stream has ended and queue is empty
          if (queue.length === 0 && ended) {
            return resolve({ done: true } as IteratorResult<T>)
          }
          // Data is available in queue, return it immediately
          else if (queue.length > 0) {
            return resolve({ value: queue.shift()!, done: false })
          }
          // No data yet, defer resolution until data arrives or stream ends
          else if (queue.length === 0 && !ended) {
            defer = { resolve, reject }
          }
        })
      },
      
      /**
       * Cleanup method called when iterator is closed
       * Removes all event listeners and destroys the stream if possible
       */
      return(): Promise<IteratorResult<T>> {
        stream.removeAllListeners()
        if (stream.destroy) stream.destroy()
        return Promise.resolve({ done: true } as IteratorResult<T>)
      },
      
      /**
       * Makes this object iterable via for-await-of loops
       */
      [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        return this
      },
    }
  }

  /**
   * Converts the buffer to a string using the specified encoding
   * 
   * @param encoding - The character encoding to use ('utf8', 'hex', 'ascii', 'latin1', 'base64')
   * @param start - Optional start offset (default: 0)
   * @param end - Optional end offset (default: buffer.length)
   * @returns The string representation of the buffer
   * @throws Error if the encoding is not supported
   */
  toString(encoding?: BufferEncoding, start?: number, end?: number): string {
    const enc = encoding || 'utf8'
    const slice = start !== undefined || end !== undefined 
      ? this.slice(start, end)
      : this

    if (enc === 'hex') {
      return Array.from(slice)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    } else if (enc === 'utf8' || enc === 'ascii' || enc === 'latin1') {
      const decoder = new TextDecoder(enc === 'utf8' ? 'utf-8' : enc)
      return decoder.decode(slice)
    } else if (enc === 'base64') {
      // Base64 encoding implementation
      // Converts binary data to Base64 string using the standard Base64 character set
      // Groups bytes into 24-bit chunks (3 bytes) and encodes as 4 Base64 characters
      // Pads with '=' characters when the input length is not divisible by 3
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let result = ''
      for (let i = 0; i < slice.length; i += 3) {
        const a = slice[i]
        const b = slice[i + 1] ?? 0
        const c = slice[i + 2] ?? 0
        // Combine 3 bytes into a 24-bit value
        const bitmap = (a << 16) | (b << 8) | c
        // Extract 6-bit groups and map to Base64 characters
        result += chars.charAt((bitmap >> 18) & 63)
        result += chars.charAt((bitmap >> 12) & 63)
        // Add padding if needed (when less than 3 bytes remain)
        result += i + 1 < slice.length ? chars.charAt((bitmap >> 6) & 63) : '='
        result += i + 2 < slice.length ? chars.charAt(bitmap & 63) : '='
      }
      return result
    }
    throw new Error(`Unsupported encoding: ${enc}`)
  }

  /**
   * Writes a string to the buffer at the specified offset
   * 
   * @param value - The string to write
   * @param offset - The offset in the buffer to start writing
   * @param length - The maximum number of bytes to write
   * @param encoding - The character encoding to use (default: 'utf8')
   * @returns The number of bytes written
   */
  write(value: string, offset: number, length: number, encoding?: BufferEncoding): number {
    const enc = encoding || 'utf8'
    if (enc === 'hex') {
      // Convert hex string to bytes and write to buffer
      // Each pair of hex characters represents one byte
      for (let i = 0; i < length && i * 2 < value.length; i++) {
        const hexByte = value.slice(i * 2, i * 2 + 2)
        this[offset + i] = parseInt(hexByte, 16)
      }
      return Math.min(length, Math.floor(value.length / 2))
    } else {
      // Encode string as text using the specified encoding
      const encoder = new TextEncoder()
      const encoded = encoder.encode(value)
      // Write only as many bytes as fit in the available space
      const bytesToWrite = Math.min(length, encoded.length, this.length - offset)
      this.set(encoded.slice(0, bytesToWrite), offset)
      return bytesToWrite
    }
  }

  /**
   * Finds the index of a value in the buffer
   * 
   * @param value - The value to search for (number, string, or buffer)
   * @param byteOffset - Optional offset to start searching from (default: 0)
   * @returns The index of the first occurrence, or -1 if not found
   */
  indexOf(value: number | string | UniversalBuffer | Uint8Array, byteOffset?: number): number {
    if (typeof value === 'number') {
      const start = byteOffset ?? 0
      for (let i = start; i < this.length; i++) {
        if (this[i] === value) return i
      }
      return -1
    } else if (typeof value === 'string') {
      const searchBuffer = UniversalBuffer.from(value)
      return this.indexOf(searchBuffer, byteOffset)
    } else {
      // Search for a buffer or Uint8Array pattern within this buffer
      // Uses a naive string matching algorithm (similar to substring search)
      const search = value instanceof Uint8Array ? value : new Uint8Array(value)
      const start = byteOffset ?? 0
      
      // Edge cases: empty pattern matches at start, pattern too long returns -1
      if (search.length === 0) return start
      if (search.length > this.length - start) return -1

      // Brute force search: try each position and compare bytes
      outer: for (let i = start; i <= this.length - search.length; i++) {
        for (let j = 0; j < search.length; j++) {
          if (this[i + j] !== search[j]) continue outer
        }
        return i
      }
      return -1
    }
  }

  /**
   * Copies data from this buffer to a target buffer
   * 
   * @param target - The destination buffer
   * @param targetStart - The offset in the target buffer to start writing (default: 0)
   * @param sourceStart - The offset in this buffer to start reading from (default: 0)
   * @param sourceEnd - The offset in this buffer to stop reading at (default: buffer.length)
   * @returns The number of bytes copied
   */
  copy(
    target: UniversalBuffer | Uint8Array,
    targetStart: number = 0,
    sourceStart: number = 0,
    sourceEnd: number = this.length
  ): number {
    const sourceLength = sourceEnd - sourceStart
    const targetLength = target.length - targetStart
    const length = Math.min(sourceLength, targetLength)
    
    for (let i = 0; i < length; i++) {
      target[targetStart + i] = this[sourceStart + i]
    }
    return length
  }

  /**
   * Compares this buffer with another buffer and returns true if they are equal
   * Performs a byte-by-byte comparison of the buffer contents
   * 
   * @param other - The buffer to compare with
   * @returns true if buffers have the same length and identical byte values, false otherwise
   */
  equals(other: UniversalBuffer | Uint8Array | Buffer): boolean {
    if (this === other) return true
    if (this.length !== other.length) return false
    
    for (let i = 0; i < this.length; i++) {
      if (this[i] !== other[i]) return false
    }
    
    return true
  }

  /**
   * Fills the buffer with a specified value
   * @param value - The value to fill with (number, string, or buffer)
   * @param offset - Start offset (default: 0)
   * @param end - End offset (default: buffer.length)
   * @param encoding - Encoding for string values (default: 'utf8')
   * @returns This buffer instance
   */
  fill(value: number | string | UniversalBuffer | Uint8Array, offset: number = 0, end: number = this.length, encoding: BufferEncoding = 'utf8'): this {
    if (typeof value === 'number') {
      for (let i = offset; i < end && i < this.length; i++) {
        this[i] = value & 0xFF
      }
    } else if (typeof value === 'string') {
      const fillBuffer = UniversalBuffer.from(value, encoding)
      for (let i = offset; i < end && i < this.length; i++) {
        this[i] = fillBuffer[i % fillBuffer.length]
      }
    } else if (value instanceof Uint8Array) {
      for (let i = offset; i < end && i < this.length; i++) {
        this[i] = value[i % value.length]
      }
    }
    return this
  }

  /**
   * Reads an unsigned 8-bit integer from the buffer at the specified offset
   * 
   * @param offset - The offset to read from
   * @returns The 8-bit unsigned integer value (0-255)
   * @throws RangeError if offset is out of bounds
   */
  readUInt8(offset: number): number {
    if (offset < 0 || offset >= this.length) {
      throw new RangeError(`Index ${offset} is out of range`)
    }
    return this[offset]
  }

  /**
   * Writes an unsigned 8-bit integer to the buffer at the specified offset
   * 
   * @param value - The value to write (will be masked to 8 bits)
   * @param offset - The offset to write at
   * @returns The number of bytes written (always 1)
   * @throws RangeError if offset is out of bounds
   */
  writeUInt8(value: number, offset: number): number {
    if (offset < 0 || offset >= this.length) {
      throw new RangeError(`Index ${offset} is out of range`)
    }
    this[offset] = value & 0xFF
    return 1
  }

  /**
   * Reads an unsigned 16-bit big-endian integer from the buffer
   * Big-endian means the most significant byte is stored first
   * 
   * @param offset - The offset to read from
   * @returns The 16-bit unsigned integer value (0-65535)
   * @throws RangeError if offset is out of bounds
   */
  readUInt16BE(offset: number): number {
    if (offset < 0 || offset + 1 >= this.length) {
      throw new RangeError(`Index ${offset} is out of range`)
    }
    return (this[offset] << 8) | this[offset + 1]
  }

  /**
   * Writes an unsigned 16-bit big-endian integer to the buffer
   * Big-endian means the most significant byte is written first
   * 
   * @param value - The value to write (will be masked to 16 bits)
   * @param offset - The offset to write at
   * @returns The number of bytes written (always 2)
   * @throws RangeError if offset is out of bounds
   */
  writeUInt16BE(value: number, offset: number): number {
    if (offset < 0 || offset + 1 >= this.length) {
      throw new RangeError(`Index ${offset} is out of range`)
    }
    this[offset] = (value >>> 8) & 0xFF
    this[offset + 1] = value & 0xFF
    return 2
  }

  /**
   * Reads an unsigned 32-bit big-endian integer from the buffer
   * Big-endian means the most significant byte is stored first
   * 
   * @param offset - The offset to read from
   * @returns The 32-bit unsigned integer value (0-4294967295)
   * @throws RangeError if offset is out of bounds
   */
  readUInt32BE(offset: number): number {
    // OPTIMIZATION: Use native Buffer method if available (much faster)
    if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(this)) {
      return (this as any as Buffer).readUInt32BE(offset)
    }
    // Bounds check: need 4 bytes starting at offset
    if (offset < 0 || offset + 4 > this.length) {
      throw new RangeError(`Index ${offset} is out of range`)
    }
    return (
      (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3]
    )
  }

  /**
   * Writes an unsigned 32-bit big-endian integer to the buffer
   * Big-endian means the most significant byte is written first
   * 
   * @param value - The value to write (will be masked to 32 bits)
   * @param offset - The offset to write at
   * @returns The number of bytes written (always 4)
   * @throws RangeError if offset is out of bounds
   */
  writeUInt32BE(value: number, offset: number): number {
    // OPTIMIZATION: Use native Buffer method if available (much faster)
    if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(this)) {
      return (this as any as Buffer).writeUInt32BE(value, offset)
    }
    // Bounds check: need 4 bytes starting at offset
    if (offset < 0 || offset + 4 > this.length) {
      throw new RangeError(`Index ${offset} is out of range`)
    }
    this[offset] = (value >>> 24) & 0xFF
    this[offset + 1] = (value >>> 16) & 0xFF
    this[offset + 2] = (value >>> 8) & 0xFF
    this[offset + 3] = value & 0xFF
    return 4
  }

  /**
   * Creates a new UniversalBuffer that references a portion of this buffer
   * 
   * OPTIMIZATION: For large buffers, we copy the data instead of creating a view
   * to prevent memory leaks where slices keep references to the entire underlying ArrayBuffer.
   * This is especially important for packfile processing where we slice large buffers.
   * 
   * @param start - Start offset (default: 0)
   * @param end - End offset (default: buffer.length)
   * @returns A new UniversalBuffer with copied data (not a view)
   */
  override slice(start?: number, end?: number): UniversalBuffer {
    const sliced = super.slice(start, end)
    // CRITICAL: Copy the data instead of creating a view that references the entire ArrayBuffer
    // This prevents memory leaks when slicing large buffers (e.g., packfiles)
    // The original implementation kept references to the entire underlying buffer,
    // preventing garbage collection of large packfiles
    return new UniversalBuffer(sliced)
  }

  /**
   * Creates a new UniversalBuffer that references a portion of this buffer
   * This is an alias for slice() that maintains compatibility with Uint8Array API
   * 
   * @param start - Start offset (default: 0)
   * @param end - End offset (default: buffer.length)
   * @returns A new UniversalBuffer referencing the specified range
   */
  subarray(start?: number, end?: number): UniversalBuffer {
    return this.slice(start, end)
  }
}

// Export type alias for compatibility
export type UniversalBufferLike = UniversalBuffer | Uint8Array | Buffer

