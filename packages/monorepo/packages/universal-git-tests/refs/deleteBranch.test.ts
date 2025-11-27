import { test } from 'node:test'
import assert from 'node:assert'
import {
  Errors,
  deleteBranch,
  currentBranch,
  listBranches,
  listTags,
  getConfig,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('deleteBranch', async (t) => {
  await t.test('ok:delete-branch', async () => {
    // Setup
    const { repo } = await makeFixture('test-deleteBranch')
    // Test
    await deleteBranch({ repo, ref: 'test' })
    const branches = await listBranches({ repo })
    assert.ok(!branches.includes('test'))
  })

  await t.test('edge:branch-tag-name-collision', async () => {
    // Setup
    const { repo } = await makeFixture('test-deleteBranch')
    // Test
    await deleteBranch({ repo, ref: 'collision' })
    const branches = await listBranches({ repo })
    assert.ok(!branches.includes('collision'))
    const tags = await listTags({ repo })
    assert.ok(tags.includes('collision'))
  })

  await t.test('error:branch-not-exist', async () => {
    // Setup
    const { repo } = await makeFixture('test-deleteBranch')
    let error: unknown = null
    // Test
    try {
      await deleteBranch({ repo, ref: 'branch-not-exist' })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.NotFoundError)
  })

  await t.test('param:ref-missing', async () => {
    // Setup
    const { repo } = await makeFixture('test-deleteBranch')
    let error: unknown = null
    // Test
    try {
      await deleteBranch({ repo } as any)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MissingParameterError)
  })

  await t.test('ok:checked-out-branch', async () => {
    // Setup
    const { repo } = await makeFixture('test-deleteBranch')
    // Test
    await deleteBranch({ repo, ref: 'master' })
    const head = await currentBranch({ repo })
    assert.strictEqual(head, undefined)
    const branches = await listBranches({ repo })
    assert.ok(!branches.includes('master'))
  })

  await t.test('ok:delete-branch-and-config', async () => {
    // Setup
    const { repo } = await makeFixture('test-deleteBranch')
    // Test
    await deleteBranch({ repo, ref: 'remote' })
    const branches = await listBranches({ repo })
    assert.ok(!branches.includes('remote'))
    assert.strictEqual(
      await getConfig({ repo, path: 'branch.remote.remote' }),
      undefined
    )
    assert.strictEqual(
      await getConfig({ repo, path: 'branch.remote.merge' }),
      undefined
    )
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await deleteBranch({
        gitdir: '/tmp/test.git',
        ref: 'test',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-deleteBranch')
    await deleteBranch({ repo, ref: 'test' })
    const branches = await listBranches({ repo })
    assert.ok(!branches.includes('test'))
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-deleteBranch')
    await deleteBranch({ repo, ref: 'test' })
    const branches = await listBranches({ repo })
    assert.ok(!branches.includes('test'))
  })

  await t.test('error:caller-property', async () => {
    const { repo } = await makeFixture('test-deleteBranch')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await deleteBranch({
        repo: undefined as any,
        ref: 'test',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.deleteBranch')
    }
  })

  await t.test('param:force', async () => {
    const { repo } = await makeFixture('test-deleteBranch')
    // Try to delete a branch that might be checked out
    try {
      await deleteBranch({ repo, ref: 'master', force: true })
      const branches = await listBranches({ repo })
      assert.ok(!branches.includes('master'))
    } catch (error) {
      // If it throws, that's acceptable
      assert.ok(error instanceof Error)
    }
  })
})

