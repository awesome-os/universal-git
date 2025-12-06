import { Base64 } from './base64.js' // Assumes our refactored Base64 class is here

const K_MAX_LENGTH = 0x7fffffff;
export const kMaxLength = K_MAX_LENGTH;

export const INSPECT_MAX_BYTES = 50;

/**
 * The Buffer class provides a way of handling streams of binary data.
 * It is a subclass of Uint8Array with additional methods for Node.js API compatibility.
 */
export class Buffer extends Uint8Array {
  /**
   * Allocates a new buffer of `size` octets.
   *
   * @param {number} size The size of the buffer.
   * @param {string|number|Buffer} [fill] A value to pre-fill the buffer with.
   * @param {string} [encoding] If `fill` is a string, this is its encoding.
   */
  static alloc(size, fill, encoding) {
    this.#assertSize(size);
    const buf = new Buffer(size);
    if (size === 0) {
      return buf;
    }
    if (fill !== undefined) {
      return buf.fill(fill, 0, buf.length, encoding);
    }
    // In modern environments, new Uint8Array(size) is zero-filled by default.
    return buf;
  }

  /**
   * Allocates a new buffer of `size` octets, leaving memory uninitialized.
   * NOTE: In a browser environment, this is functionally identical to `alloc` as
   * ArrayBuffers are zero-filled for security reasons.
   *
   * @param {number} size The size of the buffer.
   */
  static allocUnsafe(size) {
    this.#assertSize(size);
    return new Buffer(size);
  }

