import { Base64 } from './base64.js' // Assumes our refactored Base64 class is here
import { IEEE754 } from './ieee754.js' // Assumes our refactored IEEE754 class is here

const K_MAX_LENGTH = 0x7fffffff;
export const kMaxLength = K_MAX_LENGTH;

export const INSPECT_MAX_BYTES = 50;

/**
 * The Buffer class provides a way of handling streams of binary data.
 * It is a subclass of Uint8Array with additional methods for Node.js API compatibility.
 * This version uses custom low-level logic for number operations instead of DataView.
 */
export class Buffer extends Uint8Array {
  // --- STATIC METHODS (alloc, from, concat, etc.) ---
  // (These are identical to the previous modern version, so they are included here without comments for brevity)

  static alloc(size, fill, encoding) {
    this.#assertSize(size);
    const buf = new Buffer(size);
    if (size === 0) return buf;
    if (fill !== undefined) {
      return buf.fill(fill, 0, buf.length, encoding);
    }
    return buf;
  }

  static allocUnsafe(size) {
    this.#assertSize(size);
    return new Buffer(size);
  }

  static from(value, encodingOrOffset, length) {
    if (typeof value === 'string') {
      return this.#fromString(value, encodingOrOffset);
    }
    if (value instanceof ArrayBuffer) {
      return this.#fromArrayBuffer(value, encodingOrOffset, length);
    }
    if (ArrayBuffer.isView(value)) {
        return this.#fromArrayView(value);
    }
    if (value == null) {
      throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or Array-like Object.');
    }
    if (Array.isArray(value) || (value.length !== undefined && typeof value !== 'function')) {
        return this.#fromArrayLike(value);
    }
    throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or Array-like Object.');
  }

  static concat(list, totalLength) {
    if (!Array.isArray(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers');
    }
    if (list.length === 0) return Buffer.alloc(0);
    if (totalLength === undefined) {
      totalLength = list.reduce((sum, buf) => sum + buf.length, 0);
    }
    const buffer = Buffer.alloc(totalLength);
    let pos = 0;
    for (const buf of list) {
      if (!(buf instanceof Uint8Array)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      buf.copy(buffer, pos);
      pos += buf.length;
    }
    return buffer;
  }

  static compare(a, b) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
      throw new TypeError('The "buf1", "buf2" arguments must be Uint8Array or Buffer');
    }
    if (a === b) return 0;
    return a.compare(b);
  }

  static isBuffer(obj) {
    return obj instanceof Buffer;
  }

  static isEncoding(encoding) {
    // ... same as before
    return /^(hex|utf8|utf-8|ascii|latin1|binary|base64|ucs2|ucs-2|utf16le|utf-16le)$/i.test(String(encoding));
  }
  
  static byteLength(string, encoding = 'utf8') {
    // ... same as before
    if (typeof string !== 'string') throw new TypeError('The "string" argument must be of type string.');
    const loweredCase = String(encoding).toLowerCase();
    if (loweredCase === 'utf8' || loweredCase === 'utf-8') return new TextEncoder().encode(string).length;
    if (loweredCase === 'ucs2' || loweredCase === 'ucs-2' || loweredCase === 'utf16le' || loweredCase === 'utf-16le') return string.length * 2;
    if (loweredCase === 'hex') return string.length >>> 1;
    if (loweredCase === 'base64') return Base64.decodedLength(string);
    return string.length; // for ascii, latin1, binary
  }
  
  // ... Private static helpers #assertSize, #fromString etc. are the same ...
  static #assertSize = (size) => { if (typeof size !== 'number') throw new TypeError('"size" argument must be a number'); else if (size < 0 || size > K_MAX_LENGTH) throw new RangeError(`The value "${size}" is invalid for option "size"`); };
  static #fromString = (string, encoding) => Buffer.from(new TextEncoder().encode(string)); // Simplified for example, full version would handle other encodings.
  static #fromArrayBuffer = (array, byteOffset, length) => new Buffer(array, byteOffset, length);
  static #fromArrayView = (view) => new Buffer(view.buffer, view.byteOffset, view.byteLength);
  static #fromArrayLike = (array) => new Buffer(Uint8Array.from(array));


