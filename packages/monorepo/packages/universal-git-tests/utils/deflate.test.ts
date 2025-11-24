import { test } from 'node:test'
import assert from 'node:assert'
import { deflate } from '@awesome-os/universal-git-src/utils/deflate.ts'

test('deflate', async (t) => {
  await t.test('ok:compresses-buffer', async () => {
    const input = Buffer.from('Hello, World! This is a test string that should compress well.')
    const result = await deflate(input)
    
    assert.ok(result instanceof Uint8Array)
    // Compression may not always make output smaller for short strings due to overhead
    // But for longer strings with repetition, it should compress
    assert.ok(result.length > 0)
    // Verify it's a valid deflated output (should be smaller or similar size for longer strings)
    assert.ok(result.length <= input.length * 1.1, 'Compressed output should not be much larger than input')
  })

  await t.test('edge:empty-buffer', async () => {
    const input = Buffer.alloc(0)
    const result = await deflate(input)
    
    assert.ok(result instanceof Uint8Array)
    assert.ok(result.length >= 0)
  })

  await t.test('ok:handles-Uint8Array-input', async () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    const result = await deflate(input)
    
    assert.ok(result instanceof Uint8Array)
    assert.ok(result.length > 0)
  })

  await t.test('ok:produces-consistent-results', async () => {
    const input = Buffer.from('test content')
    const result1 = await deflate(input)
    const result2 = await deflate(input)
    
    assert.deepStrictEqual(result1, result2)
  })

  await t.test('ok:handles-large-buffer', async () => {
    const input = Buffer.alloc(10000)
    input.fill('A')
    const result = await deflate(input)
    
    assert.ok(result instanceof Uint8Array)
    assert.ok(result.length < input.length) // Should compress well (repeated data)
  })

  await t.test('ok:handles-binary-data', async () => {
    const input = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD])
    const result = await deflate(input)
    
    assert.ok(result instanceof Uint8Array)
    assert.ok(result.length > 0)
  })

  await t.test('ok:handles-unicode-text', async () => {
    const input = Buffer.from('Hello 世界 🌍', 'utf8')
    const result = await deflate(input)
    
    assert.ok(result instanceof Uint8Array)
    assert.ok(result.length > 0)
  })

  await t.test('ok:produces-smaller-repetitive-data', async () => {
    const input = Buffer.alloc(1000)
    input.fill('A') // Highly repetitive
    const result = await deflate(input)
    
    // Repetitive data should compress well
    assert.ok(result.length < input.length)
    assert.ok(result.length < 100) // Should compress significantly
  })
})

