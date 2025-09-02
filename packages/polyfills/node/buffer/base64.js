/**
 * A fast, platform-agnostic Base64 encoder and decoder that works with Uint8Arrays.
 */
export class Base64 {
  static #lookup = [];
  static #revLookup = [];

  // Static initialization block to set up the lookup tables once.
  static {
    const code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let i = 0, len = code.length; i < len; ++i) {
      this.#lookup[i] = code[i];
      this.#revLookup[code.charCodeAt(i)] = i;
    }

    // Support decoding URL-safe base64 strings, as Node.js does.
    this.#revLookup['-'.charCodeAt(0)] = 62;
    this.#revLookup['_'.charCodeAt(0)] = 63;
  }

  /**
   * Calculates the byte length of a Base64 string when decoded.
   * @param {string} b64 The Base64 string.
   * @returns {number} The length of the decoded data in bytes.
   */
  static decodedLength(b64) {
    const [validLen, placeHoldersLen] = this.#getLens(b64);
    return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen;
  }
  
  /**
   * Encodes a Uint8Array into a Base64 string.
   * @param {Uint8Array} uint8 The byte array to encode.
   * @returns {string} The Base64-encoded string.
   */
  static encode(uint8) {
    const len = uint8.length;
    const extraBytes = len % 3;
    const parts = [];
    const maxChunkLength = 16383; // Must be a multiple of 3

    // Process in chunks to avoid creating a huge array of single characters.
    for (let i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
      const end = Math.min(i + maxChunkLength, len2);
      parts.push(this.#encodeChunk(uint8, i, end));
    }

    // Handle trailing bytes
    if (extraBytes === 1) {
      const tmp = uint8[len - 1];
      parts.push(
        this.#lookup[tmp >> 2] +
        this.#lookup[(tmp << 4) & 0x3F] +
        '=='
      );
    } else if (extraBytes === 2) {
      const tmp = (uint8[len - 2] << 8) + uint8[len - 1];
      parts.push(
        this.#lookup[tmp >> 10] +
        this.#lookup[(tmp >> 4) & 0x3F] +
        this.#lookup[(tmp << 2) & 0x3F] +
        '='
      );
    }

    return parts.join('');
  }
  
  /**
   * Decodes a Base64 string into a Uint8Array.
   * @param {string} b64 The Base64 string to decode.
   * @returns {Uint8Array} The decoded byte array.
   */
  static decode(b64) {
    const [validLen, placeHoldersLen] = this.#getLens(b64);
    const output = new Uint8Array(((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen);
    
    let curByte = 0;
    // Process all but the last 4 characters (which may have padding)
    const len = placeHoldersLen > 0 ? validLen - 4 : validLen;

    let i = 0;
    for (; i < len; i += 4) {
      const tmp =
        (this.#revLookup[b64.charCodeAt(i)] << 18) |
        (this.#revLookup[b64.charCodeAt(i + 1)] << 12) |
        (this.#revLookup[b64.charCodeAt(i + 2)] << 6) |
        this.#revLookup[b64.charCodeAt(i + 3)];
      output[curByte++] = (tmp >> 16) & 0xFF;
      output[curByte++] = (tmp >> 8) & 0xFF;
      output[curByte++] = tmp & 0xFF;
    }

    if (placeHoldersLen === 2) {
      const tmp =
        (this.#revLookup[b64.charCodeAt(i)] << 2) |
        (this.#revLookup[b64.charCodeAt(i + 1)] >> 4);
      output[curByte++] = tmp & 0xFF;
    }

    if (placeHoldersLen === 1) {
      const tmp =
        (this.#revLookup[b64.charCodeAt(i)] << 10) |
        (this.#revLookup[b64.charCodeAt(i + 1)] << 4) |
        (this.#revLookup[b64.charCodeAt(i + 2)] >> 2);
      output[curByte++] = (tmp >> 8) & 0xFF;
      output[curByte++] = tmp & 0xFF;
    }

    return output;
  }

  // --- Private Helper Methods ---

  static #getLens(b64) {
    const len = b64.length;
    if (len % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4');
    }
    // Find the first padding character to determine the valid length.
    let validLen = b64.indexOf('=');
    if (validLen === -1) validLen = len;

    const placeHoldersLen = validLen === len ? 0 : 4 - (validLen % 4);
    return [validLen, placeHoldersLen];
  }
  
  static #tripletToBase64(num) {
    return this.#lookup[num >> 18 & 0x3F] +
           this.#lookup[num >> 12 & 0x3F] +
           this.#lookup[num >> 6 & 0x3F] +
           this.#lookup[num & 0x3F];
  }

  static #encodeChunk(uint8, start, end) {
    const output = [];
    for (let i = start; i < end; i += 3) {
      const tmp =
        ((uint8[i] << 16) & 0xFF0000) +
        ((uint8[i + 1] << 8) & 0xFF00) +
        (uint8[i + 2] & 0xFF);
      output.push(this.#tripletToBase64(tmp));
    }
    return output.join('');
  }
}

// // --- Usage Example ---
// const originalBytes = new TextEncoder().encode('Hello, world! 👋');
// console.log('Original Bytes:', originalBytes);

// const encodedString = Base64.encode(originalBytes);
// console.log('Encoded String:', encodedString); // "SGVsbG8sIHdvcmxkIS 👋" -> SGVsbG8sIHdvcmxkISDwn6Ki

// const decodedBytes = Base64.decode(encodedString);
// console.log('Decoded Bytes:', decodedBytes);

// const decodedText = new TextDecoder().decode(decodedBytes);
// console.log('Decoded Text:', decodedText); // "Hello, world! 👋"