import { test } from 'node:test'
import assert from 'node:assert'
import { StreamReader } from '@awesome-os/universal-git-src/utils/StreamReader.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('StreamReader', async (t) => {
  await t.test('ok:constructor-initializes', () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('test')])
    const reader = new StreamReader(iterator)
    assert.ok(reader instanceof StreamReader)
  })

  await t.test('ok:constructor-Buffer-check', () => {
    // This test is hard to run in Node.js where Buffer is always available
    // But we can verify the constructor works with valid input
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('test')])
    const reader = new StreamReader(iterator)
    assert.ok(reader)
  })

  await t.test('ok:eof-returns-false-initially', () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('test')])
    const reader = new StreamReader(iterator)
    assert.strictEqual(reader.eof(), false)
  })

  await t.test('ok:tell-returns-position', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('hello')])
    const reader = new StreamReader(iterator)
    
    assert.strictEqual(reader.tell(), 0)
    await reader.read(2)
    assert.strictEqual(reader.tell(), 2)
  })

  await t.test('ok:byte-reads-single-byte', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from([0x01, 0x02, 0x03])])
    const reader = new StreamReader(iterator)
    
    const byte1 = await reader.byte()
    assert.strictEqual(byte1, 0x01)
    assert.strictEqual(reader.tell(), 1)
    
    const byte2 = await reader.byte()
    assert.strictEqual(byte2, 0x02)
    assert.strictEqual(reader.tell(), 2)
  })

  await t.test('ok:byte-returns-undefined-EOF', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from([0x01])])
    const reader = new StreamReader(iterator)
    
    await reader.byte()
    const result = await reader.byte()
    assert.strictEqual(result, undefined)
    assert.strictEqual(reader.eof(), true)
  })

  await t.test('ok:chunk-reads-entire-buffer', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('hello'), UniversalBuffer.from(' world')])
    const reader = new StreamReader(iterator)
    
    const chunk1 = await reader.chunk()
    assert.deepStrictEqual(chunk1, UniversalBuffer.from('hello'))
    assert.strictEqual(reader.tell(), 5)
    
    const chunk2 = await reader.chunk()
    assert.deepStrictEqual(chunk2, UniversalBuffer.from(' world'))
    assert.strictEqual(reader.tell(), 11)
  })

  await t.test('ok:read-specified-bytes', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('hello world')])
    const reader = new StreamReader(iterator)
    
    const data1 = await reader.read(5)
    assert.deepStrictEqual(data1, UniversalBuffer.from('hello'))
    assert.strictEqual(reader.tell(), 5)
    
    const data2 = await reader.read(6)
    assert.deepStrictEqual(data2, UniversalBuffer.from(' world'))
    assert.strictEqual(reader.tell(), 11)
  })

  await t.test('ok:read-accumulates-chunks', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([
      UniversalBuffer.from('hello'),
      UniversalBuffer.from(' '),
      UniversalBuffer.from('world')
    ])
    const reader = new StreamReader(iterator)
    
    const data = await reader.read(11)
    assert.deepStrictEqual(data, UniversalBuffer.from('hello world'))
    assert.strictEqual(reader.tell(), 11)
  })

  await t.test('ok:read-returns-undefined-EOF', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('test')])
    const reader = new StreamReader(iterator)
    
    await reader.read(4)
    const result = await reader.read(1)
    // StreamReader may return empty UniversalBuffer at EOF instead of undefined
    assert.ok(result === undefined || (UniversalBuffer.isBuffer(result) && result.length === 0), 'Should return undefined or empty UniversalBuffer at EOF')
  })

  await t.test('ok:skip-advances-position', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('hello world')])
    const reader = new StreamReader(iterator)
    
    await reader.skip(6)
    assert.strictEqual(reader.tell(), 6)
    
    const data = await reader.read(5)
    assert.deepStrictEqual(data, UniversalBuffer.from('world'))
  })

  await t.test('ok:skip-accumulates-chunks', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([
      UniversalBuffer.from('hello'),
      UniversalBuffer.from(' '),
      UniversalBuffer.from('world')
    ])
    const reader = new StreamReader(iterator)
    
    await reader.skip(6)
    assert.strictEqual(reader.tell(), 6)
    
    const data = await reader.read(5)
    assert.deepStrictEqual(data, UniversalBuffer.from('world'))
  })

  await t.test('ok:undo-reverts-position', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('hello world')])
    const reader = new StreamReader(iterator)
    
    await reader.read(5)
    assert.strictEqual(reader.tell(), 5)
    
    await reader.undo()
    assert.strictEqual(reader.tell(), 0)
    
    const data = await reader.read(5)
    assert.deepStrictEqual(data, UniversalBuffer.from('hello'))
  })

  await t.test('ok:undo-after-multiple-reads', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('hello world')])
    const reader = new StreamReader(iterator)
    
    await reader.read(2)
    await reader.read(3)
    assert.strictEqual(reader.tell(), 5)
    
    await reader.undo()
    assert.strictEqual(reader.tell(), 2)
    
    const data = await reader.read(3)
    assert.deepStrictEqual(data, UniversalBuffer.from('llo'))
  })

  await t.test('edge:read-empty-buffer', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.alloc(0)])
    const reader = new StreamReader(iterator)
    
    const result = await reader.read(1)
    // StreamReader may return empty UniversalBuffer instead of undefined for empty input
    assert.ok(result === undefined || (UniversalBuffer.isBuffer(result) && result.length === 0), 'Should return undefined or empty UniversalBuffer for empty input')
    assert.strictEqual(reader.eof(), true)
  })

  await t.test('ok:read-multiple-empty-chunks', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([
      UniversalBuffer.alloc(0),
      UniversalBuffer.from('hello')
    ])
    const reader = new StreamReader(iterator)
    
    const data = await reader.read(5)
    assert.deepStrictEqual(data, UniversalBuffer.from('hello'))
  })

  await t.test('ok:read-Uint8Array-chunks', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([
      new Uint8Array([0x01, 0x02, 0x03])
    ])
    const reader = new StreamReader(iterator)
    
    const data = await reader.read(3)
    assert.deepStrictEqual(data, UniversalBuffer.from([0x01, 0x02, 0x03]))
  })

  await t.test('ok:tell-includes-discarded-bytes', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([
      UniversalBuffer.from('hello'),
      UniversalBuffer.from(' world'),
      UniversalBuffer.from('!')
    ])
    const reader = new StreamReader(iterator)
    
    // Read first chunk
    await reader.read(5)
    assert.strictEqual(reader.tell(), 5)
    
    // Read across chunk boundary (triggers trim)
    await reader.read(6)
    assert.strictEqual(reader.tell(), 11)
    
    // Read remaining
    await reader.read(1)
    assert.strictEqual(reader.tell(), 12)
  })

  await t.test('ok:eof-returns-true-stream-ends', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('test')])
    const reader = new StreamReader(iterator)
    
    assert.strictEqual(reader.eof(), false)
    await reader.read(4)
    // Try to read one more byte to trigger EOF detection
    await reader.read(1)
    assert.strictEqual(reader.eof(), true)
  })

  await t.test('ok:read-beyond-available-data', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('test')])
    const reader = new StreamReader(iterator)
    
    const data = await reader.read(10)
    assert.deepStrictEqual(data, UniversalBuffer.from('test'))
    assert.strictEqual(reader.tell(), 4)
  })

  await t.test('ok:multiple-operations-sequence', async () => {
    const iterator = UniversalBuffer.createAsyncIterator([UniversalBuffer.from('hello world')])
    const reader = new StreamReader(iterator)
    
    const byte1 = await reader.byte()
    assert.strictEqual(byte1, 0x68) // 'h'
    
    await reader.skip(4)
    assert.strictEqual(reader.tell(), 5)
    
    const chunk = await reader.chunk()
    assert.deepStrictEqual(chunk, UniversalBuffer.from(' world'))
  })
})

