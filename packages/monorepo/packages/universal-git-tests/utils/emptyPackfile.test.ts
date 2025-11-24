import { test } from 'node:test'
import assert from 'node:assert'
import { emptyPackfile } from '@awesome-os/universal-git-src/utils/emptyPackfile.ts'

test('emptyPackfile', async (t) => {
  await t.test('ok:returns-true-empty-packfile', () => {
    // Empty packfile header: PACK + version (00000002) + object count (00000000)
    // Hex: 5041434b 00000002 00000000
    const emptyPack = Buffer.from([0x50, 0x41, 0x43, 0x4b, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00])
    const result = emptyPackfile(emptyPack)
    assert.strictEqual(result, true)
  })

  await t.test('ok:returns-false-packfile-with-objects', () => {
    // Packfile with objects: PACK + version (00000002) + object count (00000001)
    const packWithObjects = Buffer.from([0x50, 0x41, 0x43, 0x4b, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01])
    const result = emptyPackfile(packWithObjects)
    assert.strictEqual(result, false)
  })

  await t.test('error:invalid-packfile-header', () => {
    const invalidPack = Buffer.from([0x49, 0x4e, 0x56, 0x41, 0x4c, 0x49, 0x44, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00])
    const result = emptyPackfile(invalidPack)
    assert.strictEqual(result, false)
  })

  await t.test('error:wrong-version', () => {
    // Wrong version: PACK + version (00000001) + object count (00000000)
    const wrongVersion = Buffer.from([0x50, 0x41, 0x43, 0x4b, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])
    const result = emptyPackfile(wrongVersion)
    assert.strictEqual(result, false)
  })

  await t.test('ok:handles-Uint8Array-input', () => {
    const emptyPack = new Uint8Array([0x50, 0x41, 0x43, 0x4b, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00])
    const result = emptyPackfile(emptyPack)
    assert.strictEqual(result, true)
  })

  await t.test('ok:handles-multiple-objects', () => {
    const packWithMultiple = Buffer.from([0x50, 0x41, 0x43, 0x4b, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x05])
    const result = emptyPackfile(packWithMultiple)
    assert.strictEqual(result, false)
  })

  await t.test('edge:very-small-buffer', () => {
    const smallBuffer = Buffer.from([0x50, 0x41, 0x43, 0x4b])
    const result = emptyPackfile(smallBuffer)
    // Should check first 12 bytes, so small buffer should not match
    assert.strictEqual(result, false)
  })
})

