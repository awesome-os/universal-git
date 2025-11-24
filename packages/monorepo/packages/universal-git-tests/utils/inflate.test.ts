import { test } from 'node:test'
import assert from 'node:assert'
import { inflate } from '@awesome-os/universal-git-src/utils/inflate.ts'
import { deflate } from '@awesome-os/universal-git-src/utils/deflate.ts'

test('inflate', async (t) => {
  await t.test('ok:decompresses-deflated-data', async () => {
    const original = Buffer.from('Hello, World!')
    const compressed = await deflate(original)
    const decompressed = await inflate(compressed)
    
    assert.deepStrictEqual(Buffer.from(decompressed), original)
  })

  await t.test('edge:empty-buffer', async () => {
    const compressed = await deflate(Buffer.alloc(0))
    const result = await inflate(compressed)
    
    assert.ok(result instanceof Uint8Array)
    assert.strictEqual(result.length, 0)
  })

  await t.test('ok:handles-Uint8Array-input', async () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    const compressed = await deflate(original)
    const result = await inflate(compressed)
    
    assert.deepStrictEqual(result, original)
  })

  await t.test('ok:round-trip-large-data', async () => {
    const original = Buffer.alloc(10000)
    original.fill('A')
    const compressed = await deflate(original)
    const decompressed = await inflate(compressed)
    
    assert.deepStrictEqual(Buffer.from(decompressed), original)
  })

  await t.test('ok:round-trip-binary-data', async () => {
    const original = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD])
    const compressed = await deflate(original)
    const decompressed = await inflate(compressed)
    
    assert.deepStrictEqual(Buffer.from(decompressed), original)
  })

  await t.test('ok:round-trip-unicode-text', async () => {
    const original = Buffer.from('Hello 世界 🌍', 'utf8')
    const compressed = await deflate(original)
    const decompressed = await inflate(compressed)
    
    assert.deepStrictEqual(Buffer.from(decompressed), original)
  })

  await t.test('ok:round-trip-mixed-content', async () => {
    const original = Buffer.from('Test\nLine 2\n\tIndented\nBinary: \x00\x01\x02')
    const compressed = await deflate(original)
    const decompressed = await inflate(compressed)
    
    assert.deepStrictEqual(Buffer.from(decompressed), original)
  })

  await t.test('ok:handles-Buffer-input', async () => {
    const original = Buffer.from('test')
    const compressed = await deflate(original)
    const result = await inflate(Buffer.from(compressed))
    
    assert.deepStrictEqual(Buffer.from(result), original)
  })

  await t.test('ok:produces-consistent-results', async () => {
    const compressed = await deflate(Buffer.from('test'))
    const result1 = await inflate(compressed)
    const result2 = await inflate(compressed)
    
    assert.deepStrictEqual(result1, result2)
  })

  await t.test('ok:handles-compressible-data', async () => {
    const original = Buffer.alloc(1000)
    original.fill('A')
    const compressed = await deflate(original)
    const decompressed = await inflate(compressed)
    
    assert.deepStrictEqual(Buffer.from(decompressed), original)
  })
})

