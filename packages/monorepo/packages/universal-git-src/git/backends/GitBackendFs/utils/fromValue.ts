// Convert a value to an Async Iterator
// This will be easier with async generator functions.
export const fromValue = <T>(value: T): AsyncIterableIterator<T> => {
  let queue: T[] = [value]
  return {
    async next(): Promise<IteratorResult<T>> {
      return Promise.resolve({ done: queue.length === 0, value: queue.pop()! })
    },
    async return(): Promise<IteratorResult<T>> {
      queue = []
      return { done: true, value: undefined as T }
    },
    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
      return this
    },
  }
}

