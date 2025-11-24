import { getIterator } from './getIterator.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'

const STREAM_READER_DEBUG_ENABLED =
  process.env.UNIVERSAL_GIT_DEBUG_STREAM_READER === '1' ||
  process.env.ISOGIT_DEBUG_STREAM_READER === '1' ||
  process.env.ISO_GIT_DEBUG_STREAM_READER === '1'

const debugStreamReader = (message: string, extra?: Record<string, unknown>): void => {
  if (!STREAM_READER_DEBUG_ENABLED) return
  if (extra) {
    console.log(`[Git StreamReader] ${message}`, extra)
  } else {
    console.log(`[Git StreamReader] ${message}`)
  }
}

// inspired by 'gartal' but lighter-weight and more battle-tested.
export class StreamReader {
  private stream: AsyncIterator<UniversalBuffer | Uint8Array>
  private buffer: UniversalBuffer | null = null
  private cursor = 0
  private undoCursor = 0
  private started = false
  private _ended = false
  private _discardedBytes = 0

  constructor(stream: AsyncIterable<UniversalBuffer | Uint8Array> | ReadableStream<any>) {
    // Handle ReadableStream by converting it to an async iterable
    if (stream instanceof ReadableStream) {
      const reader = stream.getReader()
      const asyncIterable: AsyncIterable<UniversalBuffer | Uint8Array> = {
        async *[Symbol.asyncIterator]() {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              yield value
            }
          } finally {
            reader.releaseLock()
          }
        }
      }
      this.stream = getIterator(asyncIterable)
    } else {
      this.stream = getIterator(stream)
    }
  }

  eof(): boolean {
    return this._ended && this.buffer !== null && this.cursor === this.buffer.length
  }

  tell(): number {
    return this._discardedBytes + this.cursor
  }

  async byte(): Promise<number | undefined> {
    if (this.eof()) return
    if (!this.started) await this._init()
    if (this.buffer && this.cursor === this.buffer.length) {
      await this._loadnext()
      if (this._ended) return
    }
    this._moveCursor(1)
    return this.buffer?.[this.undoCursor]
  }

  async chunk(): Promise<UniversalBuffer | undefined> {
    if (this.eof()) return
    if (!this.started) await this._init()
    if (this.buffer && this.cursor === this.buffer.length) {
      await this._loadnext()
      if (this._ended) return
    }
    this._moveCursor(this.buffer?.length ?? 0)
    return this.buffer?.slice(this.undoCursor, this.cursor)
  }

  async read(n: number): Promise<UniversalBuffer | undefined> {
    if (this.eof()) return
    if (!this.started) await this._init()
    if (this.buffer && this.cursor + n > this.buffer.length) {
      this._trim()
      await this._accumulate(n)
    }
    this._moveCursor(n)
    debugStreamReader('Read fixed number of bytes', {
      requested: n,
      available: this.buffer?.length ?? 0,
      cursor: this.cursor,
      discarded: this._discardedBytes,
    })
    return this.buffer?.slice(this.undoCursor, this.cursor)
  }

  async skip(n: number): Promise<void> {
    if (this.eof()) return
    if (!this.started) await this._init()
    if (this.buffer && this.cursor + n > this.buffer.length) {
      this._trim()
      await this._accumulate(n)
    }
    this._moveCursor(n)
  }

  async undo(): Promise<void> {
    this.cursor = this.undoCursor
  }

  private async _next(): Promise<UniversalBuffer> {
    this.started = true
    debugStreamReader('Requesting next chunk from iterator')
    const { done, value } = await this.stream.next()
    if (done) {
      this._ended = true
      debugStreamReader('Underlying iterator signaled done', { hasValue: Boolean(value) })
      if (!value) return UniversalBuffer.alloc(0)
    }
    if (value) {
      const chunk = UniversalBuffer.from(value)
      debugStreamReader('Received chunk from iterator', { bytes: chunk.length })
      return chunk
    }
    debugStreamReader('Iterator yielded falsy value, returning empty buffer')
    return UniversalBuffer.alloc(0)
  }

  private _trim(): void {
    // Throw away parts of the buffer we don't need anymore
    // assert(this.cursor <= this.buffer.length)
    if (this.buffer) {
      debugStreamReader('Trimming internal buffer', {
        beforeBytes: this.buffer.length,
        cursor: this.cursor,
        undoCursor: this.undoCursor,
      })
      this.buffer = this.buffer.slice(this.undoCursor)
      this.cursor -= this.undoCursor
      this._discardedBytes += this.undoCursor
      this.undoCursor = 0
    }
  }

  private _moveCursor(n: number): void {
    this.undoCursor = this.cursor
    this.cursor += n
    if (this.buffer && this.cursor > this.buffer.length) {
      this.cursor = this.buffer.length
    }
  }

  private async _accumulate(n: number): Promise<void> {
    if (this._ended) return
    // Expand the buffer until we have N bytes of data
    // or we've reached the end of the stream
    const buffers: UniversalBuffer[] = this.buffer ? [this.buffer] : []
    debugStreamReader('Accumulating additional data', {
      needed: n,
      current: this.buffer?.length ?? 0,
    })
    while (this.buffer && this.cursor + n > lengthBuffers(buffers)) {
      const nextbuffer = await this._next()
      if (this._ended) break
      buffers.push(nextbuffer)
    }
    this.buffer = UniversalBuffer.concat(buffers)
    debugStreamReader('Finished accumulation', { totalBytes: this.buffer.length })
  }

  private async _loadnext(): Promise<void> {
    if (this.buffer) {
      this._discardedBytes += this.buffer.length
    }
    this.undoCursor = 0
    this.cursor = 0
    this.buffer = await this._next()
    debugStreamReader('Loaded next buffer', { bytes: this.buffer.length })
  }

  private async _init(): Promise<void> {
    this.buffer = await this._next()
    debugStreamReader('Initialized reader', { bytes: this.buffer.length })
  }
}

// This helper function helps us postpone concatenating buffers, which
// would create intermediate buffer objects,
const lengthBuffers = (buffers: UniversalBuffer[]): number => {
  return buffers.reduce((acc, buffer) => acc + buffer.length, 0)
}

