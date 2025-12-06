import { getIterator } from './getIterator.ts'

// Currently 'for await' upsets my linters.
export const forAwait = async <T>(
  iterable: AsyncIterable<T> | Iterable<T> | { next: () => IteratorResult<T> } | T,
  cb: (value: T) => Promise<void> | void
): Promise<void> => {
  const iter = getIterator(iterable)
  try {
    while (true) {
      const { value, done } = await iter.next()
      if (done) break
      if (value) await cb(value)
    }
  } finally {
    if (iter.return) await iter.return()
  }
}

