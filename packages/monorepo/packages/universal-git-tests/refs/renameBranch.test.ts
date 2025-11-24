import { test } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { Errors, renameBranch, currentBranch } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('renameBranch', async (t) => {
  await t.test('error:branch-already-exists', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    let error = null
    // Test
    try {
      await renameBranch({
        fs,
        dir,
        gitdir,
        oldref: 'test-branch',
        ref: 'existing-branch',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.AlreadyExistsError)
  })

  await t.test('error:invalid-new-branch-name', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    let error = null
    // Test
    try {
      await renameBranch({
        fs,
        dir,
        gitdir,
        oldref: 'test-branch',
        ref: 'inv@{id..branch.lock',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.InvalidRefNameError)
  })

  await t.test('error:invalid-old-branch-name', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    let error = null
    // Test
    try {
      await renameBranch({
        fs,
        dir,
        gitdir,
        ref: 'other-branch',
        oldref: 'inv@{id..branch.lock',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.InvalidRefNameError)
  })

  await t.test('param:ref-missing', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    let error = null
    // Test
    try {
      await renameBranch({ fs, dir, gitdir, oldref: 'test-branch' })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MissingParameterError)
  })

  await t.test('param:oldref-missing', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    let error = null
    // Test
    try {
      await renameBranch({ fs, dir, gitdir, ref: 'other-branch' })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MissingParameterError)
  })

  await t.test('ok:rename-branch', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    // Test
    await renameBranch({
      fs,
      dir,
      gitdir,
      oldref: 'test-branch',
      ref: 'other-branch',
    })
    const files = await fs.readdir(path.resolve(gitdir, 'refs', 'heads'))
    assert.strictEqual(files.includes('test-branch'), false)
    assert.strictEqual(await currentBranch({ fs, dir, gitdir }), 'master')
  })

  await t.test('param:checkout-true', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    // Test
    await renameBranch({
      fs,
      dir,
      gitdir,
      oldref: 'test-branch-2',
      ref: 'other-branch-2',
      checkout: true,
    })
    assert.strictEqual(await currentBranch({ fs, dir, gitdir }), 'other-branch-2')
  })

  await t.test('ok:rename-current-branch', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    // Test
    await renameBranch({
      fs,
      dir,
      gitdir,
      oldref: 'master',
      ref: 'other-branch',
    })
    assert.strictEqual(await currentBranch({ fs, dir, gitdir }), 'other-branch')

    await renameBranch({
      fs,
      dir,
      gitdir,
      oldref: 'other-branch',
      ref: 'master',
    })
    assert.strictEqual(await currentBranch({ fs, dir, gitdir }), 'master')
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await renameBranch({
        gitdir: '/tmp/test.git',
        oldref: 'test-branch',
        ref: 'new-branch',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir })
    await renameBranch({
      repo,
      oldref: 'test-branch',
      ref: 'renamed-branch',
    })
    const branch = await currentBranch({ fs, dir, gitdir })
    assert.strictEqual(branch, 'master')
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    await renameBranch({
      fs,
      dir,
      gitdir,
      oldref: 'test-branch',
      ref: 'renamed-branch-2',
    })
    const branch = await currentBranch({ fs, dir, gitdir })
    assert.strictEqual(branch, 'master')
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-renameBranch')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await renameBranch({
        gitdir,
        oldref: 'test-branch',
        ref: 'new-branch',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.renameBranch')
    }
  })

  await t.test('error:old-branch-not-exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-renameBranch')
    const { NotFoundError } = await import('@awesome-os/universal-git-src/errors/NotFoundError.ts')
    try {
      await renameBranch({
        fs,
        dir,
        gitdir,
        oldref: 'nonexistent-branch',
        ref: 'new-branch',
      })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError)
    }
  })
})

