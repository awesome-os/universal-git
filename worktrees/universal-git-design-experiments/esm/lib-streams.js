// =============================================================================
// Final, Most Concise DEFLATE/Inflate Module for Isomorphic-Git
//
// This version leverages the robust Blob constructor to handle various
// input types directly, making input normalization highly compact.
// =============================================================================

// --- Streaming API Classes --- needed for polyfills if it is not supported.

export class DeflateStream extends CompressionStream {
    constructor() { super('deflate'); }
}

export class InflateStream extends DecompressionStream {
    constructor() { super('deflate'); }
}

/**
 * A type representing various data sources that can be directly used as
 * Response body or Blob BodyInit input or piped through streams.
 * Note: For actual s, the body stream is extracted.
 */
/** @typedef {Uint8Array | Blob | ReadableStream<Uint8Array> | Response | BodyInit} Streamable */;

// --- Helper to get a stream for piping ---
function getReadableStream(/** @type {Streamable} */ data) {
    if (!data) {
        throw new Error(typeof data, "is not supported or is empty" );
    }
    return new Blob([data.body ? data.body : data]).stream();
}

// --- Core Asynchronous Functions ---

/**
 * Asynchronously compresses data with DEFLATE.
 * Accepts various input types*
 * @param data The data to compress (e.g., a Uint8Array, a Blob, a ReadableStream, or a Response).
 * @returns A Promise that resolves with a  containing the compressed data stream.
 */
export const deflate = (/** @type {Streamable} */ data) => getReadableStream(data).pipeThrough(
    new DeflateStream()
);


/**
 * Asynchronously expands DEFLATE data.
 * Accepts various input types.
 *
 * @param data The compressed data to expand (e.g., a Uint8Array, a Blob, a ReadableStream, or a Response).
 * @returns A Promise that resolves with a  containing the decompressed data stream.
 */
export const inflate = async (/** @type {Streamable} */ data) => getReadableStream(data).pipeThrough(
    new InflateStream()
);

// Polyfill for ReadableStream to be async iterable sideEffect
// Rule of thumb serverSide always exists Browser side it will exist. 
export const ensureAsyncIterableReadableStreams = () => {
    // Yes this is redundant but leads to best results in all needed variations.
    if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
        ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
            const reader = this.getReader();
            try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
            }
            } finally {
            reader.releaseLock();
            }
        };
        return false;
    }
    return true;
    // Now you can use for await...of
    
};

// sideEffect if ReadableStream Async Iterable was not supported this is false else its true nothing happend.
export const supportedAsyncIterableStream = ensureAsyncIterableReadableStreams();

// When this fails use: ensureAsyncIterableReadableStreams() before that!
export const consumeStream = async (/** @type ReadableStream<Uint8Array> */ stream) => {
    for await (const chunk of stream) { console.log(chunk); }
};

/**
 * A TransformStream that consumes a stream of Uint8Arrays and emits a
 * JavaScript `number` for every 4 bytes it reads. The 4 bytes are
 * interpreted as a 32-bit unsigned integer in big-endian format.
 *
 * @extends {TransformStream<Uint8Array, number>}
 */
class ReadBytes32BEStream extends TransformStream {
  constructor() {
    // Internal buffer to hold bytes that don't yet form a complete 4-byte number.
    let buffer = new Uint8Array(0);

    super({
      /**
       * Processes each incoming chunk of bytes.
       * @param {Uint8Array} chunk A chunk of bytes from the source.
       * @param {TransformStreamDefaultController<number>} controller The stream controller.
       */
      transform(chunk, controller) {
        // 1. Combine the existing buffer with the new chunk.
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;

        // 2. Process as many 4-byte numbers as possible from the buffer.
        let offset = 0;
        // Use a DataView for safe and easy multi-byte number reading.
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
        
        while (offset + 4 <= buffer.length) {
          // Read a 32-bit unsigned integer in Big Endian format (false for the second arg).
          const value = view.getUint32(offset, false);
          controller.enqueue(value);
          offset += 4;
        }

        // 3. Slice off the processed bytes, keeping any leftovers for the next chunk.
        if (offset > 0) {
          buffer = buffer.slice(offset);
        }
      },

      /**
       * Called when the source stream is finished. It checks for incomplete data.
       */
      flush(controller) {
        // If the stream ends and there are leftover bytes in the buffer, it means
        // the total number of bytes was not a multiple of 4. This is an error.
        if (buffer.length > 0) {
          controller.error(new Error(
            `Incomplete data: The stream ended with ${buffer.length} leftover bytes.`
          ));
        }
      }
    });
  }
}

/**
 * A robust, web-standard function to encode a string to Base64.
 * Correctly handles all Unicode characters. Does NOT require Buffer.
 *
 * @param {string} str The string to encode.
 * @returns {string} The Base64 encoded string.
 */
export function encodeToBase64Web(str) {
  // Step 1: Convert the modern UTF-8 string to a Uint8Array of bytes.
  const utf8Bytes = new TextEncoder().encode(str);

  // Step 2: Convert the bytes to a "binary string" where each character's
  // code point corresponds to the byte's value. This is what btoa expects.
  // NOTE: Using the spread operator is concise but can cause a stack
  // overflow on very large strings (e.g., > 100KB). See below for a robust alternative.
  const binaryString = String.fromCharCode(...utf8Bytes);

  // Step 3: Use the built-in btoa function on the safe binary string.
  return btoa(binaryString);
}

/**
 * A robust, web-standard function to decode a Base64 string.
 * Correctly handles all Unicode characters. Does NOT require Buffer.
 *
 * @param {string} base64Str The Base64 string to decode.
 * @returns {string} The decoded string.
 */
export function decodeFromBase64Web(base64Str) {
  // Step 1: Use the built-in atob function to get the "binary string".
  const binaryString = atob(base64Str);

  // Step 2: Convert the binary string back into a Uint8Array of bytes.
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Step 3: Use a TextDecoder to convert the UTF-8 bytes back to a modern string.
  return new TextDecoder().decode(bytes);
}

// // --- Example Usage ---
// const unicodeString = 'Hello, 世界! 👋';

// const encoded = encodeToBase64Web(unicodeString);
// console.log('Encoded:', encoded); // "SGVsbG8sIOS4lueVjCEg8J+Riw=="

// const decoded = decodeFromBase64Web(encoded);
// console.log('Decoded:', decoded); // "Hello, 世界! 👋"

// For larger amount of data.
export function encodeToBase64Web_Robust(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  const CHUNK_SIZE = 8192; // Process in 8KB chunks
  let binaryString = '';
  for (let i = 0; i < utf8Bytes.length; i += CHUNK_SIZE) {
    // Note: Using .apply is a classic way to handle this
    binaryString += String.fromCharCode.apply(null, utf8Bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binaryString);
}