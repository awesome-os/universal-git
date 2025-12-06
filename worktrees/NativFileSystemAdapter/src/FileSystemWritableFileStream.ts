import config from './config.js'

const { WritableStream } = config

class FileSystemWritableFileStream extends WritableStream {
  #writer: WritableStreamDefaultWriter
  private _closed: boolean

  constructor (writer: WritableStreamDefaultWriter) {
    super(writer)
    this.#writer = writer
    // Stupid Safari hack to extend native classes
    // https://bugs.webkit.org/show_bug.cgi?id=226201
    Object.setPrototypeOf(this, FileSystemWritableFileStream.prototype)

    this._closed = false
  }

  async close (): Promise<void> {
    this._closed = true
    const w = this.getWriter()
    const p = w.close()
    w.releaseLock()
    return p
  }

  seek (position: number): Promise<void> {
    return this.write({ type: 'seek', position })
  }

  truncate (size: number): Promise<void> {
    return this.write({ type: 'truncate', size })
  }

  // The write(data) method steps are:
  write (data: FileSystemWriteChunkType): Promise<void> {
    if (this._closed) {
      return Promise.reject(new TypeError('Cannot write to a CLOSED writable stream'))
    }

    // 1. Let writer be the result of getting a writer for this.
    const writer = this.getWriter()

    // 2. Let result be the result of writing a chunk to writer given data.
    const result = writer.write(data)

    // 3. Release writer.
    writer.releaseLock()

    // 4. Return result.
    return result
  }
}

type FileSystemWriteChunkType = 
  | Blob
  | BufferSource
  | string
  | { type: 'write'; position?: number; data: Blob | BufferSource | string }
  | { type: 'seek'; position: number }
  | { type: 'truncate'; size: number }

Object.defineProperty(FileSystemWritableFileStream.prototype, Symbol.toStringTag, {
  value: 'FileSystemWritableFileStream',
  writable: false,
  enumerable: false,
  configurable: true
})

Object.defineProperties(FileSystemWritableFileStream.prototype, {
  close: { enumerable: true },
  seek: { enumerable: true },
  truncate: { enumerable: true },
  write: { enumerable: true }
})

// Safari safari doesn't support writable streams yet.
// TODO: Remove this once Safari supports writable streams
if (
  globalThis.FileSystemFileHandle &&
  !globalThis.FileSystemFileHandle.prototype.createWritable &&
  !globalThis.FileSystemWritableFileStream
) {
  (globalThis as any).FileSystemWritableFileStream = FileSystemWritableFileStream
}

export default FileSystemWritableFileStream
export { FileSystemWritableFileStream }
