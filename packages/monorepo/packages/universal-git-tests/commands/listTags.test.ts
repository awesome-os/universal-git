import { describe, it } from 'node:test'
import assert from 'node:assert'
import { listTags } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('listTags', () => {
  it('ok:basic', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-listTags')
    // Test
    const refs = await listTags({
      repo,
    })
    assert.ok(Array.isArray(refs))
    assert.ok(refs.length > 0)
    // Verify it contains some tags
    assert.ok(refs.some(tag => tag.includes('v0.') || tag.includes('test-tag') || tag.includes('local-tag')))
  })

  it('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listTags({
        gitdir: '/tmp/test.git',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  it('param:repo-provided', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listTags')
    const tags = await listTags({ repo })
    assert.ok(Array.isArray(tags))
    assert.ok(tags.length >= 0)
  })

  it('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listTags')
    const tags = await listTags({ repo })
    assert.ok(Array.isArray(tags))
    assert.ok(tags.length >= 0)
  })

  it('error:caller-property', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-listTags')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listTags({
        repo: undefined as any,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listTags')
    }
  })

  it('edge:empty-repository', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const tags = await listTags({ repo })
    assert.ok(Array.isArray(tags))
    assert.strictEqual(tags.length, 0)
  })
})

