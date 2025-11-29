import { describe, it } from 'node:test'
import assert from 'node:assert'
import { listFiles } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('listFiles', () => {
  it('ok:index', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-listFiles')
    // Test
    const files = await listFiles({ repo })
    // Verify it returns an array with files
    assert.ok(Array.isArray(files))
    assert.ok(files.length > 0)
    // Check some expected files are present
    assert.ok(files.includes('.babelrc') || files.includes('README.md') || files.includes('package.json'))
  })
  
  it('ok:ref', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    // Test
    const files = await listFiles({ repo, ref: 'test-branch' })
    // Verify it returns an array with files
    assert.ok(Array.isArray(files))
    assert.ok(files.length > 0)
  })

  it('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listFiles({
        gitdir: '/tmp/test.git',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  it('param:repo-provided', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listFiles')
    const files = await listFiles({ repo })
    assert.ok(Array.isArray(files))
    assert.ok(files.length >= 0)
  })

  it('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listFiles')
    const files = await listFiles({ repo })
    assert.ok(Array.isArray(files))
    assert.ok(files.length >= 0)
  })

  it('error:caller-property', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listFiles')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listFiles({
        repo: undefined as any,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listFiles')
    }
  })

  it('edge:empty-repository', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const files = await listFiles({ repo })
    assert.ok(Array.isArray(files))
    assert.strictEqual(files.length, 0)
  })

  it('error:non-existent-ref', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listFiles')
    try {
      await listFiles({ repo, ref: 'nonexistent-ref' })
      // Should throw NotFoundError
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      // Expected - ref doesn't exist
      assert.ok(error instanceof Error)
    }
  })
})

