// flate.ts
// The main compression/decompression logic.

// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951

// ... (Keep all the core DEFLATE algorithm code: u8, fleb, fdeb, freb, hMap, inflt, dflt, etc.)
// ... (The synchronous functions like deflateSync, inflateSync, etc., remain unchanged.)
// ... (Error codes and error handling function `err` remain.)

// Import the new worker utilities
import {
    runTaskInWorker,
    runStreamInWorker,
    AsyncStream,
    AsyncOptions,
    AsyncTerminable,
    FlateCallback,
    AsyncFlateStreamHandler,
    AsyncFlateDrainHandler,
} from './worker-util';

//
// The following is a sample of how the original async functions and classes
// would be simplified. Apply this pattern to all async parts of the code.
//

// Worker-side helper to post a buffer back to the main thread
const pbf = (msg: Uint8Array) => (postMessage as Worker['postMessage'])(msg, [msg.buffer]);

// Worker-side helper to get inflate options
const gopt = (o?: AsyncInflateOptions) => o && {
  out: o.size && new u8(o.size),
  dictionary: o.dictionary
};

// Worker-side helper to bridge a streaming class to postMessage
const astrm = (strm: CmpDecmpStrm) => {
  strm.ondata = (dat, final) => (postMessage as Worker['postMessage'])([dat, final], [dat.buffer]);
  return (ev: MessageEvent<[Uint8Array, boolean] | []>) => {
    if (ev.data.length) {
      strm.push(ev.data[0], ev.data[1]);
      (postMessage as Worker['postMessage'])([ev.data[0].length]);
    } else (strm as Deflate | Gzip | Zlib).flush()
  }
}

// Dependency providers for the worker
const bDflt = () => [u8, u16, i32, fleb, fdeb, clim, revfl, revfd, flm, flt, fdm, fdt, rev, deo, et, hMap, wbits, wbits16, hTree, ln, lc, clen, wfblk, wblk, shft, slc, dflt, dopt, deflateSync, pbf];
const bInflt = () => [u8, u16, i32, fleb, fdeb, clim, fl, fd, flrm, fdrm, rev, ec, hMap, max, bits, bits16, shft, slc, err, inflt, inflateSync, pbf, gopt];
const gze = () => [gzh, gzhl, wbytes, crc, crct];
const guze = () => [gzs, gzl];
const zle = () => [zlh, wbytes, adler];
const zule = () => [zls];


/**
 * Asynchronously compresses data with DEFLATE without any wrapper
 */
export function deflate(data: Uint8Array, opts: AsyncDeflateOptions, cb: FlateCallback): AsyncTerminable;
export function deflate(data: Uint8Array, cb: FlateCallback): AsyncTerminable;
export function deflate(data: Uint8Array, opts: AsyncDeflateOptions | FlateCallback, cb?: FlateCallback) {
  if (!cb) { cb = opts as FlateCallback; opts = {}; }
  if (typeof cb !== 'function') err(FlateErrorCode.NoCallback);

  return runTaskInWorker(
    data,
    opts as AsyncDeflateOptions,
    [bDflt],
    ev => pbf(deflateSync(ev.data[0], ev.data[1])),
    0, // Cache ID
    cb
  );
}

/**
 * Asynchronous streaming DEFLATE compression
 */
export class AsyncDeflate implements AsyncStream {
  ondata: AsyncFlateStreamHandler;
  ondrain?: AsyncFlateDrainHandler;
  queuedSize: number;
  terminate: AsyncTerminable;
  push: (chunk: Uint8Array, final?: boolean) => void;
  flush: () => void;
  
  constructor(opts: DeflateOptions, cb?: AsyncFlateStreamHandler);
  constructor(cb?: AsyncFlateStreamHandler);
  constructor(opts?: DeflateOptions | AsyncFlateStreamHandler, cb?: AsyncFlateStreamHandler) {
    runStreamInWorker(
      this,
      StrmOpt.call(this, opts, cb),
      [bDflt, () => [astrm, Deflate]],
      ev => {
        const strm = new Deflate(ev.data);
        onmessage = astrm(strm);
      },
      6,   // Cache ID
      true // Flushable
    );
  }
}

/**
 * Asynchronously expands DEFLATE data with no wrapper
 */
export function inflate(data: Uint8Array, opts: AsyncInflateOptions, cb: FlateCallback): AsyncTerminable;
export function inflate(data: Uint8Array, cb: FlateCallback): AsyncTerminable;
export function inflate(data: Uint8Array, opts: AsyncInflateOptions | FlateCallback, cb?: FlateCallback) {
  if (!cb) { cb = opts as FlateCallback; opts = {}; }
  if (typeof cb !== 'function') err(FlateErrorCode.NoCallback);

  return runTaskInWorker(
    data,
    opts as AsyncInflateOptions,
    [bInflt],
    ev => pbf(inflateSync(ev.data[0], gopt(ev.data[1]))),
    1, // Cache ID
    cb
  );
}

/**
 * Asynchronous streaming DEFLATE decompression
 */
export class AsyncInflate implements AsyncStream {
  ondata: AsyncFlateStreamHandler;
  ondrain?: AsyncFlateDrainHandler;
  queuedSize: number;
  terminate: AsyncTerminable;
  push: (chunk: Uint8Array, final?: boolean) => void;

  constructor(opts: InflateStreamOptions, cb?: AsyncFlateStreamHandler);
  constructor(cb?: AsyncFlateStreamHandler);
  constructor(opts?: InflateStreamOptions | AsyncFlateStreamHandler, cb?: AsyncFlateStreamHandler) {
    runStreamInWorker(
      this,
      StrmOpt.call(this, opts, cb),
      [bInflt, () => [astrm, Inflate]],
      ev => {
        const strm = new Inflate(ev.data);
        onmessage = astrm(strm);
      },
      7,    // Cache ID
      false // Not flushable
    );
  }
}

// ... Repeat this pattern for gzip, gunzip, zlib, unzlib, etc.
