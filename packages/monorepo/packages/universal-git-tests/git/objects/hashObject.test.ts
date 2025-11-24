import { test } from 'node:test'
import assert from 'node:assert'
import { hashObject } from '@awesome-os/universal-git-src/git/objects/hashObject.ts'
import { GitObject } from '@awesome-os/universal-git-src/models/GitObject.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('hashObject (git/objects)', async (t) => {
  await t.test('hashes content format', async () => {
    const result = await hashObject({
      type: 'blob',
      object: UniversalBuffer.from('test content'),
      format: 'content',
    })
    assert.ok(typeof result.oid === 'string')
    assert.strictEqual(result.oid.length, 40)
    assert.ok(UniversalBuffer.isBuffer(result.object))
  })

  await t.test('hashes wrapped format', async () => {
    // Test - lines 39-44: format === 'wrapped' branch
    const wrapped = GitObject.wrap({ type: 'blob', object: UniversalBuffer.from('test') })
    const result = await hashObject({
      type: 'blob',
      object: wrapped,
      format: 'wrapped',
    })
    assert.ok(typeof result.oid === 'string')
    assert.strictEqual(result.oid.length, 40)
    assert.ok(UniversalBuffer.isBuffer(result.object))
  })

  await t.test('hashes wrapped format with Uint8Array', async () => {
    // Test - lines 39-44: format === 'wrapped' with Uint8Array
    const wrapped = GitObject.wrap({ type: 'blob', object: UniversalBuffer.from('test') })
    const result = await hashObject({
      type: 'blob',
      object: new Uint8Array(wrapped),
      format: 'wrapped',
    })
    assert.ok(typeof result.oid === 'string')
    assert.strictEqual(result.oid.length, 40)
  })

  await t.test('throws error when deflated format without oid', async () => {
    // Test - lines 46-47, 49-50: format === 'deflated' requires oid
    let error: unknown = null
    try {
      await hashObject({
        type: 'blob',
        object: UniversalBuffer.from('deflated content'),
        format: 'deflated',
        // oid not provided
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Error)
    assert.ok((error as Error).message.includes('oid is required'))
  })

  await t.test('handles deflated format with oid provided', async () => {
    // Test - lines 46-47: format === 'deflated' with oid
    const oid = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
    const result = await hashObject({
      type: 'blob',
      object: UniversalBuffer.from('deflated'),
      format: 'deflated',
      oid,
    })
    assert.strictEqual(result.oid, oid)
    assert.ok(UniversalBuffer.isBuffer(result.object))
  })

  await t.test('hashes with SHA-256 format', async () => {
    const result = await hashObject({
      type: 'blob',
      object: UniversalBuffer.from('test'),
      format: 'content',
      objectFormat: 'sha256',
    })
    assert.ok(typeof result.oid === 'string')
    assert.strictEqual(result.oid.length, 64) // SHA-256 hash length
  })
})

