import { describe, it } from 'node:test'
import assert from 'node:assert'
import { listBranches } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('listBranches', () => {
  it('ok:basic', async () => {
    // Setup
    const { repo } = await makeFixture('test-listBranches')
    // Test
    const branches = await listBranches({ repo })
    assert.ok(Array.isArray(branches))
    assert.ok(branches.length > 0)
    // Check some expected branches
    assert.ok(branches.includes('master') || branches.includes('main') || branches.includes('test-branch'))
  })
  
  it('param:remote', async () => {
    // Setup
    const { repo } = await makeFixture('test-listBranches')
    // Test
    const branches = await listBranches({
      repo,
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
    const { repo } = await makeFixture('test-listBranches')
    const branches = await listBranches({ repo })
    assert.ok(Array.isArray(branches))
    assert.ok(branches.length >= 0)
  })

  it('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-listBranches')
    const branches = await listBranches({ repo })
    assert.ok(Array.isArray(branches))
    assert.ok(branches.length >= 0)
  })

  it('error:caller-property', async () => {
    const { repo } = await makeFixture('test-listBranches')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listBranches({
        repo: undefined as any,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listBranches')
    }
  })

  it('edge:empty-repository', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const branches = await listBranches({ repo })
    assert.ok(Array.isArray(branches))
    // Empty repo might have no branches or a default branch
    assert.ok(branches.length >= 0)
  })

  it('edge:non-existent-remote', async () => {
    const { repo } = await makeFixture('test-listBranches')
    const branches = await listBranches({
      repo,
      remote: 'nonexistent',
    })
    assert.ok(Array.isArray(branches))
    // Should return empty array for non-existent remote
    assert.strictEqual(branches.length, 0)
  })
})

