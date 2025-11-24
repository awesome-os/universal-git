import { test } from 'node:test'
import assert from 'node:assert'
import { padHex } from '@awesome-os/universal-git-src/utils/padHex.ts'

test('padHex', async (t) => {
  await t.test('ok:pads-number-to-width', () => {
    const result = padHex(4, 0x1)
    assert.strictEqual(result, '0001')
  })

  await t.test('edge:zero', () => {
    const result = padHex(2, 0)
    assert.strictEqual(result, '00')
  })

  await t.test('ok:number-fits-width', () => {
    const result = padHex(2, 0xFF)
    // 0xFF = 'ff' (2 chars), so b - s.length = 2 - 2 = 0, no padding
    assert.strictEqual(result, 'ff')
  })

  await t.test('error:number-larger-than-width', () => {
    // When number is larger than width, b - s.length becomes negative
    // '0'.repeat(-1) throws RangeError, so this is expected behavior
    assert.throws(() => {
      padHex(2, 0x1FF)
    }, /Invalid count value/)
  })

  await t.test('ok:single-digit-padding', () => {
    const result = padHex(1, 0x5)
    assert.strictEqual(result, '5')
  })

  await t.test('ok:large-width', () => {
    const result = padHex(8, 0x42)
    assert.strictEqual(result, '00000042')
  })

  await t.test('ok:produces-lowercase-hex', () => {
    const result = padHex(4, 0xABCD)
    assert.strictEqual(result, 'abcd')
    assert.strictEqual(result, result.toLowerCase())
  })

  await t.test('edge:edge-cases', () => {
    // Width 0 would cause '0'.repeat(-1) which throws, so skip that
    assert.strictEqual(padHex(1, 0x0), '0')
    assert.strictEqual(padHex(3, 0xABC), 'abc')
  })
})

