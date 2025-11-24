import { test } from 'node:test'
import assert from 'node:assert'
import { shasum } from '@awesome-os/universal-git-src/utils/shasum.ts'

test('shasum', async (t) => {
  await t.test('ok:calculates-SHA1-Buffer', async () => {
    const input = Buffer.from('test')
    const result = await shasum(input)
    // SHA-1 of 'test' is 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3'
    assert.strictEqual(result, 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3')
  })

  await t.test('ok:calculates-SHA1-Uint8Array', async () => {
    const input = new Uint8Array(Buffer.from('test'))
    const result = await shasum(input)
    assert.strictEqual(result, 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3')
  })

  await t.test('edge:calculates-SHA1-empty-buffer', async () => {
    const input = Buffer.from('')
    const result = await shasum(input)
    // SHA-1 of empty string is 'da39a3ee5e6b4b0d3255bfef95601890afd80709'
    assert.strictEqual(result, 'da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  await t.test('ok:calculates-SHA1-longer-string', async () => {
    const input = Buffer.from('Hello, World!')
    const result = await shasum(input)
    // SHA-1 of 'Hello, World!' is '0a0a9f2a6772942557ab5355d76af442f8f65e01'
    assert.strictEqual(result, '0a0a9f2a6772942557ab5355d76af442f8f65e01')
  })

  await t.test('ok:calculates-SHA1-binary-data', async () => {
    const input = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    const result = await shasum(input)
    // Verify it's a valid SHA-1 hash (40 hex characters)
    assert.strictEqual(result.length, 40)
    assert.ok(/^[0-9a-f]{40}$/i.test(result))
  })

  await t.test('ok:consistent-results-same-input', async () => {
    const input = Buffer.from('consistent test')
    const result1 = await shasum(input)
    const result2 = await shasum(input)
    assert.strictEqual(result1, result2)
  })

  await t.test('ok:different-results-different-inputs', async () => {
    const input1 = Buffer.from('test1')
    const input2 = Buffer.from('test2')
    const result1 = await shasum(input1)
    const result2 = await shasum(input2)
    assert.notStrictEqual(result1, result2)
  })

  await t.test('ok:handles-unicode-strings', async () => {
    const input = Buffer.from('测试', 'utf8')
    const result = await shasum(input)
    assert.strictEqual(result.length, 40)
    assert.ok(/^[0-9a-f]{40}$/i.test(result))
  })
})

