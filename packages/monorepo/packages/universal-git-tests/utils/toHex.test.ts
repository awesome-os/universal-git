import { test } from 'node:test'
import assert from 'node:assert'
import { toHex } from '@awesome-os/universal-git-src/utils/toHex.ts'

test('toHex', async (t) => {
  await t.test('ok:converts-Buffer-to-hex', () => {
    const buffer = Buffer.from([0x00, 0xFF, 0x0A, 0x1F])
    const result = toHex(buffer)
    assert.strictEqual(result, '00ff0a1f')
  })

  await t.test('ok:pads-single-digit-bytes', () => {
    const buffer = Buffer.from([0x0, 0x1, 0xA, 0xF])
    const result = toHex(buffer)
    assert.strictEqual(result, '00010a0f')
  })

  await t.test('edge:empty-buffer', () => {
    const buffer = Buffer.from([])
    const result = toHex(buffer)
    assert.strictEqual(result, '')
  })

  await t.test('ok:handles-Uint8Array', () => {
    const array = new Uint8Array([0x42, 0xAB, 0xCD])
    const result = toHex(array)
    assert.strictEqual(result, '42abcd')
  })

  await t.test('ok:handles-ArrayBuffer', () => {
    const arrayBuffer = new ArrayBuffer(3)
    const view = new Uint8Array(arrayBuffer)
    view[0] = 0x12
    view[1] = 0x34
    view[2] = 0x56
    const result = toHex(arrayBuffer)
    assert.strictEqual(result, '123456')
  })

  await t.test('ok:handles-all-byte-values', () => {
    const buffer = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
    const result = toHex(buffer)
    assert.strictEqual(result.length, 512) // 256 bytes * 2 hex chars
    assert.strictEqual(result.substring(0, 2), '00') // byte 0
    assert.strictEqual(result.substring(254 * 2, 254 * 2 + 2), 'fe') // byte 254 (0xFE)
    assert.strictEqual(result.substring(255 * 2, 255 * 2 + 2), 'ff') // byte 255 (0xFF)
  })

  await t.test('ok:produces-lowercase-hex', () => {
    const buffer = Buffer.from([0xAB, 0xCD, 0xEF])
    const result = toHex(buffer)
    assert.strictEqual(result, 'abcdef')
    assert.strictEqual(result, result.toLowerCase())
  })
})

