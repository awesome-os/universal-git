// Helper for concatenating Uint8Arrays
function concatUint8Arrays(arrays) {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}


export class StreamReader {
  /**
   * Reads from a Web ReadableStream of Uint8Array chunks, providing buffer management
   * and convenience methods for reading bytes, chunks, or specific lengths.
   *
   * @param {ReadableStream<Uint8Array>} stream The input ReadableStream.
   *   This stream can originate from sources like `Response.body` (from `fetch`)
   *   or `Blob.stream()`.
   */
  constructor(stream) {
    if (!(stream instanceof ReadableStream)) {
      throw new TypeError('StreamReader expects a ReadableStream as input.');
    }

    this.reader = stream.getReader(); // Acquire a reader for the stream
    this.buffer = new Uint8Array(0); // Internal buffer to hold data
    this.cursor = 0; // Current read position within `this.buffer`
    this.undoCursor = 0; // Position to revert to for `undo()`
    this._ended = false; // True if the underlying stream has ended
    this._discardedBytes = 0; // Total bytes read and discarded from the buffer

    // A promise that tracks an ongoing read() operation on the underlying reader
    // to prevent multiple concurrent reads.
    /** @type {Promise<ReadableStreamReadResult<Uint8Array>>} */
    this._readPromise = Promise.resolve(/** @type {ReadableStreamReadResult<Uint8Array>} */ ({}));
  }

  /**
   * Checks if the stream has reached its end (EOF) and all buffered data has been consumed.
   * @returns {boolean} True if at EOF, false otherwise.
   */
  eof() {
    return this._ended && this.cursor === this.buffer.length;
  }

  /**
   * Returns the total number of bytes read from the start of the stream,
   * including bytes that have been read and then discarded from the internal buffer.
   * @returns {number} Total bytes read.
   */
  tell() {
    return this._discardedBytes + this.cursor;
  }

  /**
   * Reads a single byte from the stream.
   * @returns {Promise<number | undefined>} The byte as a number (0-255), or `undefined` if EOF and no more bytes.
   */
  async byte() {
    if (this.eof()) return undefined;
    await this._ensureBytes(1); // Ensure at least 1 byte is available in the buffer

    if (this.eof()) return undefined; // Re-check if stream ended during `_ensureBytes`

    const b = this.buffer[this.cursor];
    this._moveCursor(1); // Advance cursor by 1 byte
    return b;
  }

  /**
   * Reads the next available logical "chunk" from the stream.
   * If there's unread data in the current internal buffer, it returns that.
   * If the internal buffer is empty, it attempts to read the next raw chunk from the underlying stream.
   *
   * @returns {Promise<Uint8Array<ArrayBufferLike> | Promise<ReadableStreamReadResult<Uint8Array<ArrayBufferLike>>| undefined>>} The chunk as a Uint8Array, or `undefined` if EOF and no more data.
   */
  async chunk() {
    if (this.eof()) return undefined;

    // If the entire `this.buffer` has been consumed (`cursor` is at the end)
    if (this.cursor === this.buffer.length) {
      this._trim(); // Discard old, consumed data to free memory
      await this._loadNextRawChunk(); // from the underlying stream
      if (this.eof()) return undefined; // Check if stream ended after trying to load new buffer
    }

    // Return the remaining unread portion of the buffer (which could be a newly loaded chunk)
    // and advance the cursor to consume it.
    const chunkToReturn = this.buffer.slice(this.cursor);
    this._moveCursor(chunkToReturn.length);
    return chunkToReturn;
  }

  /**
   * Reads exactly `n` bytes from the stream.
   * If `n` bytes are not available before EOF, it returns fewer bytes or `undefined`.
   * @param {number} n The number of bytes to read. Must be non-negative.
   * @returns {Promise<Uint8Array | undefined>} The bytes as a Uint8Array, or `undefined` if EOF and no bytes available.
   */
  async read(n) {
    if (this.eof()) return undefined;
    if (n === 0) return new Uint8Array(0);

    await this._ensureBytes(n); // Ensure `n` bytes are available, or until stream ends

    // Calculate how many bytes we can actually read from the current buffer.
    const available = this.buffer.length - this.cursor;
    const bytesToRead = Math.min(n, available);

    if (bytesToRead === 0) {
      return undefined; // Nothing left to read after `_ensureBytes`
    }

    const chunk = this.buffer.slice(this.cursor, this.cursor + bytesToRead);
    this._moveCursor(bytesToRead); // Advance cursor
    return chunk;
  }

  /**
   * Skips `n` bytes in the stream without returning them.
   * If `n` bytes are not available before EOF, it skips fewer bytes.
   * @param {number} n The number of bytes to skip. Must be non-negative.
   * @returns {Promise<void>}
   */
  async skip(n) {
    if (this.eof()) return;
    if (n === 0) return;

    await this._ensureBytes(n); // Ensure `n` bytes are available, or until stream ends

    // Skip only what's available if less than `n` bytes are present.
    const available = this.buffer.length - this.cursor;
    const bytesToSkip = Math.min(n, available);
    this._moveCursor(bytesToSkip); // Advance cursor
  }

