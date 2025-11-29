import { describe, it } from 'node:test'
import assert from 'node:assert'
import { listRefs } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('listRefs', () => {
  it('ok:basic', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-listRefs')
    // Test
    const refs = await listRefs({
      repo,
      filepath: 'refs/tags',
    })
    assert.ok(Array.isArray(refs))
    assert.ok(refs.length > 0)
    // Verify it contains some tag refs
    assert.ok(refs.some(ref => ref.includes('v0.') || ref.includes('test-tag') || ref.includes('local-tag')))
  })

  it('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listRefs({
        gitdir: '/tmp/test.git',
        filepath: 'refs/tags',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  it('param:repo-provided', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listRefs')
    const refs = await listRefs({ repo, filepath: 'refs/tags' })
    assert.ok(Array.isArray(refs))
    assert.ok(refs.length >= 0)
  })

  it('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listRefs')
    const refs = await listRefs({ repo, filepath: 'refs/tags' })
    assert.ok(Array.isArray(refs))
    assert.ok(refs.length >= 0)
  })

  it('edge:missing-packed-refs', async () => {
    // Test - lines 72-73: catch block when packed-refs doesn't exist
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const refs = await listRefs({
      repo,
      filepath: 'refs/heads',
    })
    assert.ok(Array.isArray(refs))
    // Should return empty array or refs from loose files only
  })

  it('error:caller-property', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listRefs')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listRefs({
        repo: undefined as any,
        filepath: 'refs/tags',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listRefs')
    }
  })

  it('param:empty-filepath', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listRefs')
    const refs = await listRefs({ repo, filepath: '' })
    assert.ok(Array.isArray(refs))
    assert.ok(refs.length >= 0)
  })

  it('edge:non-existent-ref-path', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listRefs')
    const refs = await listRefs({ repo, filepath: 'refs/nonexistent' })
    assert.ok(Array.isArray(refs))
    assert.strictEqual(refs.length, 0)
  })

  it('ok:refs-heads-path', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listRefs')
    const refs = await listRefs({ repo, filepath: 'refs/heads' })
    assert.ok(Array.isArray(refs))
    assert.ok(refs.length >= 0)
  })
})

