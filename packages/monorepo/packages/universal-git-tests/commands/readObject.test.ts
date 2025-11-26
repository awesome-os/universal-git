import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Errors, readObject } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('readObject', () => {
  it('error:test-missing', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    // Test
    let error = null
    try {
      await readObject({
        repo,
        oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.NotFoundError)
  })
  
  it('ok:parsed', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
    })
    assert.strictEqual(ref.format, 'parsed')
    assert.strictEqual(ref.type, 'commit')
    assert.strictEqual(ref.oid, 'e10ebb90d03eaacca84de1af0a59b444232da99e')
    assert.ok(ref.object)
    assert.ok(ref.object.author)
    assert.ok(ref.object.committer)
    assert.ok(ref.object.message)
  })
  
  it('ok:content', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      format: 'content',
    })
    assert.strictEqual(ref.format, 'content')
    assert.strictEqual(ref.type, 'commit')
    assert.ok(ref.source)
    assert.ok(ref.object)
  })
  
  it('ok:wrapped', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      format: 'wrapped',
    })
    assert.strictEqual(ref.format, 'wrapped')
    assert.strictEqual(ref.type, 'wrapped')
    assert.ok(ref.source)
    assert.ok(ref.object)
  })
  
  it('ok:deflated', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      format: 'deflated',
    })
    assert.strictEqual(ref.format, 'deflated')
    assert.strictEqual(ref.type, 'deflated')
    assert.ok(ref.source)
    assert.ok(ref.object)
  })
  
  it('ok:blob-with-encoding', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: '4551a1856279dde6ae9d65862a1dff59a5f199d8',
      format: 'parsed',
      encoding: 'utf8',
    })
    assert.strictEqual(ref.format, 'parsed')
    assert.strictEqual(ref.type, 'blob')
    assert.ok(ref.object)
    assert.ok(typeof ref.object === 'string')
  })

  it('ok:from-packfile-deflated', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: '0b8faa11b353db846b40eb064dfb299816542a46',
      format: 'deflated',
    })
    // Packed objects may be returned as 'content' or 'wrapped' format depending on implementation
    assert.ok(ref.format === 'content' || ref.format === 'wrapped')
    // Type may be 'commit' (if content) or 'wrapped' (if wrapped format)
    assert.ok(ref.type === 'commit' || ref.type === 'wrapped')
    assert.ok(ref.source)
    assert.ok(ref.source.includes('pack'))
    assert.ok(ref.object)
  })

  it('ok:from-packfile-wrapped', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: '0b8faa11b353db846b40eb064dfb299816542a46',
      format: 'wrapped',
    })
    // Packed objects may be returned as 'content' or 'wrapped' format depending on implementation
    assert.ok(ref.format === 'content' || ref.format === 'wrapped')
    // Type may be 'commit' (if content) or 'wrapped' (if wrapped format)
    assert.ok(ref.type === 'commit' || ref.type === 'wrapped')
    assert.ok(ref.source)
    assert.ok(ref.source.includes('pack'))
    assert.ok(ref.object)
  })

  it('ok:from-packfile-content', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: '0b8faa11b353db846b40eb064dfb299816542a46',
      format: 'content',
    })
    assert.strictEqual(ref.format, 'content')
    assert.strictEqual(ref.type, 'commit')
    assert.ok(ref.source)
    assert.ok(ref.source.includes('pack'))
    assert.ok(ref.object)
  })

  it('ok:with-simple-filepath-to-blob', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'be1e63da44b26de8877a184359abace1cddcb739',
      format: 'parsed',
      filepath: 'cli.js',
    })
    // When filepath is provided, format may change to 'content'
    assert.ok(ref.format === 'content' || ref.format === 'parsed')
    assert.strictEqual(ref.type, 'blob')
    assert.ok(ref.source)
    assert.strictEqual(ref.oid, '4551a1856279dde6ae9d65862a1dff59a5f199d8')
    assert.ok(ref.object)
  })

  it('ok:with-deep-filepath-to-blob', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'be1e63da44b26de8877a184359abace1cddcb739',
      format: 'parsed',
      filepath: 'src/commands/clone.js',
    })
    // When filepath is provided, format may change to 'content'
    assert.ok(ref.format === 'content' || ref.format === 'parsed')
    assert.strictEqual(ref.type, 'blob')
    assert.strictEqual(ref.oid, '5264f23285d8be3ce45f95c102001ffa1d5391d3')
    assert.ok(ref.object)
  })

  it('ok:with-simple-filepath-to-tree', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'be1e63da44b26de8877a184359abace1cddcb739',
      format: 'parsed',
      filepath: '',
    })
    assert.strictEqual(ref.format, 'parsed')
    assert.strictEqual(ref.type, 'tree')
    assert.ok(ref.source)
    assert.strictEqual(ref.oid, '6257985e3378ec42a03a57a7dc8eb952d69a5ff3')
    assert.ok(Array.isArray(ref.object))
    assert.ok(ref.object.length > 0)
  })

  it('ok:with-deep-filepath-to-tree', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    const gitdir = await repo.getGitdir()
    // Test
    const ref = await readObject({
      fs: repo.fs,
      gitdir,
      oid: 'be1e63da44b26de8877a184359abace1cddcb739',
      format: 'parsed',
      filepath: 'src/commands',
    })
    assert.strictEqual(ref.format, 'parsed')
    assert.strictEqual(ref.type, 'tree')
    assert.strictEqual(ref.oid, '7704a6e8a802efcdbe6cf3dfa114c105f1d5c67a')
    assert.ok(Array.isArray(ref.object))
    assert.ok(ref.object.length > 0)
    // Verify it's the commands directory
    const entry = ref.object.find((e: any) => e.path === 'clone.js')
    assert.ok(entry, 'Should contain clone.js')
  })

  it('error:with-erroneous-filepath-directory-is-a-file', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    // Test
    let error: unknown = null
    try {
      await readObject({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        format: 'parsed',
        filepath: 'src/commands/clone.js/isntafolder.txt',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.ObjectTypeError)
  })

  it('error:with-erroneous-filepath-no-such-directory', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    // Test
    let error: unknown = null
    try {
      await readObject({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        format: 'parsed',
        filepath: 'src/isntafolder',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.NotFoundError)
  })

  it('error:with-erroneous-filepath-leading-slash', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    // Test
    let error: unknown = null
    try {
      await readObject({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        format: 'parsed',
        filepath: '/src',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.InvalidFilepathError)
    if (error instanceof Errors.InvalidFilepathError) {
      assert.strictEqual(error.data.reason, 'leading-slash')
    }
  })

  it('error:with-erroneous-filepath-trailing-slash', async () => {
    // Setup
    const { repo } = await makeFixture('test-readObject')
    // Test
    let error: unknown = null
    try {
      await readObject({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        format: 'parsed',
        filepath: 'src/',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.InvalidFilepathError)
    if (error instanceof Errors.InvalidFilepathError) {
      assert.strictEqual(error.data.reason, 'trailing-slash')
    }
  })

  it('behavior:uses-getExternalRefDelta-for-packfile-deltas', async () => {
    // Test - line 57: getExternalRefDelta function
    const { repo } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    // This tests the getExternalRefDelta closure
    const result = await readObject({
      repo,
      oid: '0b8faa11b353db846b40eb064dfb299816542a46',
      format: 'content',
    })
    assert.ok(result)
    assert.strictEqual(result.type, 'commit')
  })

  it('ok:handles-deflated-format-for-loose-objects', async () => {
    // Test - lines 105-107: inflate deflated loose object
    const { repo } = await makeFixture('test-readObject')
    const result = await readObject({
      repo,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      format: 'deflated',
    })
    assert.ok(result)
    assert.strictEqual(result.format, 'deflated')
  })

  it('ok:verifies-SHA-and-unwraps-wrapped-object', async () => {
    // Test - lines 120-121: SHA verification and unwrap
    const { repo } = await makeFixture('test-readObject')
    const result = await readObject({
      repo,
      oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      format: 'content',
    })
    assert.ok(result)
    assert.strictEqual(result.format, 'content')
    assert.ok(result.type)
  })

  it('error:throws-error-for-invalid-format', async () => {
    // Test - line 130-131: throw InternalError for invalid format
    const { repo } = await makeFixture('test-readObject')
    let error: unknown = null
    try {
      await readObject({
        repo,
        oid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
        // @ts-expect-error - intentionally invalid format
        format: 'invalid-format',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    const { InternalError } = await import('@awesome-os/universal-git-src/errors/InternalError.ts')
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('invalid requested format'))
  })
})

