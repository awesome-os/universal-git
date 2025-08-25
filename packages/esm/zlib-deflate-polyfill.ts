// flate.ts

// ... (Keep all the core DEFLATE algorithm code: u8, fleb, dflt, inflt, etc.)
// ... (Keep synchronous functions like deflateSync, inflateSync)

// Import the new worker utilities
import {
    createTransformStreamInWorker,
    runTaskInWorker,
    AsyncTerminable,
    FlateCallback,
    AsyncOptions,
} from './worker-streams';

// --- Refactor Core Stream Classes into TransformStream Factories ---

// Example for Deflate. Apply this pattern to Inflate, Gzip, etc.
// The original streaming classes are converted to functions that
// return a TransformStream, which is how they are used in the worker.
function createDeflateStream(opts: DeflateOptions = {}): TransformStream<Uint8Array, Uint8Array> {
    const st = { l: 0, i: 32768, w: 32768, z: 32768 };
    // Buffer logic from the original Deflate class
    let b = new Uint8Array(98304);
    if (opts.dictionary) {
        const dict = opts.dictionary.subarray(-32768);
        b.set(dict, 32768 - dict.length);
        st.i = 32768 - dict.length;
    }

    return new TransformStream({
        transform(chunk, controller) {
            // Logic from original Deflate.push()
            const endLen = chunk.length + st.z;
            if (endLen > b.length) {
                // Handle buffer resizing and flushing intermediate chunks
                // This part is complex but directly maps from the old push()
                // For brevity, a simplified version is shown here.
                // You would need to fully implement the buffer flushing logic.
                const processed = dopt(b.subarray(0, st.z), opts, 0, 0, st);
                controller.enqueue(processed);
                // Reset buffer, etc.
                b.set(b.subarray(-32768));
                st.z = 32768;
            }
            b.set(chunk, st.z);
            st.z += chunk.length;
        },
        flush(controller) {
            // Logic from original Deflate.push(..., final=true) and flush()
            st.l = 1; // Mark as final
            const finalChunk = dopt(b.subarray(0, st.z), opts, 0, 0, st);
            if (finalChunk.length > 0) {
                controller.enqueue(finalChunk);
            }
        }
    });
}

// ... createInflateStream(), createGzipStream(), etc. would follow the same pattern ...

// --- Dependency providers now provide the stream factory functions ---

const bDflt = () => [/* ...core constants... */, dopt, createDeflateStream];
const bInflt = () => [/* ...core constants... */, inflt, createInflateStream];


// --- Simplified Asynchronous API ---

/**
 * Asynchronously compresses data with DEFLATE without any wrapper.
 * Now returns a Promise for idiomatic async/await usage.
 */
export function deflate(data: Uint8Array, opts: AsyncDeflateOptions = {}): Promise<Uint8Array> {
  return runTaskInWorker(
    data,
    [bDflt],
    'createDeflateStream', // Name of the stream factory in the worker
    opts,
    0 // Cache ID
  );
}

/**
 * Asynchronous streaming DEFLATE compression.
 * This class now simply holds the stream and termination logic.
 */
export class AsyncDeflate {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  terminate: AsyncTerminable;

  constructor(opts: DeflateOptions = {}) {
    const { stream, terminate } = createTransformStreamInWorker(
      [bDflt],
      'createDeflateStream',
      opts,
      6 // Cache ID
    );
    this.readable = stream.readable;
    this.writable = stream.writable;
    this.terminate = terminate;
  }
}

/**
 * Asynchronously expands DEFLATE data with no wrapper.
 */
export function inflate(data: Uint8Array, opts: AsyncInflateOptions = {}): Promise<Uint8Array> {
    return runTaskInWorker(
        data,
        [bInflt],
        'createInflateStream',
        opts,
        1 // Cache ID
    );
}

/**
 * Asynchronous streaming DEFLATE decompression.
 */
export class AsyncInflate {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  terminate: AsyncTerminable;

  constructor(opts: InflateOptions = {}) {
    const { stream, terminate } = createTransformStreamInWorker(
      [bInflt],
      'createInflateStream',
      opts,
      7 // Cache ID
    );
    this.readable = stream.readable;
    this.writable = stream.writable;
    this.terminate = terminate;
  }
}

// ... Repeat this pattern for Gzip, Gunzip, Zlib, Unzlib, etc.
