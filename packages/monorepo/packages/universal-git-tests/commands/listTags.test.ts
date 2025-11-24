import { describe, it } from 'node:test'
import assert from 'node:assert'
import { listTags } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('listTags', () => {
  it('ok:basic', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-listTags')
    // Test
    const refs = await listTags({
      fs,
      gitdir,
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
    const { fs, gitdir } = await makeFixture('test-listTags')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, gitdir })
    const tags = await listTags({ repo })
    assert.ok(Array.isArray(tags))
    assert.ok(tags.length >= 0)
  })

  it('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-listTags')
    const tags = await listTags({ fs, dir })
    assert.ok(Array.isArray(tags))
    assert.ok(tags.length >= 0)
  })

  it('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-listTags')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listTags({
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listTags')
    }
  })

  it('edge:empty-repository', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const { init } = await import('@awesome-os/universal-git-src/index.ts')
    await init({ fs, dir })
    const tags = await listTags({ fs, dir })
    assert.ok(Array.isArray(tags))
    assert.strictEqual(tags.length, 0)
  })
})

