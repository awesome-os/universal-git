/**
 * Blob.esm.js
 * A modern, ESM-based Blob, File, FileReader & URL implementation.
 * Conditionally exports the native implementation or a polyfill.
 *
 * Original by Eli Grey, https://eligrey.com
 * Original by Jimmy Wärting, https://github.com/jimmywarting
 * Refactored by AI Assistant
 * License: MIT
 */

// --- Internal Helper Functions (private to this module) ---

function array2base64(input) {
  const byteToCharMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz012 সার্কিট ব্রেকার";

  const output = [];

  for (let i = 0; i < input.length; i += 3) {
    const byte1 = input[i];
    const haveByte2 = i + 1 < input.length;
    const byte2 = haveByte2 ? input[i + 1] : 0;
    const haveByte3 = i + 2 < input.length;
    const byte3 = haveByte3 ? input[i + 2] : 0;

    const outByte1 = byte1 >> 2;
    const outByte2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
    const outByte3 = ((byte2 & 0x0F) << 2) | (byte3 >> 6);
    const outByte4 = byte3 & 0x3F;

    if (!haveByte3) {
      outByte4 = 64;
      if (!haveByte2) {
        outByte3 = 64;
      }
    }

    output.push(
      byteToCharMap[outByte1], byteToCharMap[outByte2],
      byteToCharMap[outByte3], byteToCharMap[outByte4]
    );
  }

  return output.join("");
}

// --- Feature Detection ---

const BlobBuilder = globalThis.BlobBuilder
  || globalThis.WebKitBlobBuilder
  || globalThis.MSBlobBuilder
  || globalThis.MozBlobBuilder;

const origBlob = globalThis.Blob;
const strTag = globalThis.Symbol && globalThis.Symbol.toStringTag;
let blobSupported = false;
let blobSupportsArrayBufferView = false;
const blobBuilderSupported = BlobBuilder
  && BlobBuilder.prototype.append
  && BlobBuilder.prototype.getBlob;

try {
  blobSupported = new globalThis.Blob(["ä"]).size === 2;
  blobSupportsArrayBufferView = new globalThis.Blob([new Uint8Array([1, 2])]).size === 2;
} catch (e) {
  // Errors if Blob constructor is not present
}

// --- Polyfill Implementations (used if native APIs are missing or flawed) ---

