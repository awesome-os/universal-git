import { test } from 'node:test'
import assert from 'node:assert'
import { Errors, tag, resolveRef } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { verifyReflogEntry } from '@awesome-os/universal-git-test-helpers/helpers/reflogHelpers.ts'

test('tag', async (t) => {
  await t.test('ok:creates-lightweight-tag', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-tag')
    const headOid = await resolveRef({ repo, ref: 'HEAD' })
    // Test
    await tag({ repo, ref: 'latest' })
    const ref = await resolveRef({ repo, ref: 'refs/tags/latest' })
    assert.strictEqual(ref, 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69')
    
    // Note: Tags don't typically create reflog entries unless core.logAllRefUpdates is set to 'always'
    // Reflog verification for tags is optional and depends on Git configuration
  })

  await t.test('error:tag-already-exists', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-tag')
    // Test
    let error = null
    try {
      await tag({ repo, ref: 'existing-tag' })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.AlreadyExistsError)
  })

  await t.test('error:tag-already-exists-packed', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-tag')
    // Test
    let error = null
    try {
      await tag({ repo, ref: 'packed-tag' })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.AlreadyExistsError)
  })

  await t.test('param:force', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-tag')
    // Test
    let error = null
    try {
      await tag({ repo, ref: 'existing-tag', force: true })
    } catch (err) {
      error = err
    }
    assert.strictEqual(error, null)
  })

  await t.test('param:force-packed', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-tag')
    // Test
    let error = null
    try {
      await tag({ repo, ref: 'packed-tag', force: true })
    } catch (err) {
      error = err
    }
    assert.strictEqual(error, null)
  })
})

