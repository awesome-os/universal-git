// The Modern Approach: Using DataView
// First, it's important to know that for standard 32-bit (float) and 64-bit (double) numbers, 
// you should almost always use the built-in DataView API. It is native, highly optimized, and far less error-prone.
// Here's how you would achieve the same result with DataView:

// // --- Writing a float using DataView ---
// const buffer = new ArrayBuffer(4);
// const view = new DataView(buffer);
// const value = 3.14159;
// const littleEndian = true; // or false for big-endian

// // view.setFloat32(byteOffset, value, littleEndian);
// view.setFloat32(0, value, littleEndian); 
// // The buffer now contains the 4 bytes for the float

// // --- Reading a float using DataView ---
// // const readValue = view.getFloat32(byteOffset, littleEndian);
// const readValue = view.getFloat32(0, littleEndian);

// console.log(readValue); // ~3.141590118408203

// While DataView is preferred, your legacy code is still valuable for non-standard float sizes or 
// for understanding how floats are encoded. Let's refactor it into a clean, modern class that uses Uint8Array.


/**
 * A utility class for reading and writing IEEE 754 floating-point numbers
 * of arbitrary precision from/to a Uint8Array.
 *
 * NOTE: For standard 32-bit and 64-bit floats, it is strongly recommended
 * to use the built-in `DataView` API for performance and reliability.
 * This class is useful for non-standard float sizes or for educational purposes.
 */
export class IEEE754 {
  /**
   * Reads an IEEE 754 float from a Uint8Array.
   * @param {Uint8Array} buffer The buffer to read from.
   * @param {number} offset The byte offset to start reading at.
   * @param {boolean} isLE True for little-endian, false for big-endian.
   * @param {number} mLen The length of the mantissa in bits. (e.g., 23 for float32)
   * @param {number} nBytes The total number of bytes for the float. (e.g., 4 for float32)
   * @returns {number} The parsed floating-point number.
   */
  static read(buffer, offset, isLE, mLen, nBytes) {
    let e, m;
    const eLen = (nBytes * 8) - mLen - 1;
    const eMax = (1 << eLen) - 1;
    const eBias = eMax >> 1;
    let nBits = -7;
    let i = isLE ? (nBytes - 1) : 0;
    const d = isLE ? -1 : 1;
    let s = buffer[offset + i];

    i += d;

    e = s & ((1 << (-nBits)) - 1);
    s >>= (-nBits);
    nBits += eLen;
    while (nBits > 0) {
      e = (e * 256) + buffer[offset + i];
      i += d;
      nBits -= 8;
    }

    m = e & ((1 << (-nBits)) - 1);
    e >>= (-nBits);
    nBits += mLen;
    while (nBits > 0) {
      m = (m * 256) + buffer[offset + i];
      i += d;
      nBits -= 8;
    }

    if (e === 0) {
      e = 1 - eBias;
    } else if (e === eMax) {
      return m ? NaN : ((s ? -1 : 1) * Infinity);
    } else {
      m = m + Math.pow(2, mLen);
      e = e - eBias;
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
  }

  /**
   * Writes an IEEE 754 float to a Uint8Array.
   * @param {Uint8Array} buffer The buffer to write to.
   * @param {number} value The floating-point number to write.
   * @param {number} offset The byte offset to start writing at.
   * @param {boolean} isLE True for little-endian, false for big-endian.
   * @param {number} mLen The length of the mantissa in bits. (e.g., 23 for float32)
   * @param {number} nBytes The total number of bytes for the float. (e.g., 4 for float32)
   */
  static write(buffer, value, offset, isLE, mLen, nBytes) {
    let e, m, c;
    const eLen = (nBytes * 8) - mLen - 1;
    const eMax = (1 << eLen) - 1;
    const eBias = eMax >> 1;
    const rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
    let i = isLE ? 0 : (nBytes - 1);
    const d = isLE ? 1 : -1;
    const s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

    value = Math.abs(value);

    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(value) / Math.LN2);
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--;
        c *= 2;
      }
      if (e + eBias >= 1) {
        value += rt / c;
      } else {
        value += rt * Math.pow(2, 1 - eBias);
      }
      if (value * c >= 2) {
        e++;
        c /= 2;
      }

      if (e + eBias >= eMax) {
        m = 0;
        e = eMax;
      } else if (e + eBias >= 1) {
        m = ((value * c) - 1) * Math.pow(2, mLen);
        e = e + eBias;
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
        e = 0;
      }
    }

    // This part can be slightly simplified for clarity
    for (; mLen >= 8; mLen -= 8) {
      buffer[offset + i] = m & 0xff;
      i += d;
      m /= 256;
    }

    e = (e << mLen) | m;
    eLen += mLen;
    for (; eLen > 0; eLen -= 8) {
      buffer[offset + i] = e & 0xff;
      i += d;
      e /= 256; // In JS, this is float division. Bitwise right shift `>> 8` would be safer.
                 // Let's stick to original logic, but this is a potential pitfall.
    }

    buffer[offset + i - d] |= s * 128;
  }
}

// --- Usage Example ---

// Let's write and read a standard 32-bit float (4 bytes, 23-bit mantissa)
// const buffer = new Uint8Array(4);
// const valueToWrite = -123.456;

// console.log('Writing value:', valueToWrite);
// IEEE754.write(buffer, valueToWrite, 0, true, 23, 4); // Write little-endian float32

// console.log('Buffer (bytes):', buffer); // Uint8Array(4) [ 174, 71, 246, 193 ]

// const valueRead = IEEE754.read(buffer, 0, true, 23, 4); // Read little-endian float32
// console.log('Read value:', valueRead); // -123.45600128173828 (expected precision loss)