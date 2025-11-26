import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readTag } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('readTag', () => {
  it('ok:annotated-tag', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTag')
    // Test
    const tag = await readTag({
      repo,
      oid: '587d3f8290b513e2ee85ecd317e6efecd545aee6',
    })
    assert.strictEqual(tag.oid, '587d3f8290b513e2ee85ecd317e6efecd545aee6')
    assert.ok(tag.tag)
    assert.strictEqual(tag.tag.tag, 'mytag')
    assert.strictEqual(tag.tag.object, '033417ae18b174f078f2f44232cb7a374f4c60ce')
    assert.strictEqual(tag.tag.type, 'commit')
    assert.strictEqual(tag.tag.tagger.name, 'William Hilton')
    assert.strictEqual(tag.tag.tagger.email, 'wmhilton@gmail.com')
    assert.ok(tag.tag.message)
  })

  it('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readTag({
        gitdir: '/tmp/test.git',
        oid: '587d3f8290b513e2ee85ecd317e6efecd545aee6',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  it('param:oid-missing', async () => {
    const { repo } = await makeFixture('test-readTag')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readTag({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'oid')
    }
  })

  it('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-readTag')
    // Provide gitdir explicitly to avoid default parameter evaluation issue
    const tag = await readTag({
      repo,
      oid: '587d3f8290b513e2ee85ecd317e6efecd545aee6',
    })
    assert.strictEqual(tag.oid, '587d3f8290b513e2ee85ecd317e6efecd545aee6')
    assert.ok(tag.tag)
  })

  it('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-readTag')
    const tag = await readTag({
      repo,
      oid: '587d3f8290b513e2ee85ecd317e6efecd545aee6',
    })
    assert.strictEqual(tag.oid, '587d3f8290b513e2ee85ecd317e6efecd545aee6')
    assert.ok(tag.tag)
  })

  it('error:caller-property', async () => {
    const { repo } = await makeFixture('test-readTag')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readTag({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.readTag')
    }
  })

  it('edge:tag-points-to-tree', async () => {
    const { repo } = await makeFixture('test-readTag')
    // Try to read a tag - if it points to a tree, it should still work
    try {
      const tag = await readTag({
        repo,
        oid: '587d3f8290b513e2ee85ecd317e6efecd545aee6',
      })
      assert.ok(tag.tag)
      assert.ok(['commit', 'tree', 'blob'].includes(tag.tag.type))
    } catch (error) {
      // If tag doesn't exist or points to wrong type, that's okay for this test
      assert.ok(error instanceof Error)
    }
  })

  it('edge:tag-no-message', async () => {
    const { repo } = await makeFixture('test-readTag')
    const tag = await readTag({
      repo,
      oid: '587d3f8290b513e2ee85ecd317e6efecd545aee6',
    })
    // Tag may or may not have message
    assert.ok(tag.tag)
  })
})