  /**
   * Creates a new Buffer from an array, string, or other buffer.
   *
   * @param {string|ArrayBuffer|Buffer|Uint8Array|number[]} value The value to convert to a Buffer.
   * @param {string|number} [encodingOrOffset] The encoding if value is a string, or the offset if value is an ArrayBuffer.
   * @param {number} [length] The length if value is an ArrayBuffer.
   */
  static from(value, encodingOrOffset, length) {
    if (typeof value === 'string') {
      return this.#fromString(value, encodingOrOffset);
    }

    if (value instanceof ArrayBuffer) {
      return this.#fromArrayBuffer(value, encodingOrOffset, length);
    }
    
    // This covers Uint8Array, other TypedArrays, and our own Buffer class
    if (ArrayBuffer.isView(value)) {
        return this.#fromArrayView(value);
    }

    if (value == null) {
      throw new TypeError(
        'The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object.'
      );
    }

    // Handle Array-like objects
    if (Array.isArray(value) || (value.length !== undefined && typeof value !== 'function')) {
        return this.#fromArrayLike(value);
    }

    throw new TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object.'
    );
  }

  /**
   * Concatenates a list of Buffer instances.
   *
   * @param {Buffer[]} list List of Buffer instances to concat.
   * @param {number} [totalLength] Total length of the buffers when concatenated.
   */
  static concat(list, totalLength) {
    if (!Array.isArray(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers');
    }

    if (list.length === 0) {
      return Buffer.alloc(0);
    }

    if (totalLength === undefined) {
      totalLength = list.reduce((sum, buf) => sum + buf.length, 0);
    }

    const buffer = Buffer.alloc(totalLength);
    let pos = 0;
    for (const buf of list) {
      if (!(buf instanceof Uint8Array)) { // More robust check than Buffer.isBuffer
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      buf.copy(buffer, pos);
      pos += buf.length;
    }

    return buffer;
  }

  /**
   * Compares two buffers.
   * @returns {number} 0 if equal, 1 if `a` is greater, -1 if `b` is greater.
   */
  static compare(a, b) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
      throw new TypeError('The "buf1", "buf2" arguments must be Uint8Array or Buffer');
    }
    if (a === b) return 0;
    return a.compare(b);
  }

  /**
   * Checks if `obj` is a Buffer.
   */
  static isBuffer(obj) {
    return obj instanceof Buffer;
  }

  /**
   * Checks if `encoding` is a valid encoding string.
   */
  static isEncoding(encoding) {
    switch (String(encoding).toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'latin1':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return true;
      default:
        return false;
    }
  }

  /**
   * Gives the actual byte length of a string.
   */
  static byteLength(string, encoding = 'utf8') {
    if (typeof string !== 'string') {
      throw new TypeError('The "string" argument must be of type string.');
    }

    const loweredCase = String(encoding).toLowerCase();

    switch (loweredCase) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return string.length;
      case 'utf8':
      case 'utf-8':
        return new TextEncoder().encode(string).length;
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return string.length * 2;
      case 'hex':
        return string.length >>> 1;
      case 'base64':
        return Base64.decodedLength(string);
      default:
        return new TextEncoder().encode(string).length;
    }
  }

  // --- PRIVATE STATIC HELPERS ---

  static #assertSize(size) {
    if (typeof size !== 'number') {
      throw new TypeError('"size" argument must be a number');
    } else if (size < 0 || size > K_MAX_LENGTH) {
      throw new RangeError(`The value "${size}" is invalid for option "size"`);
    }
  }
  
  static #fromString(string, encoding = 'utf8') {
    encoding = String(encoding).toLowerCase();
    let bytes;

    switch (encoding) {
        case 'hex':
            // TODO: Use our highPerformance heyToByte byteToHex
            // Simple hex to byte array conversion
            if (string.length % 2 !== 0) throw new TypeError('Invalid hex string');
            bytes = new Uint8Array(string.length / 2);
            for (let i = 0; i < string.length; i += 2) {
                bytes[i / 2] = parseInt(string.substring(i, i + 2), 16);
            }
            break;
        case 'utf8':
        case 'utf-8':
            bytes = new TextEncoder().encode(string);
            break;
        case 'base64':
            bytes = Base64.decode(string);
            break;
        case 'latin1':
        case 'binary':
            bytes = new Uint8Array(string.length);
            for (let i = 0; i < string.length; i++) {
                bytes[i] = string.charCodeAt(i) & 0xFF;
            }
            break;
        // Other encodings can be added here
        default:
            throw new TypeError(`Unknown encoding: ${encoding}`);
    }
    return new Buffer(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  static #fromArrayBuffer(array, byteOffset = 0, length) {
    if (byteOffset < 0 || array.byteLength < byteOffset) {
      throw new RangeError('"offset" is outside of buffer bounds');
    }
    const end = length === undefined ? array.byteLength : byteOffset + length;
    if (array.byteLength < end) {
      throw new RangeError('"length" is outside of buffer bounds');
    }
    return new Buffer(array, byteOffset, length);
  }

  static #fromArrayView(arrayView) {
      // Create a copy to avoid aliasing memory, which is Buffer.from's behavior
      const copy = new Uint8Array(arrayView.buffer, arrayView.byteOffset, arrayView.byteLength);
      return new Buffer(copy.buffer);
  }

  static #fromArrayLike(array) {
      const buf = new Buffer(array.length);
      for (let i = 0; i < buf.length; i++) {
          buf[i] = array[i] & 255;
      }
      return buf;
  }

  // --- INSTANCE METHODS ---

  toString(encoding = 'utf8', start = 0, end = this.length) {
    end = Math.min(this.length, end);
    if (start >= end) return '';
    const sliced = this.subarray(start, end);

    switch (String(encoding).toLowerCase()) {
        case 'hex':
            return Array.from(sliced).map(b => b.toString(16).padStart(2, '0')).join('');
        case 'utf8':
        case 'utf-8':
            return new TextDecoder().decode(sliced);
        case 'base64':
            return Base64.encode(sliced);
        case 'latin1':
        case 'binary':
            return String.fromCharCode(...sliced);
        default:
            throw new TypeError(`Unknown encoding: ${encoding}`);
    }
  }
  
  slice(start = 0, end = this.length) {
    // Buffer.slice creates a new Buffer that shares memory with the original.
    // Uint8Array.subarray does exactly this. We just need to wrap it in our class.
    const sub = this.subarray(start, end);
    return new Buffer(sub.buffer, sub.byteOffset, sub.byteLength);
  }

  copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    if (!(target instanceof Uint8Array)) throw new TypeError('argument should be a Buffer or Uint8Array');
    
    // Clamp ranges to prevent errors
    sourceStart = Math.max(0, sourceStart);
    sourceEnd = Math.min(this.length, sourceEnd);
    targetStart = Math.max(0, targetStart);

    if (sourceEnd <= sourceStart) return 0;

    const sourceSlice = this.subarray(sourceStart, sourceEnd);
    const bytesToCopy = Math.min(sourceSlice.length, target.length - targetStart);

    if (bytesToCopy <= 0) return 0;
    
    target.set(sourceSlice.subarray(0, bytesToCopy), targetStart);
    return bytesToCopy;
  }

  equals(otherBuffer) {
    if (!(otherBuffer instanceof Uint8Array)) {
        throw new TypeError('Argument must be a Buffer or Uint8Array');
    }
    if (this === otherBuffer) return true;
    return this.compare(otherBuffer) === 0;
  }
  
  compare(target, targetStart = 0, targetEnd = target.length, sourceStart = 0, sourceEnd = this.length) {
      if (!(target instanceof Uint8Array)) {
          throw new TypeError('The "target" argument must be a Buffer or Uint8Array');
      }

      const a = this.subarray(sourceStart, sourceEnd);
      const b = target.subarray(targetStart, targetEnd);

      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; ++i) {
          if (a[i] !== b[i]) {
              return a[i] < b[i] ? -1 : 1;
          }
      }
      
      if (a.length < b.length) return -1;
      if (a.length > b.length) return 1;
      return 0;
  }
  
  fill(value, offset = 0, end = this.length, encoding = 'utf8') {
    let fillBytes;
    if (typeof value === 'string') {
        fillBytes = Buffer.from(value, encoding);
        if (fillBytes.length === 0) {
            throw new TypeError('The value is invalid for argument "value"');
        }
    } else if (typeof value === 'number') {
        fillBytes = new Uint8Array([value & 255]);
    } else if (value instanceof Uint8Array) {
        fillBytes = value;
    } else {
        throw new TypeError('The "value" argument must be a string, buffer, or number');
    }

    const sub = this.subarray(offset, end);
    for (let i = 0; i < sub.length; i++) {
        sub[i] = fillBytes[i % fillBytes.length];
    }
    return this;
  }

  inspect() {
    const max = INSPECT_MAX_BYTES;
    const hex = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim();
    const ellipsis = this.length > max ? ' ... ' : '';
    return `<Buffer ${hex}${ellipsis}>`;
  }
  
  toJSON() {
      return {
          type: 'Buffer',
          data: Array.from(this)
      };
  }

  // A DataView provides a much cleaner way to implement these methods.
  #getDataView() {
    // Cache the DataView for performance
    if (!this._dataView || this._dataView.buffer !== this.buffer) {
        this._dataView = new DataView(this.buffer, this.byteOffset, this.byteLength);
    }
    return this._dataView;
  }
  
  readFloatLE(offset = 0) { return this.#getDataView().getFloat32(offset, true); }
  readFloatBE(offset = 0) { return this.#getDataView().getFloat32(offset, false); }
  readDoubleLE(offset = 0) { return this.#getDataView().getFloat64(offset, true); }
  readDoubleBE(offset = 0) { return this.#getDataView().getFloat64(offset, false); }

  readInt8(offset = 0) { return this.#getDataView().getInt8(offset); }
  readUInt8(offset = 0) { return this.#getDataView().getUint8(offset); }
  readInt16LE(offset = 0) { return this.#getDataView().getInt16(offset, true); }
  readInt16BE(offset = 0) { return this.#getDataView().getInt16(offset, false); }
  readUInt16LE(offset = 0) { return this.#getDataView().getUint16(offset, true); }
  readUInt16BE(offset = 0) { return this.#getDataView().getUint16(offset, false); }
  readInt32LE(offset = 0) { return this.#getDataView().getInt32(offset, true); }
  readInt32BE(offset = 0) { return this.#getDataView().getInt32(offset, false); }
  readUInt32LE(offset = 0) { return this.#getDataView().getUint32(offset, true); }
  readUInt32BE(offset = 0) { return this.#getDataView().getUint32(offset, false); }

  writeFloatLE(value, offset = 0) { this.#getDataView().setFloat32(offset, value, true); return offset + 4; }
  writeFloatBE(value, offset = 0) { this.#getDataView().setFloat32(offset, value, false); return offset + 4; }
  writeDoubleLE(value, offset = 0) { this.#getDataView().setFloat64(offset, value, true); return offset + 8; }
  writeDoubleBE(value, offset = 0) { this.#getDataView().setFloat64(offset, value, false); return offset + 8; }
  
  writeInt8(value, offset = 0) { this.#getDataView().setInt8(offset, value); return offset + 1; }
  writeUInt8(value, offset = 0) { this.#getDataView().setUint8(offset, value); return offset + 1; }
  writeInt16LE(value, offset = 0) { this.#getDataView().setInt16(offset, value, true); return offset + 2; }
  writeInt16BE(value, offset = 0) { this.#getDataView().setInt16(offset, value, false); return offset + 2; }
  writeUInt16LE(value, offset = 0) { this.#getDataView().setUint16(offset, value, true); return offset + 2; }
  writeUInt16BE(value, offset = 0) { this.#getDataView().setUint16(offset, value, false); return offset + 2; }
  writeInt32LE(value, offset = 0) { this.#getDataView().setInt32(offset, value, true); return offset + 4; }
  writeInt32BE(value, offset = 0) { this.#getDataView().setInt32(offset, value, false); return offset + 4; }
  writeUInt32LE(value, offset = 0) { this.#getDataView().setUint32(offset, value, true); return offset + 4; }
  writeUInt32BE(value, offset = 0) { this.#getDataView().setUint32(offset, value, false); return offset + 4; }
  
  // BigInt methods
  readBigInt64LE(offset = 0) { return this.#getDataView().getBigInt64(offset, true); }
  readBigInt64BE(offset = 0) { return this.#getDataView().getBigInt64(offset, false); }
  readBigUInt64LE(offset = 0) { return this.#getDataView().getBigUint64(offset, true); }
  readBigUInt64BE(offset = 0) { return this.#getDataView().getBigUint64(offset, false); }
  
  writeBigInt64LE(value, offset = 0) { this.#getDataView().setBigInt64(offset, value, true); return offset + 8; }
  writeBigInt64BE(value, offset = 0) { this.#getDataView().setBigInt64(offset, value, false); return offset + 8; }
  writeBigUInt64LE(value, offset = 0) { this.#getDataView().setBigUint64(offset, value, true); return offset + 8; }
  writeBigUInt64BE(value, offset = 0) { this.#getDataView().setBigUint64(offset, value, false); return offset + 8; }
}

// Deprecated alias for compatibility.
export const SlowBuffer = Buffer;