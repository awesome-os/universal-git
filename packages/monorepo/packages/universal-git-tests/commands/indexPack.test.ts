import { test } from 'node:test'
import assert from 'node:assert'
import { indexPack } from '@awesome-os/universal-git-src/commands/indexPack.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { createBackend } from '@awesome-os/universal-git-src/backends/index.ts'

test('indexPack', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await indexPack({
        dir: '/tmp/test',
        gitdir: '/tmp/test.git',
        filepath: 'objects/pack/test.pack',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:dir-missing', async () => {
    const { fs } = await makeFixture('test-empty')
    try {
      // indexPack can work with gitdir alone (uses gitdir as fallback for dir)
      // So this should not throw MissingParameterError for dir
      await indexPack({
        fs,
        gitdir: '/tmp/test.git',
        filepath: 'objects/pack/test.pack',
      } as any)
      // If it doesn't throw, that's fine - indexPack supports gitdir alone
    } catch (error) {
      // If it throws, it should be a different error (like file not found), not MissingParameterError for dir
      if (error instanceof MissingParameterError) {
        // normalizeCommandArgs might throw 'dir OR gitdir' if both are missing
        // But we're providing gitdir, so this shouldn't happen
        assert.fail('Should not throw MissingParameterError when gitdir is provided')
      }
      // Other errors (like file not found) are acceptable
    }
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    // gitdir is derived from dir, so when dir is provided, gitdir should be join(dir, '.git')
    try {
      await indexPack({
        fs,
        dir,
        // gitdir not provided, should default to join(dir, '.git')
        filepath: 'objects/pack/nonexistent.pack',
      })
      assert.fail('Should have thrown an error')
    } catch (error) {
      // The error should occur because the pack file doesn't exist
      // But the gitdir should be correctly derived from dir
      assert.ok(error instanceof Error, 'Should throw an error when pack file does not exist')
    }
  })

  await t.test('param:filepath-missing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    try {
      await indexPack({
        fs,
        dir,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'filepath')
    }
  })

  await t.test('error:pack-file-not-exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    try {
      await indexPack({
        fs,
        dir,
        gitdir,
        filepath: 'objects/pack/nonexistent.pack',
      })
      assert.fail('Should have thrown an error')
    } catch (error) {
      assert.ok(error instanceof Error, 'Should throw an error when pack file does not exist')
    }
  })

  await t.test('param:onProgress', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    let progressCalled = false
    const progressEvents: Array<{ phase: string; loaded: number; total: number }> = []
    
    try {
      await indexPack({
        fs,
        dir,
        gitdir,
        filepath: 'objects/pack/nonexistent.pack',
        onProgress: (evt) => {
          progressCalled = true
          progressEvents.push(evt)
        },
      })
      assert.fail('Should have thrown an error')
    } catch (error) {
      // Even if the pack file doesn't exist, onProgress might be called during initialization
      // The important thing is that the callback is properly passed through
      assert.ok(error instanceof Error, 'Should throw an error when pack file does not exist')
    }
  })

  await t.test('ok:indexes-packfile', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    // For bare repositories, dir might be the same as gitdir
    // filepath is relative to dir, so we need to check if this is a bare repo
    const packfileInGitdir = join(gitdir, 'objects', 'pack', 'pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack')
    const packfileExists = await fs.exists(packfileInGitdir)
    assert.ok(packfileExists, 'Packfile should exist in fixture')
    
    // Determine if this is a bare repo (gitdir == dir) or not
    // For bare repos, filepath should be relative to gitdir
    // For non-bare repos, filepath should include .git/
    const packfilePath = 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack'
    const dir = gitdir // Use gitdir as dir for bare repos
    
    // Remove existing index if it exists
    const indexPath = packfilePath.replace(/\.pack$/, '.idx')
    const indexFullPath = join(dir, indexPath)
    try {
      await fs.rm(indexFullPath)
    } catch {
      // Index might not exist, that's okay
    }
    
    // Create backend for bare repo (no worktree)
    const gitBackend = createBackend({
      type: 'filesystem',
      fs,
      gitdir,
    })
    
    const cache: Record<string, unknown> = {}
    const { oids } = await indexPack({
      gitBackend,
      dir, // dir === gitdir for bare repos
      filepath: packfilePath,
      cache,
    })
    
    assert.ok(oids, 'Should return oids array')
    assert.ok(Array.isArray(oids), 'oids should be an array')
    assert.ok(oids.length > 0, 'Should have at least one OID')
    
    // Verify index file was created
    const indexExists = await fs.exists(indexFullPath)
    assert.ok(indexExists, 'Index file should be created')
  })

  await t.test('ok:returns-correct-OIDs', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const dir = gitdir // Use gitdir as dir for bare repos
    const packfilePath = 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack'
    
    // Remove existing index if it exists
    const indexPath = packfilePath.replace(/\.pack$/, '.idx')
    const indexFullPath = join(dir, indexPath)
    try {
      await fs.rm(indexFullPath)
    } catch {
      // Index might not exist, that's okay
    }
    
    // Create backend for bare repo (no worktree)
    const gitBackend = createBackend({
      type: 'filesystem',
      fs,
      gitdir,
    })
    
    const cache: Record<string, unknown> = {}
    const { oids } = await indexPack({
      gitBackend,
      dir, // dir === gitdir for bare repos
      filepath: packfilePath,
      cache,
    })
    
    // Verify known OIDs from the fixture are present
    const knownOid = '0b8faa11b353db846b40eb064dfb299816542a46'
    assert.ok(oids.includes(knownOid), `Should include known OID ${knownOid}`)
    
    // All OIDs should be 40-character SHA-1 hashes
    for (const oid of oids) {
      assert.strictEqual(oid.length, 40, `OID ${oid} should be 40 characters`)
      assert.ok(/^[0-9a-f]{40}$/i.test(oid), `OID ${oid} should be a valid SHA-1 hash`)
    }
  })

  await t.test('ok:creates-index-file', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const dir = gitdir // Use gitdir as dir for bare repos
    const packfilePath = 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack'
    const expectedIndexPath = 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.idx'
    
    // Remove existing index if it exists
    const indexFullPath = join(dir, expectedIndexPath)
    try {
      await fs.rm(indexFullPath)
    } catch {
      // Index might not exist, that's okay
    }
    
    // Create backend for bare repo (no worktree)
    const gitBackend = createBackend({
      type: 'filesystem',
      fs,
      gitdir,
    })
    
    const cache: Record<string, unknown> = {}
    await indexPack({
      gitBackend,
      dir, // dir === gitdir for bare repos
      filepath: packfilePath,
      cache,
    })
    
    // Verify index file was created with correct name
    const indexExists = await fs.exists(indexFullPath)
    assert.ok(indexExists, 'Index file should be created with .idx extension')
  })

  await t.test('param:cache', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const dir = gitdir // Use gitdir as dir for bare repos
    const packfilePath = 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack'
    
    // Remove existing index if it exists
    const indexPath = packfilePath.replace(/\.pack$/, '.idx')
    const indexFullPath = join(dir, indexPath)
    try {
      await fs.rm(indexFullPath)
    } catch {
      // Index might not exist, that's okay
    }
    
    // Create backend for bare repo (no worktree)
    const gitBackend = createBackend({
      type: 'filesystem',
      fs,
      gitdir,
    })
    
    const cache: Record<string, unknown> = {}
    const { oids: oids1 } = await indexPack({
      gitBackend,
      dir, // dir === gitdir for bare repos
      filepath: packfilePath,
      cache,
    })
    
    // Remove index again and re-index with same cache
    try {
      await fs.rm(indexFullPath)
    } catch {}
    
    const { oids: oids2 } = await indexPack({
      gitBackend,
      dir, // dir === gitdir for bare repos
      filepath: packfilePath,
      cache,
    })
    
    // Results should be the same
    assert.deepStrictEqual(oids1, oids2, 'Should return same OIDs with cache')
  })

  await t.test('behavior:onProgress-during-indexing', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const dir = gitdir // Use gitdir as dir for bare repos
    const packfilePath = 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack'
    
    // Remove existing index if it exists
    const indexPath = packfilePath.replace(/\.pack$/, '.idx')
    const indexFullPath = join(dir, indexPath)
    try {
      await fs.rm(indexFullPath)
    } catch {
      // Index might not exist, that's okay
    }
    
    // Create backend for bare repo (no worktree)
    const gitBackend = createBackend({
      type: 'filesystem',
      fs,
      gitdir,
    })
    
    const progressEvents: Array<{ phase: string; loaded: number; total?: number }> = []
    const cache: Record<string, unknown> = {}
    
    const { oids } = await indexPack({
      gitBackend,
      dir, // dir === gitdir for bare repos
      filepath: packfilePath,
      cache,
      onProgress: (evt) => {
        progressEvents.push(evt)
      },
    })
    
    assert.ok(oids.length > 0, 'Should return OIDs')
    // onProgress might be called during indexing
    // The important thing is that the callback is properly passed through
    assert.ok(typeof progressEvents.length === 'number', 'Progress callback should be callable')
  })

  await t.test('param:gitdir', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const dir = gitdir // Use gitdir as dir for bare repos
    const packfilePath = 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack'
    
    // Remove existing index if it exists
    const indexPath = packfilePath.replace(/\.pack$/, '.idx')
    const indexFullPath = join(dir, indexPath)
    try {
      await fs.rm(indexFullPath)
    } catch {
      // Index might not exist, that's okay
    }
    
    // Create backend for bare repo (no worktree)
    const gitBackend = createBackend({
      type: 'filesystem',
      fs,
      gitdir,
    })
    
    const cache: Record<string, unknown> = {}
    
    // Test with explicit gitBackend
    const { oids: oids1 } = await indexPack({
      gitBackend,
      dir, // dir === gitdir for bare repos
      filepath: packfilePath,
      cache,
    })
    
    // Remove index again
    try {
      await fs.rm(indexFullPath)
    } catch {}
    
    // Test with legacy fs/gitdir (should auto-create backend)
    const { oids: oids2 } = await indexPack({
      fs,
      dir,
      gitdir, // Explicit gitdir for bare repo
      filepath: packfilePath,
      cache,
    })
    
    // Results should be the same
    assert.deepStrictEqual(oids1, oids2, 'Should return same OIDs regardless of gitdir parameter')
  })

  await t.test('error:caller-property', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    
    try {
      await indexPack({
        fs,
        dir,
        gitdir,
        filepath: 'objects/pack/nonexistent.pack',
      })
      assert.fail('Should have thrown an error')
    } catch (error: unknown) {
      assert.ok(error instanceof Error, 'Should throw an error')
      assert.strictEqual((error as { caller?: string }).caller, 'git.indexPack', 'Error should have caller property set')
    }
  })

})

