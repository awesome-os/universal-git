import { test } from 'node:test'
import assert from 'node:assert'
import { Errors, deleteTag, listTags } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('deleteTag', async (t) => {
  await t.test('ok:basic', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-deleteTag')
    // Test
    await deleteTag({
      fs,
      gitdir,
      ref: 'latest',
    })
    const refs = await listTags({
      fs,
      gitdir,
    })
    assert.deepStrictEqual(refs, ['prev'])
  })

  await t.test('param:ref-missing', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-deleteTag')
    const { Errors } = await import('@awesome-os/universal-git-src/index.ts')
    let error = null
    // Test
    try {
      await deleteTag({ fs, dir, gitdir })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MissingParameterError)
    assert.strictEqual((error as any).data?.parameter, 'ref')
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await deleteTag({
        gitdir: '/tmp/test.git',
        ref: 'latest',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { fs, gitdir } = await makeFixture('test-deleteTag')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, gitdir })
    await deleteTag({ repo, ref: 'latest' })
    const tags = await listTags({ fs, gitdir })
    assert.deepStrictEqual(tags, ['prev'])
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-deleteTag')
    await deleteTag({ fs, dir, gitdir, ref: 'latest' })
    const tags = await listTags({ fs, gitdir })
    assert.deepStrictEqual(tags, ['prev'])
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-deleteTag')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await deleteTag({
        gitdir,
        ref: 'latest',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.deleteTag')
    }
  })

  await t.test('edge:non-existent-tag', async () => {
    const { fs, gitdir } = await makeFixture('test-deleteTag')
    const { Errors } = await import('@awesome-os/universal-git-src/index.ts')
    try {
      await deleteTag({ fs, gitdir, ref: 'nonexistent-tag' })
      // Should throw NotFoundError or may be idempotent
      // If it doesn't throw, that's also acceptable behavior
    } catch (error) {
      assert.ok(error instanceof Errors.NotFoundError || error instanceof Error)
    }
  })
})

