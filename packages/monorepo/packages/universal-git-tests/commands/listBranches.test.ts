import { describe, it } from 'node:test'
import assert from 'node:assert'
import { listBranches } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('listBranches', () => {
  it('ok:basic', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-listBranches')
    // Test
    const branches = await listBranches({ fs, gitdir })
    assert.ok(Array.isArray(branches))
    assert.ok(branches.length > 0)
    // Check some expected branches
    assert.ok(branches.includes('master') || branches.includes('main') || branches.includes('test-branch'))
  })
  
  it('param:remote', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-listBranches')
    // Test
    const branches = await listBranches({
      fs,
      gitdir,
      remote: 'origin',
    })
    assert.ok(Array.isArray(branches))
    assert.ok(branches.length > 0)
  })

  it('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listBranches({
        gitdir: '/tmp/test.git',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  it('param:repo-provided', async () => {
    const { fs, gitdir } = await makeFixture('test-listBranches')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, gitdir })
    const branches = await listBranches({ repo })
    assert.ok(Array.isArray(branches))
    assert.ok(branches.length >= 0)
  })

  it('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-listBranches')
    const branches = await listBranches({ fs, dir })
    assert.ok(Array.isArray(branches))
    assert.ok(branches.length >= 0)
  })

  it('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-listBranches')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listBranches({
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listBranches')
    }
  })

  it('edge:empty-repository', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const { init } = await import('@awesome-os/universal-git-src/index.ts')
    await init({ fs, dir })
    const branches = await listBranches({ fs, dir })
    assert.ok(Array.isArray(branches))
    // Empty repo might have no branches or a default branch
    assert.ok(branches.length >= 0)
  })

  it('edge:non-existent-remote', async () => {
    const { fs, gitdir } = await makeFixture('test-listBranches')
    const branches = await listBranches({
      fs,
      gitdir,
      remote: 'nonexistent',
    })
    assert.ok(Array.isArray(branches))
    // Should return empty array for non-existent remote
    assert.strictEqual(branches.length, 0)
  })
})