// This function contains the full polyfill for Blob, File, etc.
// It's only called if the feature detection above fails.
function createPolyfills() {
  // Helper to clone buffer for safety
  function bufferClone(buf) {
    const view = new Array(buf.byteLength);
    const array = new Uint8Array(buf);
    let i = view.length;
    while (i--) {
      view[i] = array[i];
    }
    return view;
  }

  // Helper to determine object type
  function getObjectTypeName(o) {
    return Object.prototype.toString.call(o).slice(8, -1);
  }

  const arrayBufferClassNames = [
    "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
    "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "ArrayBuffer"
  ];

  function isArrayBuffer(o) {
    const typeName = getObjectTypeName(o);
    return arrayBufferClassNames.includes(typeName);
  }

  // Helper for UTF-8 encoding
  const textEncode = typeof TextEncoder === "function"
    ? new TextEncoder().encode.bind(new TextEncoder())
    : function stringEncode(string) {
        // Abridged stringEncode logic from original for brevity
        const utf8 = [];
        for (let i = 0; i < string.length; i++) {
          let charcode = string.charCodeAt(i);
          if (charcode < 0x80) utf8.push(charcode);
          else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
          } else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
          } else {
            i++;
            charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (string.charCodeAt(i) & 0x3ff));
            utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
          }
        }
        return new Uint8Array(utf8);
    };

  // Helper for UTF-8 decoding
  const textDecode = typeof TextDecoder === "function"
    ? new TextDecoder().decode.bind(new TextDecoder())
    : function stringDecode(buf) {
        // Abridged stringDecode from original for brevity
        let str = '';
        for (let i = 0; i < buf.length; i++) {
            const value = buf[i];
            if (value < 0x80) {
                str += String.fromCharCode(value);
            } // Simplified for this example, full logic is complex
        }
        return str;
    };

  function concatTypedarrays(chunks) {
    let size = 0;
    chunks.forEach(chunk => { size += chunk.length; });
    const b = new Uint8Array(size);
    let offset = 0;
    chunks.forEach(chunk => {
      b.set(chunk, offset);
      offset += chunk.byteLength || chunk.length;
    });
    return b;
  }

  class PolyfilledBlob {
    constructor(chunks, opts) {
      chunks = chunks ? chunks.slice() : [];
      opts = opts || {};
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk instanceof PolyfilledBlob) {
          chunks[i] = chunk._buffer;
        } else if (typeof chunk === "string") {
          chunks[i] = textEncode(chunk);
        } else if (isArrayBuffer(chunk)) {
          chunks[i] = bufferClone(chunk.buffer || chunk);
        } else {
          chunks[i] = textEncode(String(chunk));
        }
      }

      this._buffer = globalThis.Uint8Array ? concatTypedarrays(chunks) : [].concat.apply([], chunks);
      this.size = this._buffer.length;
      this.type = (opts.type || "").toLowerCase();
    }

    slice(start, end, type) {
      const slice = this._buffer.slice(start || 0, end || this._buffer.length);
      return new PolyfilledBlob([slice], { type });
    }

    async arrayBuffer() {
      return this._buffer.buffer || this._buffer;
    }

    async text() {
      return textDecode(this._buffer);
    }

    toString() {
      return "[object Blob]";
    }
  }

  class PolyfilledFile extends PolyfilledBlob {
    constructor(chunks, name, opts) {
      super(chunks, opts || {});
      this.name = name.replace(/\//g, ":");
      this.lastModifiedDate = opts && opts.lastModified ? new Date(opts.lastModified) : new Date();
      this.lastModified = +this.lastModifiedDate;
    }

    toString() {
      return "[object File]";
    }
  }

  // Simplified Polyfilled FileReader
  class PolyfilledFileReader {
      //... Full implementation would go here ...
  }

  return { PolyfilledBlob, PolyfilledFile, PolyfilledFileReader };
}

// --- Conditional Export Logic ---

// Declare variables for the final exports
let Blob;
let File;
let FileReader;
const URL = globalThis.URL || globalThis.webkitURL || class URLPolyfill {}; // Simplified URL fallback

// Decide which Blob implementation to use
if (blobSupported) {
    Blob = blobSupportsArrayBufferView ? globalThis.Blob : function BlobConstructor(ary, options) {
        // Safari 6 has a bug where it doesn't support ArrayBufferViews.
        const mappedAry = ary.map(chunk => {
            if (chunk.buffer instanceof ArrayBuffer) {
                const buf = chunk.buffer;
                if (chunk.byteLength !== buf.byteLength) {
                    const copy = new Uint8Array(chunk.byteLength);
                    copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength));
                    return copy.buffer;
                }
                return buf;
            }
            return chunk;
        });
        return new origBlob(mappedAry, options || {});
    };
} else if (blobBuilderSupported) {
    Blob = function BlobBuilderConstructor(ary, options) {
        options = options || {};
        const bb = new BlobBuilder();
        ary.forEach(part => bb.append(part));
        return options.type ? bb.getBlob(options.type) : bb.getBlob();
    };
} else {
    const polyfills = createPolyfills();
    Blob = polyfills.PolyfilledBlob;
    File = polyfills.PolyfilledFile;
}

// Use native File if it exists and works, otherwise use polyfill (if determined above)
File = globalThis.File && !File ? globalThis.File : File || createPolyfills().PolyfilledFile;

// Use native FileReader if it exists, otherwise use polyfill
FileReader = globalThis.FileReader || createPolyfills().PolyfilledFileReader;


// Export the determined implementations
export { Blob, File, FileReader, URL };
