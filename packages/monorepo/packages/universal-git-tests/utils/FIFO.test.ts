import { test } from 'node:test'
import assert from 'node:assert'
import { FIFO } from '@awesome-os/universal-git-src/utils/FIFO.ts'

test('FIFO', async (t) => {
  await t.test('ok:writes-reads-buffers-order', async () => {
    const fifo = new FIFO()
    const buffer1 = Buffer.from([1, 2, 3])
    const buffer2 = Buffer.from([4, 5, 6])
    
    fifo.write(buffer1)
    fifo.write(buffer2)
    
    const result1 = await fifo.next()
    assert.ok(!result1.done)
    assert.deepStrictEqual(result1.value, buffer1)
    
    const result2 = await fifo.next()
    assert.ok(!result2.done)
    assert.deepStrictEqual(result2.value, buffer2)
  })

  await t.test('ok:handles-async-reading', async () => {
    const fifo = new FIFO()
    const readPromise = fifo.next()
    
    // Write after read is called
    setTimeout(() => {
      fifo.write(Buffer.from([42]))
    }, 10)
    
    const result = await readPromise
    assert.ok(!result.done)
    assert.deepStrictEqual(result.value, Buffer.from([42]))
  })

  await t.test('ok:ends-iteration-on-end', async () => {
    const fifo = new FIFO()
    fifo.write(Buffer.from([1]))
    
    const result1 = await fifo.next()
    assert.ok(!result1.done)
    assert.deepStrictEqual(result1.value, Buffer.from([1]))
    
    fifo.end()
    const result2 = await fifo.next()
    assert.strictEqual(result2.done, true)
  })

  await t.test('ok:handles-async-end', async () => {
    const fifo = new FIFO()
    const readPromise = fifo.next()
    
    // End immediately (synchronously) - the promise will resolve with done: true
    fifo.end()
    
    const result = await readPromise
    assert.strictEqual(result.done, true)
  })

  await t.test('error:writing-after-end', () => {
    const fifo = new FIFO()
    fifo.end()
    
    assert.throws(() => {
      fifo.write(Buffer.from([1]))
    }, /cannot write to a FIFO that has already been ended/)
  })

  await t.test('ok:destroys-with-error', () => {
    const fifo = new FIFO()
    const error = new Error('Test error')
    fifo.destroy(error)
    
    assert.strictEqual(fifo.error, error)
    assert.throws(() => {
      fifo.write(Buffer.from([1]))
    }, /cannot write to a FIFO that has already been ended/)
  })

  await t.test('error:concurrent-next-calls', async () => {
    const fifo = new FIFO()
    const promise1 = fifo.next()
    
    // Second call should throw asynchronously
    await assert.rejects(async () => {
      await fifo.next()
    }, /cannot call read until the previous call to read has returned/)
    
    // Clean up
    fifo.end()
    await promise1
  })

  await t.test('edge:empty-queue-with-end', async () => {
    const fifo = new FIFO()
    fifo.end()
    
    const result = await fifo.next()
    assert.strictEqual(result.done, true)
    assert.strictEqual(result.value, undefined)
  })

  await t.test('ok:processes-all-queued-before-end', async () => {
    const fifo = new FIFO()
    fifo.write(Buffer.from([1]))
    fifo.write(Buffer.from([2]))
    fifo.end()
    
    const result1 = await fifo.next()
    assert.ok(!result1.done)
    assert.deepStrictEqual(result1.value, Buffer.from([1]))
    
    const result2 = await fifo.next()
    assert.ok(!result2.done)
    assert.deepStrictEqual(result2.value, Buffer.from([2]))
    
    const result3 = await fifo.next()
    assert.strictEqual(result3.done, true)
  })
})

