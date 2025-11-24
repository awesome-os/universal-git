// Convert a web ReadableStream (not Node stream!) to an Async Iterator
// adapted from https://jakearchibald.com/2017/async-iterators-and-generators/
export function fromStream<T = Uint8Array>(stream: ReadableStream<T>): AsyncIterableIterator<T> {
  // Use native async iteration if it's available.
  if (stream[Symbol.asyncIterator]) return stream as any
  const reader = stream.getReader()
  return {
    next(): Promise<IteratorResult<T>> {
      return reader.read()
    },
    return(): Promise<IteratorResult<T>> {
      reader.releaseLock()
      return Promise.resolve({ done: true } as IteratorResult<T>)
    },
    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
      return this
    },
  }
}