  /**
   * Reverts the cursor to the position before the last `byte()`, `chunk()`, `read()`, or `skip()` call.
   * Only one level of undo is supported.
   * @returns {void}
   */
  undo() {
    this.cursor = this.undoCursor;
  }

  /**
   * Internal method: Reads the next raw chunk from the underlying stream using `reader.read()`.
   * Manages `_readPromise` to prevent multiple concurrent `reader.read()` calls.
   * Updates `_ended` if the stream finishes.
   * @returns {Promise<Uint8Array | null>} The next chunk as a Uint8Array, or `null` if the stream has ended.
   */
  async _readNextRawChunk() {
    if (this._ended) return null;

    // Ensure only one `reader.read()` operation is active at a time.
    
    this._readPromise = this._readPromise.then(this.reader.read);
    
    const { done, value } = await this._readPromise;
    //this._readPromise = Promise.resolve(); // Clear the promise for the next read

    if (done) {
      this._ended = true;
      this.reader.releaseLock(); // Release the reader's lock once the stream is fully consumed
      return null;
    }
    // Web Streams `value` is typically a Uint8Array. If it's falsy, return an empty Uint8Array.
    return value || new Uint8Array(0);
  }

  /**
   * Internal method: Replaces the internal buffer with the next raw chunk from the stream.
   * This is typically called when the current buffer is fully consumed.
   * Updates `_discardedBytes` and resets `cursor` and `undoCursor`.
   * @returns {Promise<void>}
   */
  async _loadNextRawChunk() {
    if (this._ended) {
      this.buffer = new Uint8Array(0);
      this.cursor = 0;
      this.undoCursor = 0;
      return;
    }

    this._discardedBytes += this.buffer.length; // All bytes in previous buffer are now considered discarded
    this.undoCursor = 0;
    this.cursor = 0;
    // If stream ended, buffer becomes empty
    this.buffer = new Uint8Array(await this._readNextRawChunk() || [0]);
  }

  /**
   * Internal method: Ensures that at least `n` bytes are available in `this.buffer`
   * starting from `this.cursor`. It achieves this by fetching and concatenating
   * raw chunks from the underlying stream if necessary.
   * This method also implicitly trims the buffer to remove already consumed data.
   * @param {number} n The minimum number of bytes to ensure are available.
   * @returns {Promise<void>}
   */
  async _ensureBytes(n) {
    if (this._ended || n <= 0) return;

    // First, discard already read portions of the buffer to free memory.
    // `_trim` moves `this.cursor` and `this.undoCursor` to 0 relative to the new buffer start.
    this._trim();

    // Check how many more bytes are needed.
    let availableBytesInCurrentBuffer = this.buffer.length - this.cursor; // `this.cursor` is now 0 after trim
    let needed = n - availableBytesInCurrentBuffer;

    if (needed <= 0) {
      // Enough bytes already in the buffer starting from `this.cursor` (which is 0).
      return;
    }

    // Accumulate more data until `n` bytes are available or the stream ends.
    const chunksToConcatenate = [this.buffer]; // Start with the (trimmed) current buffer
    // `_discardedBytes` was updated by `_trim`, `cursor` and `undoCursor` are 0.
    this.buffer = new Uint8Array(0); // Clear current buffer before re-filling

    let currentAccumulatedLength = chunksToConcatenate[0].length;

    while (currentAccumulatedLength < n && !this._ended) {
      const nextRawChunk = await this._readNextRawChunk();
      if (nextRawChunk === null) { // Stream has ended
        break;
      }
      chunksToConcatenate.push(new Uint8Array(nextRawChunk));
      currentAccumulatedLength += nextRawChunk.length;
    }

    // Concatenate all accumulated chunks into the new buffer.
    this.buffer = concatUint8Arrays(chunksToConcatenate);
  }

  /**
   * Internal method: Discards the portion of the buffer that has already been read
   * (from index `0` up to `this.cursor`). This effectively shifts the unread data
   * to the beginning of a new buffer.
   */
  _trim() {
    if (this.cursor > 0) { // If anything has been read from the buffer
      this.buffer = this.buffer.slice(this.cursor);
      this._discardedBytes += this.cursor; // Add the discarded bytes to the total count
      this.undoCursor = 0; // After trim, both cursors point to the new start of the buffer
      this.cursor = 0;
    }
  }

  /**
   * Internal method: Updates `cursor` and `undoCursor`.
   * @param {number} n The number of bytes to advance the cursor by.
   */
  _moveCursor(n) {
    this.undoCursor = this.cursor; // Store current cursor for potential undo
    this.cursor += n;
    // Ensure cursor doesn't exceed buffer length
    if (this.cursor > this.buffer.length) {
      this.cursor = this.buffer.length;
    }
  }

  /**
   * Releases the lock on the underlying stream's reader.
   * This is important for allowing other readers to acquire a lock or for
   * proper garbage collection of the stream. It should be called when
   * the StreamReader instance is no longer needed.
   */
  releaseLock() {
    if (!this._ended && this.reader) { // Only release if not already done and reader exists
      this.reader.releaseLock();
    }
  }
}
