import { test } from 'node:test'
import assert from 'node:assert'
import { read, write } from '@awesome-os/universal-git-src/git/objects/loose.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { GitObject } from '@awesome-os/universal-git-src/models/GitObject.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('loose.read', async (t) => {
  await t.test('ok:returns-null-when-object-does-not-exist', async () => {
    // Test - lines 57-58: catch block when file doesn't exist
    const { fs, gitdir } = await makeFixture('test-empty')
    const result = await read({ fs, gitdir, oid: '0000000000000000000000000000000000000000' })
    assert.strictEqual(result, null)
  })

  await t.test('ok:reads-deflated-format', async () => {
    const { fs, gitdir } = await makeFixture('test-readObject')
    const oid = 'e10ebb90d03eaacca84de1af0a59b444232da99e'
    const result = await read({ fs, gitdir, oid, format: 'deflated' })
    assert.ok(result)
    assert.strictEqual(result.format, 'deflated')
    assert.ok(UniversalBuffer.isBuffer(result.object))
  })

  await t.test('ok:reads-wrapped-format', async () => {
    const { fs, gitdir } = await makeFixture('test-readObject')
    const oid = 'e10ebb90d03eaacca84de1af0a59b444232da99e'
    const result = await read({ fs, gitdir, oid, format: 'wrapped' })
    assert.ok(result)
    assert.strictEqual(result.format, 'wrapped')
    assert.ok(UniversalBuffer.isBuffer(result.object))
  })
})

test('loose.write', async (t) => {
  await t.test('ok:writes-content-format', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const oid = await write({
      fs,
      gitdir,
      type: 'blob',
      content: Buffer.from('test content'),
      format: 'content',
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('ok:writes-wrapped-format', async () => {
    // Test - lines 88-89, 91-94: format === 'wrapped' branch
    const { fs, gitdir } = await makeFixture('test-empty')
    const wrapped = GitObject.wrap({ type: 'blob', object: Buffer.from('test') })
    const oid = await write({
      fs,
      gitdir,
      type: 'blob',
      content: wrapped,
      format: 'wrapped',
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('error:throws-error-when-deflated-format-without-oid', async () => {
    // Test - lines 98-99: throw InternalError when deflated format but no oid
    const { fs, gitdir } = await makeFixture('test-empty')
    let error: unknown = null
    try {
      await write({
        fs,
        gitdir,
        type: 'blob',
        content: Buffer.from('deflated'),
        format: 'deflated',
        // oid not provided
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    const { InternalError } = await import('@awesome-os/universal-git-src/errors/InternalError.ts')
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('OID is required'))
  })

  await t.test('ok:writes-deflated-format-with-oid', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const oid = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
    const resultOid = await write({
      fs,
      gitdir,
      type: 'blob',
      content: Buffer.from('deflated'),
      format: 'deflated',
      oid,
    })
    assert.strictEqual(resultOid, oid)
  })

  await t.test('ok:deflates-wrapped-object-when-writing', async () => {
    // Test - lines 110-111: deflate wrapped object
    const { fs, gitdir } = await makeFixture('test-empty')
    const wrapped = GitObject.wrap({ type: 'blob', object: Buffer.from('test') })
    const oid = await write({
      fs,
      gitdir,
      type: 'blob',
      content: wrapped,
      format: 'wrapped',
    })
    // Verify object was written and can be read back
    const readResult = await read({ fs, gitdir, oid, format: 'deflated' })
    assert.ok(readResult)
  })

  await t.test('ok:does-not-overwrite-existing-object', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const oid1 = await write({
      fs,
      gitdir,
      type: 'blob',
      content: Buffer.from('test'),
      format: 'content',
    })
    // Write again with same content - should return same OID
    const oid2 = await write({
      fs,
      gitdir,
      type: 'blob',
      content: Buffer.from('test'),
      format: 'content',
    })
    assert.strictEqual(oid1, oid2)
  })
})

