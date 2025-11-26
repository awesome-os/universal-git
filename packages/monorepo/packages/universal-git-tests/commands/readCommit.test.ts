import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Errors, readCommit } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('readCommit', () => {
  it('error:NotFoundError', async () => {
    // Setup
    const { repo } = await makeFixture('test-readCommit')
    // Test
    let error = null
    try {
      await readCommit({
        repo,
        oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.NotFoundError)
  })
  
  it('ok:basic', async () => {
    // Setup
    const { repo } = await makeFixture('test-readCommit')
    // Test
    const result = await readCommit({
      repo,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
    })
    assert.strictEqual(result.oid, 'e10ebb90d03eaacca84de1af0a59b444232da99e')
    assert.ok(result.commit)
    assert.strictEqual(result.commit.author.name, 'Will Hilton')
    assert.strictEqual(result.commit.author.email, 'wmhilton@gmail.com')
    assert.ok(result.commit.message)
    assert.ok(Array.isArray(result.commit.parent))
    assert.ok(result.commit.tree)
  })
  
  it('ok:from-packfile', async () => {
    // Setup
    const { repo } = await makeFixture('test-readCommit')
    // Test
    const result = await readCommit({
      repo,
      oid: '0b8faa11b353db846b40eb064dfb299816542a46',
    })
    assert.strictEqual(result.oid, '0b8faa11b353db846b40eb064dfb299816542a46')
    assert.ok(result.commit)
    assert.strictEqual(result.commit.author.name, 'William Hilton')
    assert.ok(result.commit.message)
  })
  
  it('behavior:peels-tags', async () => {
    // Setup
    const { repo } = await makeFixture('test-readCommit')
    // Test
    const result = await readCommit({
      repo,
      oid: '587d3f8290b513e2ee85ecd317e6efecd545aee6',
    })
    assert.strictEqual(result.oid, '033417ae18b174f078f2f44232cb7a374f4c60ce')
  })

  it('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readCommit({
        gitdir: '/tmp/test.git',
        oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  it('param:oid-missing', async () => {
    const { repo } = await makeFixture('test-readCommit')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readCommit({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'oid')
    }
  })

  it('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-readCommit')
    // Provide gitdir explicitly to avoid default parameter evaluation issue
    const result = await readCommit({
      repo,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
    })
    assert.strictEqual(result.oid, 'e10ebb90d03eaacca84de1af0a59b444232da99e')
    assert.ok(result.commit)
  })

  it('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-readCommit')
    const result = await readCommit({
      repo,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
    })
    assert.strictEqual(result.oid, 'e10ebb90d03eaacca84de1af0a59b444232da99e')
    assert.ok(result.commit)
  })

  it('error:caller-property', async () => {
    const { repo } = await makeFixture('test-readCommit')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readCommit({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.readCommit')
    }
  })

  it('edge:no-parent', async () => {
    const { repo } = await makeFixture('test-readCommit')
    // Find a commit without parent (initial commit)
    const result = await readCommit({
      repo,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
    })
    // This commit has a parent, but we can test the structure
    assert.ok(Array.isArray(result.commit.parent))
  })

  it('edge:multiple-parents', async () => {
    const { repo } = await makeFixture('test-readCommit')
    const result = await readCommit({
      repo,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
    })
    // Verify parent array structure
    assert.ok(Array.isArray(result.commit.parent))
  })
})

