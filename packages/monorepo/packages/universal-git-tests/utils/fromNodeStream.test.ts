import { test } from 'node:test'
import assert from 'node:assert'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import { Readable } from 'readable-stream'

test('UniversalBuffer.fromNodeStream', async (t) => {
  await t.test('ok:converts-Node-stream-to-iterator', async () => {
    let i = 0
    const stream = new Readable({
      read() {
        if (i++ < 2) {
          this.push(Buffer.from(`chunk${i}`))
        } else {
          this.push(null) // End stream
        }
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    const chunks: Buffer[] = []
    
    for await (const chunk of iterator) {
      chunks.push(chunk)
    }
    
    assert.strictEqual(chunks.length, 2)
    assert.deepStrictEqual(chunks[0], Buffer.from('chunk1'))
    assert.deepStrictEqual(chunks[1], Buffer.from('chunk2'))
  })

  await t.test('edge:empty-stream', async () => {
    const stream = new Readable({
      read() {
        this.push(null) // End immediately
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    const chunks: Buffer[] = []
    
    for await (const chunk of iterator) {
      chunks.push(chunk)
    }
    
    assert.strictEqual(chunks.length, 0)
  })

  await t.test('error:stream-error', async () => {
    const stream = new Readable({
      read() {
        // Use 'nextTick' to avoid emitting error during constructor
        process.nextTick(() => this.emit('error', new Error('Stream error')))
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    await assert.rejects(
      async () => {
        for await (const chunk of iterator) {
          // Should not reach here
        }
      },
      (error: any) => {
        return error instanceof Error && error.message === 'Stream error'
      }
    )
  })

  await t.test('ok:handles-multiple-chunks', async () => {
    const data = ['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5']
    let i = 0
    const stream = new Readable({
      read() {
        if (i < data.length) {
          this.push(Buffer.from(data[i++]))
        } else {
          this.push(null)
        }
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    const received: Buffer[] = []
    
    for await (const chunk of iterator) {
      received.push(chunk)
    }
    
    assert.strictEqual(received.length, 5)
    assert.deepStrictEqual(received[0], Buffer.from('chunk1'))
    assert.deepStrictEqual(received[4], Buffer.from('chunk5'))
  })

  await t.test('ok:handles-return-method', async () => {
    let destroyed = false
    let i = 0
    const stream = new Readable({
      read() {
        if (i++ < 2) {
          this.push(Buffer.from(`chunk${i}`))
        }
        // Don't end, to test return()
      },
      destroy(err, callback) {
        destroyed = true
        callback(err)
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    // Read one chunk
    const first = await iterator.next()
    assert.ok(!first.done)
    assert.deepStrictEqual(first.value, Buffer.from('chunk1'))
    
    // Call return() to clean up
    const result = await iterator.return!()
    assert.ok(result.done)
    
    // Stream should be cleaned up
    assert.strictEqual(destroyed, true, 'Stream should be destroyed')
  })

  await t.test('ok:handles-Symbol-asyncIterator', async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.from('chunk1'))
        this.push(null)
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    // Should have Symbol.asyncIterator method
    assert.ok(iterator[Symbol.asyncIterator])
    
    // Should return itself
    const asyncIter = iterator[Symbol.asyncIterator]()
    assert.strictEqual(asyncIter, iterator)
  })

  await t.test('ok:handles-existing-async-iterator', async () => {
    // Create a mock stream with Symbol.asyncIterator
    const mockStream: any = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('chunk1')
        yield Buffer.from('chunk2')
      },
    }
    
    // Set enumerable property
    Object.defineProperty(mockStream, Symbol.asyncIterator, {
      enumerable: true,
      value: mockStream[Symbol.asyncIterator],
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(mockStream)
    
    // Should return the stream itself if it has async iterator
    assert.strictEqual(iterator, mockStream)
  })

  await t.test('ok:handles-queued-chunks-before-next', async () => {
    let i = 0
    const stream = new Readable({
      read() {
        if (i++ < 2) {
          this.push(Buffer.from(`chunk${i}`))
        } else {
          this.push(null)
        }
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    // The stream will start pushing as soon as it's created,
    // so data will be in the buffer before we even call `next()`.
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const chunks: Buffer[] = []
    for await (const chunk of iterator) {
      chunks.push(chunk)
    }
    
    // Should receive all queued chunks
    assert.strictEqual(chunks.length, 2)
  })

  await t.test('error:error-after-chunks', async () => {
    let pushedFirst = false
    const stream = new Readable({
      read() {
        if (!pushedFirst) {
          pushedFirst = true
          this.push(Buffer.from('chunk1'))
          // Emit error after first chunk
          setTimeout(() => {
            this.emit('error', new Error('Error after chunk'))
          }, 10)
        }
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    await assert.rejects(
      async () => {
        for await (const chunk of iterator) {
          // Should receive first chunk, then error
        }
      },
      (error: any) => {
        return error instanceof Error && error.message === 'Error after chunk'
      }
    )
  })

  await t.test('ok:handles-end-after-chunks-queued', async () => {
    let i = 0
    const stream = new Readable({
      read() {
        if (i === 0) {
          this.push(Buffer.from('chunk1'))
          i++
        } else if (i === 1) {
          this.push(Buffer.from('chunk2'))
          i++
          // End after pushing
          setTimeout(() => {
            this.push(null)
          }, 10)
        }
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    const chunks: Buffer[] = []
    for await (const chunk of iterator) {
      chunks.push(chunk)
    }
    
    assert.strictEqual(chunks.length, 2)
  })

  await t.test('ok:handles-next-empty-queue-stream-ended', async () => {
    const stream = new Readable({
      read() {
        this.push(null) // End immediately
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    // Wait for stream to end
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const result = await iterator.next()
    assert.ok(result.done)
  })

  await t.test('ok:handles-next-queue-has-items', async () => {
    let i = 0
    const stream = new Readable({
      read() {
        if (i === 0) {
          this.push(Buffer.from('chunk1'))
          i++
        } else if (i === 1) {
          this.push(Buffer.from('chunk2'))
          this.push(null)
          i++
        }
      },
    })
    
    const iterator = UniversalBuffer.fromNodeStream<Buffer>(stream)
    
    // Wait for chunks to queue
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const result1 = await iterator.next()
    assert.ok(!result1.done)
    assert.deepStrictEqual(result1.value, Buffer.from('chunk1'))
    
    const result2 = await iterator.next()
    assert.ok(!result2.done)
    assert.deepStrictEqual(result2.value, Buffer.from('chunk2'))
    
    const result3 = await iterator.next()
    assert.ok(result3.done)
  })
})