  // --- INSTANCE METHODS (Core functionality) ---
  // (toString, slice, copy, etc. are identical to the previous modern version)
  // ...

  // --- REIMPLEMENTED NUMBER READ/WRITE METHODS ---

  #checkBounds(offset, ext) {
    if (offset + ext > this.length || offset < 0) {
      throw new RangeError('Index out of range');
    }
  }

  readFloatLE(offset = 0) { this.#checkBounds(offset, 4); return IEEE754.read(this, offset, true, 23, 4); }
  readFloatBE(offset = 0) { this.#checkBounds(offset, 4); return IEEE754.read(this, offset, false, 23, 4); }
  readDoubleLE(offset = 0) { this.#checkBounds(offset, 8); return IEEE754.read(this, offset, true, 52, 8); }
  readDoubleBE(offset = 0) { this.#checkBounds(offset, 8); return IEEE754.read(this, offset, false, 52, 8); }

  readUInt8(offset = 0) { this.#checkBounds(offset, 1); return this[offset]; }
  readInt8(offset = 0) { this.#checkBounds(offset, 1); const val = this[offset]; return val & 0x80 ? val | 0xffffff00 : val; }

  readUInt16LE(offset = 0) { this.#checkBounds(offset, 2); return this[offset] | (this[offset + 1] << 8); }
  readUInt16BE(offset = 0) { this.#checkBounds(offset, 2); return (this[offset] << 8) | this[offset + 1]; }
  
  readInt16LE(offset = 0) { this.#checkBounds(offset, 2); const val = this[offset] | (this[offset + 1] << 8); return (val & 0x8000) ? val | 0xFFFF0000 : val; }
  readInt16BE(offset = 0) { this.#checkBounds(offset, 2); const val = (this[offset] << 8) | this[offset + 1]; return (val & 0x8000) ? val | 0xFFFF0000 : val; }

  readUInt32LE(offset = 0) { this.#checkBounds(offset, 4); return ((this[offset]) | (this[offset + 1] << 8) | (this[offset + 2] << 16)) + (this[offset + 3] * 0x1000000); }
  readUInt32BE(offset = 0) { this.#checkBounds(offset, 4); return (this[offset] * 0x1000000) + ((this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3]); }

  readInt32LE(offset = 0) { this.#checkBounds(offset, 4); return (this[offset]) | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24); }
  readInt32BE(offset = 0) { this.#checkBounds(offset, 4); return (this[offset] << 24) | (this[offset + 1] << 16) | (this[offset + 2] << 8) | (this[offset + 3]); }
  
  // BigInt methods require BigInt support in the environment
  readBigUInt64LE(offset = 0) { this.#checkBounds(offset, 8); const lo = this.readUInt32LE(offset); const hi = this.readUInt32LE(offset + 4); return BigInt(lo) + (BigInt(hi) << 32n); }
  readBigUInt64BE(offset = 0) { this.#checkBounds(offset, 8); const hi = this.readUInt32BE(offset); const lo = this.readUInt32BE(offset + 4); return (BigInt(hi) << 32n) + BigInt(lo); }
  readBigInt64LE(offset = 0) { this.#checkBounds(offset, 8); const lo = this.readUInt32LE(offset); const hi = this.readInt32LE(offset + 4); return BigInt(lo) + (BigInt(hi) << 32n); }
  readBigInt64BE(offset = 0) { this.#checkBounds(offset, 8); const hi = this.readInt32BE(offset); const lo = this.readUInt32BE(offset + 4); return (BigInt(hi) << 32n) + BigInt(lo); }

  writeFloatLE(value, offset = 0) { this.#checkBounds(offset, 4); IEEE754.write(this, value, offset, true, 23, 4); return offset + 4; }
  writeFloatBE(value, offset = 0) { this.#checkBounds(offset, 4); IEEE754.write(this, value, offset, false, 23, 4); return offset + 4; }
  writeDoubleLE(value, offset = 0) { this.#checkBounds(offset, 8); IEEE754.write(this, value, offset, true, 52, 8); return offset + 8; }
  writeDoubleBE(value, offset = 0) { this.#checkBounds(offset, 8); IEEE754.write(this, value, offset, false, 52, 8); return offset + 8; }

  writeUInt8(value, offset = 0) { this.#checkBounds(offset, 1); this[offset] = value & 0xff; return offset + 1; }
  writeInt8(value, offset = 0) { this.#checkBounds(offset, 1); this[offset] = value & 0xff; return offset + 1; }

  writeUInt16LE(value, offset = 0) { this.#checkBounds(offset, 2); this[offset] = value & 0xff; this[offset + 1] = value >>> 8; return offset + 2; }
  writeUInt16BE(value, offset = 0) { this.#checkBounds(offset, 2); this[offset] = value >>> 8; this[offset + 1] = value & 0xff; return offset + 2; }
  
  writeInt16LE(value, offset = 0) { this.writeUInt16LE(value, offset); return offset + 2; }
  writeInt16BE(value, offset = 0) { this.writeUInt16BE(value, offset); return offset + 2; }

  writeUInt32LE(value, offset = 0) { this.#checkBounds(offset, 4); this[offset + 3] = value >>> 24; this[offset + 2] = value >>> 16; this[offset + 1] = value >>> 8; this[offset] = value & 0xff; return offset + 4; }
  writeUInt32BE(value, offset = 0) { this.#checkBounds(offset, 4); this[offset] = value >>> 24; this[offset + 1] = value >>> 16; this[offset + 2] = value >>> 8; this[offset + 3] = value & 0xff; return offset + 4; }
  
  writeInt32LE(value, offset = 0) { this.writeUInt32LE(value, offset); return offset + 4; }
  writeInt32BE(value, offset = 0) { this.writeUInt32BE(value, offset); return offset + 4; }

  writeBigUInt64LE(value, offset = 0) { this.#checkBounds(offset, 8); this.writeUInt32LE(Number(value & 0xffffffffn), offset); this.writeUInt32LE(Number((value >> 32n) & 0xffffffffn), offset + 4); return offset + 8; }
  writeBigUInt64BE(value, offset = 0) { this.#checkBounds(offset, 8); this.writeUInt32BE(Number((value >> 32n) & 0xffffffffn), offset); this.writeUInt32BE(Number(value & 0xffffffffn), offset + 4); return offset + 8; }
  writeBigInt64LE(value, offset = 0) { this.writeBigUInt64LE(value, offset); return offset + 8; }
  writeBigInt64BE(value, offset = 0) { this.writeBigUInt64BE(value, offset); return offset + 8; }
}

// Deprecated alias for compatibility.
export const SlowBuffer = Buffer;
// Key Differences in This Version:
// No DataView: The #getDataView helper method is gone.
// Direct IEEE754 Usage: All float and double methods (readFloatLE, writeDoubleBE, etc.) now directly call our IEEE754.read and IEEE754.write static methods.
// Manual Integer Logic: All integer methods (readUInt16LE, writeInt32BE, etc.) are now implemented using the same bit-shifting and arithmetic logic found in the original polyfill. This makes the class entirely self-reliant.
// Simplified BigInt Logic: For clarity, the BigInt methods are implemented by composing the 32-bit integer methods. For example, readBigUInt64LE is implemented by reading two 32-bit unsigned integers and combining them. This is functionally equivalent and much easier to read than the original's byte-by-byte reconstruction.
// Robust Bounds Checking: A simple #checkBounds private method is added and used at the beginning of each read/write method to ensure all memory access is safe, replacing the more complex noAssert logic of the original.
// This version is the ultimate modernization of the original polyfill. It retains the modern class structure, ES module syntax, and reliance on standard APIs like TextEncoder, but crucially, it also preserves the low-level, self-contained logic for numerical operations that made the original so versatile.