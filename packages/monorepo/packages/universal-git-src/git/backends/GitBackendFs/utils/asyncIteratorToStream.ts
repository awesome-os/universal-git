import { forAwait } from './forAwait.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'

export async function asyncIteratorToStream<T>(iter: AsyncIterable<T> | Iterable<T>): Promise<any> {
  // Dynamic import for Node.js-only dependency
  const { PassThrough } = await import('readable-stream')
  const stream = new PassThrough()
  setTimeout(async () => {
    try {
      for await (const chunk of iter) {
        // Ensure chunk is a Buffer or Uint8Array
        if (chunk instanceof Uint8Array || UniversalBuffer.isBuffer(chunk)) {
          stream.write(chunk)
        } else if (Array.isArray(chunk)) {
          // If chunk is an array, convert to Buffer
          stream.write(UniversalBuffer.from(chunk))
        } else {
          // Fallback: try to convert to Buffer
          stream.write(UniversalBuffer.from(chunk as any))
        }
      }
      stream.end()
    } catch (err) {
      stream.destroy(err as Error)
    }
  }, 1)
  return stream
}

