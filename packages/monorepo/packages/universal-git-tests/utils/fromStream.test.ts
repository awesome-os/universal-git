import { test } from 'node:test'
import assert from 'node:assert'
import { fromStream } from '@awesome-os/universal-git-src/utils/fromStream.ts'

test('fromStream', async (t) => {
  await t.test('ok:convert-ReadableStream-to-iterator', async () => {
    const chunks = ['chunk1', 'chunk2', 'chunk3']
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      },
    })

    const iterator = fromStream(stream)
    const results: string[] = []

    for await (const chunk of iterator) {
      results.push(new TextDecoder().decode(chunk))
    }

    assert.deepStrictEqual(results, chunks)
  })

  await t.test('edge:empty-stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })

    const iterator = fromStream(stream)
    const results: Uint8Array[] = []

    for await (const chunk of iterator) {
      results.push(chunk)
    }

    assert.strictEqual(results.length, 0)
  })

  await t.test('ok:handle-stream-single-chunk', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('single'))
        controller.close()
      },
    })

    const iterator = fromStream(stream)
    const results: string[] = []

    for await (const chunk of iterator) {
      results.push(new TextDecoder().decode(chunk))
    }

    assert.deepStrictEqual(results, ['single'])
  })

  await t.test('ok:handle-stream-has-asyncIterator', async () => {
    // Create a mock stream with Symbol.asyncIterator
    // Note: In Node.js, ReadableStream might not have Symbol.asyncIterator by default
    // This test verifies the early return path
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield new TextEncoder().encode('test1')
        yield new TextEncoder().encode('test2')
      },
      getReader: () => {
        throw new Error('Should not call getReader if asyncIterator exists')
      },
    } as any as ReadableStream<Uint8Array>

    const iterator = fromStream(mockStream)
    const results: string[] = []

    for await (const chunk of iterator) {
      results.push(new TextDecoder().decode(chunk))
    }

    assert.deepStrictEqual(results, ['test1', 'test2'])
  })

  await t.test('ok:iterator-is-async-iterable', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('test'))
        controller.close()
      },
    })

    const iterator = fromStream(stream)
    const results: string[] = []

    // Test that it works as an async iterable
    for await (const chunk of iterator) {
      results.push(new TextDecoder().decode(chunk))
    }

    assert.deepStrictEqual(results, ['test'])
  })

  await t.test('ok:handle-binary-data', async () => {
    const binaryData = new Uint8Array([0x01, 0x02, 0x03, 0xFF])
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(binaryData)
        controller.close()
      },
    })

    const iterator = fromStream(stream)
    const results: Uint8Array[] = []

    for await (const chunk of iterator) {
      results.push(chunk)
    }

    assert.strictEqual(results.length, 1)
    assert.deepStrictEqual(results[0], binaryData)
  })
})

