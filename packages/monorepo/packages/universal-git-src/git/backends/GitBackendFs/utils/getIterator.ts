import { fromValue } from './fromValue.ts'

export const getIterator = <T>(
  iterable: AsyncIterable<T> | Iterable<T> | { next: () => IteratorResult<T> } | T
): AsyncIterator<T> => {
  // Check for async iterable
  if (iterable != null && typeof iterable === 'object' && Symbol.asyncIterator in iterable) {
    return (iterable as AsyncIterable<T>)[Symbol.asyncIterator]()
  }
  // Check for sync iterable (including strings which are iterable)
  // Check if Symbol.iterator exists as a function (works for objects and primitives like strings)
  if (iterable != null && typeof (iterable as any)[Symbol.iterator] === 'function') {
    return (iterable as Iterable<T>)[Symbol.iterator]() as unknown as AsyncIterator<T>
  }
  // Check for iterator-like object with next method
  if (iterable != null && typeof iterable === 'object' && 'next' in iterable) {
    return iterable as unknown as AsyncIterator<T>
  }
  // Convert single value to iterator
  return fromValue(iterable) as AsyncIterator<T>
}

