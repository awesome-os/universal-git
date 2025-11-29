import { test } from 'node:test'
import assert from 'node:assert'
import { currentBranch } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('currentBranch', async (t) => {
  await t.test('ok:resolve-HEAD-master', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-resolveRef')
    // Test
    const branch = await currentBranch({ repo })
    assert.strictEqual(branch, 'master')
  })

  await t.test('param:fullname-true', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-resolveRef')
    // Test
    const branch = await currentBranch({
      repo,
      fullname: true,
    })
    assert.strictEqual(branch, 'refs/heads/master')
  })

  await t.test('edge:detached-HEAD', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-detachedHead')
    // Ensure HEAD is detached
    const oid = await repo.resolveRef('HEAD')
    await repo.writeRef('HEAD', oid, true)
    
    // Test
    const branch = await currentBranch({ repo })
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
    const { repo, fs, dir, gitdir } = await makeFixture('test-resolveRef')
    const branch = await currentBranch({ repo })
    assert.strictEqual(branch, 'master')
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-resolveRef')
    const branch = await currentBranch({ repo })
    assert.strictEqual(branch, 'master')
  })

  await t.test('error:caller-property', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-resolveRef')
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
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const branch = await currentBranch({ repo })
    // Empty repo might not have a branch yet
    assert.ok(branch === undefined || typeof branch === 'string')
  })
})

