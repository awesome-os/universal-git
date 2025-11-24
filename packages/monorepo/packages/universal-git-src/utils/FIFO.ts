import { UniversalBuffer } from './UniversalBuffer.ts'

export class FIFO {
  private _queue: UniversalBuffer[] = []
  private _ended: boolean = false
  private _waiting: ((value: IteratorResult<UniversalBuffer>) => void) | null = null
  error?: Error

  constructor() {
    this._queue = []
  }

  write(chunk: UniversalBuffer): void {
    if (this._ended) {
      throw Error('You cannot write to a FIFO that has already been ended!')
    }
    if (this._waiting) {
      const resolve = this._waiting
      this._waiting = null
      resolve({ value: chunk })
    } else {
      this._queue.push(chunk)
    }
  }

  end(): void {
    this._ended = true
    if (this._waiting) {
      const resolve = this._waiting
      this._waiting = null
      resolve({ done: true } as IteratorResult<UniversalBuffer>)
    }
  }

  destroy(err: Error): void {
    this.error = err
    this.end()
  }

  async next(): Promise<IteratorResult<UniversalBuffer>> {
    if (this._queue.length > 0) {
      return { value: this._queue.shift()! }
    }
    if (this._ended) {
      return { done: true } as IteratorResult<UniversalBuffer>
    }
    if (this._waiting) {
      throw Error(
        'You cannot call read until the previous call to read has returned!'
      )
    }
    return new Promise<IteratorResult<UniversalBuffer>>(resolve => {
      this._waiting = resolve
    })
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<UniversalBuffer> {
    return this
  }
}

