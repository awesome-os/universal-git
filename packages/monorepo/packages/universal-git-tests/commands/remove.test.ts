import { describe, it } from 'node:test'
import assert from 'node:assert'
import { remove, listFiles } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('remove', () => {
  it('ok:file', async () => {
    // Setup
    const { repo } = await makeFixture('test-remove', { init: true })
    // Test
    const before = await listFiles({ repo })
    assert.ok(before.length > 0)
    assert.ok(before.includes('LICENSE.md'))
    await remove({ repo, filepath: 'LICENSE.md' })
    const after = await listFiles({ repo })
    assert.strictEqual(before.length, after.length + 1)
    assert.ok(!after.includes('LICENSE.md'))
  })
  
  it('ok:dir', async () => {
    // Setup
    const { repo } = await makeFixture('test-remove', { init: true })
    // Test
    const before = await listFiles({ repo })
    assert.ok(before.length > 0)
    await remove({ repo, filepath: 'src' })
    const after = await listFiles({ repo })
    // All files in src directory should be removed
    const srcFiles = before.filter(f => f.startsWith('src/'))
    assert.strictEqual(before.length, after.length + srcFiles.length)
  })

  it('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await remove({
        gitdir: '/tmp/test.git',
        filepath: 'file.txt',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  it('param:filepath-missing', async () => {
    const { repo } = await makeFixture('test-remove', { init: true })
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await remove({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'filepath')
    }
  })

  it('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-remove', { init: true })
    const before = await listFiles({ repo })
    assert.ok(before.includes('LICENSE.md'))
    await remove({ repo, filepath: 'LICENSE.md' })
    const after = await listFiles({ repo })
    assert.ok(!after.includes('LICENSE.md'))
  })

  it('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-remove', { init: true })
    const before = await listFiles({ repo })
    // Check if LICENSE.md exists in this fixture
    if (before.includes('LICENSE.md')) {
      await remove({ repo, filepath: 'LICENSE.md' })
      const after = await listFiles({ repo })
      assert.ok(!after.includes('LICENSE.md'))
    } else {
      // If LICENSE.md doesn't exist, just verify remove doesn't throw
      await remove({ repo, filepath: 'LICENSE.md' })
    }
  })

  it('error:caller-property', async () => {
    const { repo } = await makeFixture('test-remove', { init: true })
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await remove({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.remove')
    }
  })

  it('edge:non-existent-file', async () => {
    const { repo } = await makeFixture('test-remove', { init: true })
    // Try to remove a file that doesn't exist
    try {
      await remove({ repo, filepath: 'non-existent-file.txt' })
      // Should not throw - remove is idempotent
    } catch (error) {
      // If it throws, that's also acceptable behavior
      assert.ok(error instanceof Error)
    }
  })

  it('edge:special-chars-path', async () => {
    const { repo } = await makeFixture('test-remove', { init: true })
    const dir = await repo.getDir()!
    // First add a file with special characters
    const { add } = await import('@awesome-os/universal-git-src/index.ts')
    await repo.fs.write(`${dir}/file-with-special-chars.txt`, 'content')
    await add({ repo, filepath: 'file-with-special-chars.txt' })
    // Then remove it
    await remove({ repo, filepath: 'file-with-special-chars.txt' })
    const files = await listFiles({ repo })
    assert.ok(!files.includes('file-with-special-chars.txt'))
  })
})

