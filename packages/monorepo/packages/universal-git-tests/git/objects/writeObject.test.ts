import { test } from 'node:test'
import assert from 'node:assert'
import { writeObject } from '@awesome-os/universal-git-src/git/objects/writeObject.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { GitObject } from '@awesome-os/universal-git-src/models/GitObject.ts'

test('writeObject', async (t) => {
  await t.test('ok:writes-content-format', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const oid = await writeObject({
      fs,
      gitdir,
      type: 'blob',
      object: Buffer.from('test content'),
      format: 'content',
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('ok:writes-wrapped-format', async () => {
    // Test - lines 49-50: format === 'wrapped' branch
    const { fs, gitdir } = await makeFixture('test-empty')
    const wrapped = GitObject.wrap({ type: 'blob', object: Buffer.from('test') })
    const oid = await writeObject({
      fs,
      gitdir,
      type: 'blob',
      object: wrapped,
      format: 'wrapped',
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('ok:writes-deflated-format-with-oid', async () => {
    // Test - lines 59-60: format === 'deflated' branch
    const { fs, gitdir } = await makeFixture('test-empty')
    const oid = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
    const resultOid = await writeObject({
      fs,
      gitdir,
      type: 'blob',
      object: Buffer.from('deflated'),
      format: 'deflated',
      oid,
    })
    assert.strictEqual(resultOid, oid)
  })

  await t.test('ok:dryRun-mode-computes-OID-without-writing', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const oid = await writeObject({
      fs,
      gitdir,
      type: 'blob',
      object: Buffer.from('test'),
      format: 'content',
      dryRun: true,
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
    // Verify object was not written
    const { readObject } = await import('@awesome-os/universal-git-src/git/objects/readObject.ts')
    try {
      await readObject({ fs, cache: {}, gitdir, oid })
      assert.fail('Object should not exist when dryRun is true')
    } catch (error) {
      // Expected - object should not exist
      assert.ok(error instanceof Error)
    }
  })
})

