import { test } from 'node:test'
import assert from 'node:assert'
import { encode, flush, delim, decodeStream } from '@awesome-os/universal-git-src/core-utils/network/PktLine.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

// Helper to create async iterable from buffers
async function* createStream(buffers: UniversalBuffer[]): AsyncIterable<UniversalBuffer> {
  for (const buffer of buffers) {
    yield buffer
  }
}

test('PktLine', async (t) => {
  await t.test('encode - string payload', () => {
    const result = encode('hello\n')
    // Length: 6 bytes + 4 bytes header = 10 bytes = 0x000a
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, 10)
    assert.strictEqual(result.toString('utf8', 0, 4), '000a')
    assert.strictEqual(result.toString('utf8', 4), 'hello\n')
  })

  await t.test('encode - Buffer payload', () => {
    const payload = UniversalBuffer.from('test content', 'utf8')
    const result = encode(payload)
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, payload.length + 4)
    assert.strictEqual(result.toString('utf8', 4), 'test content')
  })

  await t.test('encode - Uint8Array payload', () => {
    const payload = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
    const result = encode(payload)
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, payload.length + 4)
    assert.strictEqual(result[4], 0x48)
    assert.strictEqual(result[5], 0x65)
  })

  await t.test('encode - empty payload', () => {
    const result = encode('')
    // Length: 0 bytes + 4 bytes header = 4 bytes = 0x0004
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, 4)
    assert.strictEqual(result.toString('utf8'), '0004')
  })

  await t.test('encode - binary payload', () => {
    const payload = UniversalBuffer.from([0x00, 0x01, 0x02, 0xff, 0xfe])
    const result = encode(payload)
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, payload.length + 4)
    assert.strictEqual(result[4], 0x00)
    assert.strictEqual(result[5], 0x01)
    assert.strictEqual(result[6], 0x02)
    assert.strictEqual(result[7], 0xff)
    assert.strictEqual(result[8], 0xfe)
  })

  await t.test('flush - returns flush packet', () => {
    const result = flush()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, 4)
    assert.strictEqual(result.toString('utf8'), '0000')
  })

  await t.test('delim - returns delim packet', () => {
    const result = delim()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, 4)
    assert.strictEqual(result.toString('utf8'), '0001')
  })

  await t.test('decodeStream - single pkt-line', async () => {
    const encoded = encode('hello\n')
    const stream = createStream([encoded])
    const read = decodeStream(stream)
    
    const result = await read()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.toString('utf8'), 'hello\n')
    
    const eof = await read()
    assert.strictEqual(eof, true) // EOF
  })

  await t.test('decodeStream - multiple pkt-lines', async () => {
    const line1 = encode('first\n')
    const line2 = encode('second\n')
    const stream = createStream([line1, line2])
    const read = decodeStream(stream)
    
    const result1 = await read()
    assert.ok(result1 instanceof UniversalBuffer)
    assert.strictEqual(result1.toString('utf8'), 'first\n')
    
    const result2 = await read()
    assert.ok(result2 instanceof UniversalBuffer)
    assert.strictEqual(result2.toString('utf8'), 'second\n')
    
    const eof = await read()
    assert.strictEqual(eof, true) // EOF
  })

  await t.test('decodeStream - flush packet', async () => {
    const line = encode('data\n')
    const flushPkt = flush()
    const stream = createStream([line, flushPkt])
    const read = decodeStream(stream)
    
    const result = await read()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.toString('utf8'), 'data\n')
    
    const flushResult = await read()
    assert.strictEqual(flushResult, null) // flush-pkt returns null
    
    const eof = await read()
    assert.strictEqual(eof, true) // EOF
  })

  await t.test('decodeStream - delim packet', async () => {
    const line = encode('data\n')
    const delimPkt = delim()
    const stream = createStream([line, delimPkt])
    const read = decodeStream(stream)
    
    const result = await read()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.toString('utf8'), 'data\n')
    
    const delimResult = await read()
    assert.strictEqual(delimResult, null) // delim-pkt returns null
    
    const eof = await read()
    assert.strictEqual(eof, true) // EOF
  })

  await t.test('decodeStream - empty pkt-line', async () => {
    const empty = encode('')
    const stream = createStream([empty])
    const read = decodeStream(stream)
    
    const result = await read()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, 0)
    
    const eof = await read()
    assert.strictEqual(eof, true) // EOF
  })

  await t.test('decodeStream - binary data', async () => {
    const binary = UniversalBuffer.from([0x00, 0x01, 0x02, 0xff, 0xfe])
    const encoded = encode(binary)
    const stream = createStream([encoded])
    const read = decodeStream(stream)
    
    const result = await read()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, 5)
    assert.strictEqual(result[0], 0x00)
    assert.strictEqual(result[1], 0x01)
    assert.strictEqual(result[4], 0xfe)
  })

  await t.test('decodeStream - large payload', async () => {
    // Create a payload close to max size (65516 bytes)
    const largePayload = UniversalBuffer.alloc(1000, 'a')
    const encoded = encode(largePayload)
    const stream = createStream([encoded])
    const read = decodeStream(stream)
    
    const result = await read()
    assert.ok(result instanceof UniversalBuffer)
    assert.strictEqual(result.length, 1000)
    assert.strictEqual(result[0], 'a'.charCodeAt(0))
    assert.strictEqual(result[999], 'a'.charCodeAt(0))
  })

  await t.test('decodeStream - multiple flush packets', async () => {
    const line1 = encode('first\n')
    const flush1 = flush()
    const line2 = encode('second\n')
    const flush2 = flush()
    const stream = createStream([line1, flush1, line2, flush2])
    const read = decodeStream(stream)
    
    const result1 = await read()
    assert.ok(result1 instanceof UniversalBuffer)
    assert.strictEqual(result1.toString('utf8'), 'first\n')
    
    const flushResult1 = await read()
    assert.strictEqual(flushResult1, null)
    
    const result2 = await read()
    assert.ok(result2 instanceof UniversalBuffer)
    assert.strictEqual(result2.toString('utf8'), 'second\n')
    
    const flushResult2 = await read()
    assert.strictEqual(flushResult2, null)
    
    const eof = await read()
    assert.strictEqual(eof, true)
  })

  await t.test('decodeStream - mixed data and control packets', async () => {
    const line1 = encode('data1\n')
    const flushPkt = flush()
    const line2 = encode('data2\n')
    const delimPkt = delim()
    const line3 = encode('data3\n')
    const stream = createStream([line1, flushPkt, line2, delimPkt, line3])
    const read = decodeStream(stream)
    
    const result1 = await read()
    assert.strictEqual(result1?.toString('utf8'), 'data1\n')
    
    const flushResult = await read()
    assert.strictEqual(flushResult, null)
    
    const result2 = await read()
    assert.strictEqual(result2?.toString('utf8'), 'data2\n')
    
    const delimResult = await read()
    assert.strictEqual(delimResult, null)
    
    const result3 = await read()
    assert.strictEqual(result3?.toString('utf8'), 'data3\n')
    
    const eof = await read()
    assert.strictEqual(eof, true)
  })

  await t.test('decodeStream - handles stream errors gracefully', async () => {
    // Create a stream that will error
    const errorStream = (async function* () {
      yield encode('data\n')
      throw new Error('Stream error')
    })()
    
    const read = decodeStream(errorStream)
    
    // First read should succeed
    const result = await read()
    assert.ok(result instanceof UniversalBuffer)
    
    // Next read should return true (EOF) due to error
    const eof = await read()
    assert.strictEqual(eof, true)
  })

  await t.test('encode and decode roundtrip', async () => {
    const original = 'test content with\nnewlines and\tspecial chars'
    const encoded = encode(original)
    const stream = createStream([encoded])
    const read = decodeStream(stream)
    
    const decoded = await read()
    assert.ok(decoded instanceof UniversalBuffer)
    assert.strictEqual(decoded.toString('utf8'), original)
  })

  await t.test('encode and decode binary roundtrip', async () => {
    const original = UniversalBuffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd])
    const encoded = encode(original)
    const stream = createStream([encoded])
    const read = decodeStream(stream)
    
    const decoded = await read()
    assert.ok(decoded instanceof UniversalBuffer)
    assert.strictEqual(decoded.length, original.length)
    for (let i = 0; i < original.length; i++) {
      assert.strictEqual(decoded[i], original[i])
    }
  })
})

