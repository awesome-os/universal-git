import { test } from 'node:test'
import assert from 'node:assert'
import { asyncIteratorToStream } from '@awesome-os/universal-git-src/utils/asyncIteratorToStream.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

/**
 * @deprecated Use UniversalBuffer.createAsyncIterator() instead
 */
async function* createAsyncIterator(items: Buffer[]): AsyncIterableIterator<Buffer> {
  console.warn('createAsyncIterator is deprecated. Use UniversalBuffer.createAsyncIterator() instead.')
  // Convert Buffer[] to UniversalBuffer[] and use the unified method
  const universalBuffers = items.map(item => UniversalBuffer.from(item))
  yield* UniversalBuffer.createAsyncIterator(universalBuffers) as any
}

test('asyncIteratorToStream', async (t) => {
  await t.test('ok:converts-iterator-to-stream', async () => {
    const items = [
      Buffer.from('chunk1'),
      Buffer.from('chunk2'),
      Buffer.from('chunk3'),
    ]
    const iterator = createAsyncIterator(items)
    const stream = await asyncIteratorToStream(iterator)
    
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        assert.strictEqual(chunks.length, 3)
        assert.deepStrictEqual(chunks[0], Buffer.from('chunk1'))
        assert.deepStrictEqual(chunks[1], Buffer.from('chunk2'))
        assert.deepStrictEqual(chunks[2], Buffer.from('chunk3'))
        resolve()
      })
      stream.on('error', reject)
    })
  })

  await t.test('edge:empty-iterator', async () => {
    const iterator = createAsyncIterator([])
    const stream = await asyncIteratorToStream(iterator)
    
    let dataReceived = false
    stream.on('data', () => {
      dataReceived = true
    })
    
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        assert.strictEqual(dataReceived, false)
        resolve()
      })
      stream.on('error', reject)
    })
  })

  await t.test('ok:handles-Uint8Array-chunks', async () => {
    const items = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ]
    const iterator = createAsyncIterator(items.map(b => Buffer.from(b)))
    const stream = await asyncIteratorToStream(iterator)
    
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        assert.strictEqual(chunks.length, 2)
        assert.deepStrictEqual(chunks[0], Buffer.from([1, 2, 3]))
        assert.deepStrictEqual(chunks[1], Buffer.from([4, 5, 6]))
        resolve()
      })
      stream.on('error', reject)
    })
  })

  await t.test('ok:handles-array-chunks', async () => {
    const items = [
      [1, 2, 3] as any,
      [4, 5, 6] as any,
    ]
    const iterator = createAsyncIterator(items.map(arr => Buffer.from(arr)))
    const stream = await asyncIteratorToStream(iterator)
    
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        assert.strictEqual(chunks.length, 2)
        resolve()
      })
      stream.on('error', reject)
    })
  })

  await t.test('error:error-in-iterator', async () => {
    async function* errorIterator(): AsyncIterableIterator<Buffer> {
      yield Buffer.from('chunk1')
      throw new Error('Iterator error')
    }
    
    const stream = await asyncIteratorToStream(errorIterator())
    
    await new Promise<void>((resolve, reject) => {
      stream.on('error', (error: Error) => {
        assert.ok(error instanceof Error)
        assert.strictEqual(error.message, 'Iterator error')
        resolve()
      })
      stream.on('end', () => {
        reject(new Error('Stream should have errored'))
      })
    })
  })

  await t.test('ok:handles-large-number-chunks', async () => {
    const items = Array.from({ length: 100 }, (_, i) => Buffer.from(`chunk${i}`))
    const iterator = createAsyncIterator(items)
    const stream = await asyncIteratorToStream(iterator)
    
    let chunkCount = 0
    stream.on('data', () => {
      chunkCount++
    })
    
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        assert.strictEqual(chunkCount, 100)
        resolve()
      })
      stream.on('error', reject)
    })
  })

  await t.test('ok:handles-single-chunk', async () => {
    const items = [Buffer.from('single chunk')]
    const iterator = createAsyncIterator(items)
    const stream = await asyncIteratorToStream(iterator)
    
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        assert.strictEqual(chunks.length, 1)
        assert.deepStrictEqual(chunks[0], Buffer.from('single chunk'))
        resolve()
      })
      stream.on('error', reject)
    })
  })

  await t.test('ok:handles-iterable-not-iterator', async () => {
    const items = [
      Buffer.from('chunk1'),
      Buffer.from('chunk2'),
    ]
    const iterable = items
    const stream = await asyncIteratorToStream(iterable)
    
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        assert.strictEqual(chunks.length, 2)
        resolve()
      })
      stream.on('error', reject)
    })
  })
})

