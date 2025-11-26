import { test } from 'node:test'
import assert from 'node:assert'
import { writeRef, resolveRef, currentBranch } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('writeRef', async (t) => {
  await t.test('ok:write-tag', async () => {
    // Setup
    const { repo } = await makeFixture('test-writeRef')
    // Test
    await writeRef({
      repo,
      ref: 'refs/tags/latest',
      value: 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69',
    })
    const ref = await resolveRef({ repo, ref: 'refs/tags/latest' })
    assert.strictEqual(ref, 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69')
  })

  await t.test('behavior:set-current-branch', async () => {
    // Setup
    const { repo } = await makeFixture('test-writeRef')
    // Test
    await writeRef({
      repo,
      ref: 'refs/heads/another',
      value: 'HEAD',
    })
    await writeRef({
      repo,
      ref: 'HEAD',
      value: 'refs/heads/another',
      force: true,
      symbolic: true,
    })
    const newBranch = await currentBranch({ repo, fullname: true })
    assert.strictEqual(newBranch, 'refs/heads/another')
    if (!newBranch) throw new Error('type error')
    const ref = await resolveRef({ repo, ref: newBranch })
    assert.strictEqual(ref, 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69')
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeRef({
        gitdir: '/tmp/test.git',
        ref: 'refs/heads/test',
        value: 'abc123',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:ref-missing', async () => {
    const { repo } = await makeFixture('test-writeRef')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeRef({
        repo,
        value: 'abc123',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'ref')
    }
  })

  await t.test('param:value-missing', async () => {
    const { repo } = await makeFixture('test-writeRef')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeRef({
        repo,
        ref: 'refs/heads/test',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'value')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-writeRef')
    await writeRef({
      repo,
      ref: 'refs/tags/test-tag',
      value: 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69',
    })
    const ref = await resolveRef({ repo, ref: 'refs/tags/test-tag' })
    assert.strictEqual(ref, 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69')
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-writeRef')
    await writeRef({
      repo,
      ref: 'refs/tags/test-tag',
      value: 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69',
    })
    const { resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const ref = await resolveRef({ repo, ref: 'refs/tags/test-tag' })
    assert.strictEqual(ref, 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69')
  })

  await t.test('error:caller-property', async () => {
    const { repo } = await makeFixture('test-writeRef')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeRef({
        repo: undefined as any,
        value: 'abc123',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.writeRef')
    }
  })

  await t.test('param:force', async () => {
    const { repo } = await makeFixture('test-writeRef')
    // Write initial ref
    await writeRef({
      repo,
      ref: 'refs/heads/test-branch',
      value: 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69',
    })
    // Overwrite with force
    await writeRef({
      repo,
      ref: 'refs/heads/test-branch',
      value: 'abc1234567890123456789012345678901234567',
      force: true,
    })
    const ref = await resolveRef({ repo, ref: 'refs/heads/test-branch' })
    assert.strictEqual(ref, 'abc1234567890123456789012345678901234567')
  })

  await t.test('behavior:symbolic-ref', async () => {
    const { repo } = await makeFixture('test-writeRef')
    // Create a branch first
    await writeRef({
      repo,
      ref: 'refs/heads/test-branch',
      value: 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69',
    })
    // Create symbolic ref
    await writeRef({
      repo,
      ref: 'refs/heads/symbolic',
      value: 'refs/heads/test-branch',
      symbolic: true,
    })
    const ref = await resolveRef({ repo, ref: 'refs/heads/symbolic' })
    assert.strictEqual(ref, 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69')
  })
})

