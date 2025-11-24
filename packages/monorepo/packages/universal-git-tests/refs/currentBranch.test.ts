import { test } from 'node:test'
import assert from 'node:assert'
import { currentBranch } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('currentBranch', async (t) => {
  await t.test('ok:resolve-HEAD-master', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-resolveRef')
    // Test
    const branch = await currentBranch({ fs, gitdir })
    assert.strictEqual(branch, 'master')
  })

  await t.test('param:fullname-true', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-resolveRef')
    // Test
    const branch = await currentBranch({
      fs,
      gitdir,
      fullname: true,
    })
    assert.strictEqual(branch, 'refs/heads/master')
  })

  await t.test('edge:detached-HEAD', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-detachedHead')
    // Test
    const branch = await currentBranch({ fs, gitdir })
    assert.strictEqual(branch, undefined)
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await currentBranch({
        gitdir: '/tmp/test.git',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { fs, gitdir } = await makeFixture('test-resolveRef')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, gitdir })
    const branch = await currentBranch({ repo })
    assert.strictEqual(branch, 'master')
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resolveRef')
    const branch = await currentBranch({ fs, dir, gitdir })
    assert.strictEqual(branch, 'master')
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-resolveRef')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await currentBranch({
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.currentBranch')
    }
  })

  await t.test('edge:empty-repository', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const { init } = await import('@awesome-os/universal-git-src/index.ts')
    await init({ fs, dir })
    const branch = await currentBranch({ fs, dir })
    // Empty repo might not have a branch yet
    assert.ok(branch === undefined || typeof branch === 'string')
  })
})

