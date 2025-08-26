// Helper for TextEncoder/Decoder, cache them for performance if many operations.
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export class BufferCursor {
  /**
   * Creates a cursor for reading and writing sequential binary data from/to a Uint8Array.
   *
   * @param {Uint8Array} buffer The Uint8Array to operate on. This buffer will be directly
   *                            modified by write operations.
   */
  constructor(buffer) {
    if (!(buffer instanceof Uint8Array)) {
      throw new TypeError('BufferCursor expects a Uint8Array as input.');
    }
    this.buffer = buffer;
    this._start = 0; // The current read/write head position
    // DataView provides methods for reading/writing multi-byte numbers
    // We create it once, covering the entire buffer.
    this.dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  /**
   * Checks if the cursor has reached or passed the end of the buffer.
   * @returns {boolean} True if at or past EOF, false otherwise.
   */
  eof() {
    return this._start >= this.buffer.length;
  }

  /**
   * Returns the current position of the cursor within the buffer.
   * @returns {number} The current offset.
   */
  tell() {
    return this._start;
  }

  /**
   * Sets the cursor to a new position.
   * @param {number} n The new offset to seek to.
   */
  seek(n) {
    if (n < 0 || n > this.buffer.length) {
      throw new RangeError(`Seek position ${n} is out of bounds [0, ${this.buffer.length}]`);
    }
    this._start = n;
  }

  /**
   * Extracts a slice of the buffer from the current position and advances the cursor.
   * @param {number} n The number of bytes to slice.
   * @returns {Uint8Array} A new Uint8Array containing the sliced data.
   */
  slice(n) {
    if (this._start + n > this.buffer.length) {
      // Return a partial slice if not enough bytes are left
      const remaining = this.buffer.length - this._start;
      const result = this.buffer.slice(this._start, this._start + remaining);
      this._start += remaining;
      return result;
      // Or throw if strict: throw new RangeError(`Not enough bytes to slice ${n} from offset ${this._start}`);
    }
    const result = this.buffer.slice(this._start, this._start + n);
    this._start += n;
    return result;
  }

  /**
   * Reads a string from the buffer using a specified encoding and advances the cursor.
   * Note: Web APIs like TextDecoder primarily use UTF-8 by default.
   * The 'enc' parameter is mostly for compatibility with Buffer's API, but `TextDecoder`
   * handles a more limited set of encodings efficiently.
   *
   * @param {string} enc The encoding to use (e.g., 'utf-8', 'ascii'). TextDecoder default is 'utf-8'.
   * @param {number} length The number of bytes to read for the string.
   * @returns {string} The decoded string.
   */
  toString(enc = 'utf-8', length) {
    if (this._start + length > this.buffer.length) {
      const actualLength = this.buffer.length - this._start;
      const slice = this.buffer.slice(this._start, this._start + actualLength);
      this._start += actualLength;
      // You might throw an error here if `length` must be exact:
      // throw new RangeError(`Not enough bytes to read string of length ${length} from offset ${this._start}`);
      return textDecoder.decode(slice); // TextDecoder might not support all Buffer encodings
    }
    const slice = this.buffer.slice(this._start, this._start + length);
    this._start += length;
    // TextDecoder can take an encoding string.
    // Be aware that browser TextDecoder's 'ascii' maps to 'windows-1252' or 'iso-8859-1'
    // in some contexts, and might not match Node.js 'ascii' behavior exactly for non-ASCII chars.
    try {
      return new TextDecoder(enc).decode(slice);
    } catch (e) {
      console.warn(`TextDecoder does not support encoding "${enc}", falling back to utf-8.`);
      return textDecoder.decode(slice); // Fallback to default UTF-8
    }
  }

  /**
   * Writes a string into the buffer using a specified encoding and advances the cursor.
   * The buffer must be large enough to contain the encoded string.
   * @param {string} value The string to write.
   * @param {number} length The maximum number of bytes to write (truncate if encoded string is longer).
   * @param {string} enc The encoding to use.
   * @returns {number} The number of bytes actually written.
   */
  write(value, length, enc = 'utf-8') {
    // TextEncoder converts string to Uint8Array.
    // Note: TextEncoder only supports UTF-8.
    // If other encodings are strictly needed, a more complex polyfill or library would be required.
    let encodedBytes;
    if (enc !== 'utf-8' && enc !== 'utf8') {
      console.warn(`TextEncoder only supports UTF-8. Ignoring encoding "${enc}" for write operation.`);
    }
    encodedBytes = textEncoder.encode(value);

    let bytesToWrite = encodedBytes.length;
    if (length !== undefined && length < bytesToWrite) {
      bytesToWrite = length; // Truncate if specified length is shorter
    }

    if (this._start + bytesToWrite > this.buffer.length) {
      throw new RangeError(`Not enough space in buffer to write ${bytesToWrite} bytes from offset ${this._start}`);
    }

    this.buffer.set(encodedBytes.slice(0, bytesToWrite), this._start);
    this._start += bytesToWrite;
    return bytesToWrite;
  }

  /**
   * Copies bytes from a source Uint8Array into this buffer at the current cursor position,
   * and advances the cursor by the number of bytes copied.
   *
   * @param {Uint8Array} source The source Uint8Array to copy from.
   * @param {number} sourceStart The starting offset in the source buffer.
   * @param {number} sourceEnd The ending offset (exclusive) in the source buffer.
   * @returns {number} The number of bytes actually copied.
   */
  copy(source, sourceStart = 0, sourceEnd = source.length) {
    const bytesToCopy = Math.min(
      sourceEnd - sourceStart,
      this.buffer.length - this._start,
      source.length - sourceStart
    );

    if (bytesToCopy < 0) return 0; // No bytes to copy

    this.buffer.set(source.slice(sourceStart, sourceStart + bytesToCopy), this._start);
    this._start += bytesToCopy;
    return bytesToCopy;
  }

  /**
   * Reads an 8-bit unsigned integer from the buffer at the current cursor position and advances the cursor.
   * @returns {number} The unsigned 8-bit integer.
   */
  readUInt8() {
    if (this._start + 1 > this.buffer.length) {
      throw new RangeError(`Not enough bytes to read UInt8 from offset ${this._start}`);
    }
    const value = this.dataView.getUint8(this._start);
    this._start += 1;
    return value;
  }

  /**
   * Writes an 8-bit unsigned integer into the buffer at the current cursor position and advances the cursor.
   * @param {number} value The unsigned 8-bit integer to write.
   * @returns {number} The value that was written (for compatibility with Buffer's API).
   */
  writeUInt8(value) {
    if (this._start + 1 > this.buffer.length) {
      throw new RangeError(`Not enough space to write UInt8 at offset ${this._start}`);
    }
    this.dataView.setUint8(this._start, value);
    this._start += 1;
    return value;
  }

  /**
   * Reads a 16-bit unsigned integer in Big-Endian format from the buffer and advances the cursor.
   * @returns {number} The unsigned 16-bit integer.
   */
  readUInt16BE() {
    if (this._start + 2 > this.buffer.length) {
      throw new RangeError(`Not enough bytes to read UInt16BE from offset ${this._start}`);
    }
    const value = this.dataView.getUint16(this._start, false); // false for Big-Endian
    this._start += 2;
    return value;
  }

  /**
   * Writes a 16-bit unsigned integer in Big-Endian format into the buffer and advances the cursor.
   * @param {number} value The unsigned 16-bit integer to write.
   * @returns {number} The value that was written.
   */
  writeUInt16BE(value) {
    if (this._start + 2 > this.buffer.length) {
      throw new RangeError(`Not enough space to write UInt16BE at offset ${this._start}`);
    }
    this.dataView.setUint16(this._start, value, false); // false for Big-Endian
    this._start += 2;
    return value;
  }

  /**
   * Reads a 32-bit unsigned integer in Big-Endian format from the buffer and advances the cursor.
   * @returns {number} The unsigned 32-bit integer.
   */
  readUInt32BE() {
    if (this._start + 4 > this.buffer.length) {
      throw new RangeError(`Not enough bytes to read UInt32BE from offset ${this._start}`);
    }
    const value = this.dataView.getUint32(this._start, false); // false for Big-Endian
    this._start += 4;
    return value;
  }

  /**
   * Writes a 32-bit unsigned integer in Big-Endian format into the buffer and advances the cursor.
   * @param {number} value The unsigned 32-bit integer to write.
   * @returns {number} The value that was written.
   */
  writeUInt32BE(value) {
    if (this._start + 4 > this.buffer.length) {
      throw new RangeError(`Not enough space to write UInt32BE at offset ${this._start}`);
    }
    this.dataView.setUint32(this._start, value, false); // false for Big-Endian
    this._start += 4;
    return value;
  }
}