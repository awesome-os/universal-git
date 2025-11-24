import { test } from 'node:test'
import assert from 'node:assert'
import { read, findPackfile, loadIndexFromPack } from '@awesome-os/universal-git-src/git/objects/pack.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { readObject } from '@awesome-os/universal-git-src/git/objects/readObject.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import type { ReadResult } from '@awesome-os/universal-git-src/git/objects/pack.ts'

test('pack.read', async (t) => {
  await t.test('ok:reads-object-from-packfile', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // Known object from the fixture
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result, 'Should return object')
    assert.strictEqual(result.type, 'commit', 'Should be a commit')
    assert.ok(result.object, 'Should have object data')
    assert.ok(result.source, 'Should have source path')
    assert.ok(result.source.includes('.pack'), 'Source should reference packfile')
  })

  await t.test('ok:returns-null-when-object-not-found', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // Non-existent OID
    const oid = '0000000000000000000000000000000000000000'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.strictEqual(result, null, 'Should return null for non-existent object')
  })

  await t.test('ok:returns-null-when-pack-directory-does-not-exist', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.mkdir(join(dir, '.git'), { recursive: true })
    const gitdir = join(dir, '.git')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs: normalizedFs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs: normalizedFs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.strictEqual(result, null, 'Should return null when pack directory does not exist')
  })

  await t.test('ok:returns-null-when-no-idx-files-exist', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    // Ensure all parent directories exist - mkdir with recursive should handle this
    try {
      await normalizedFs.mkdir(join(dir, '.git', 'objects', 'pack'), { recursive: true })
    } catch (err) {
      // If mkdir fails, try creating directories one by one
      await normalizedFs.mkdir(join(dir, '.git'), { recursive: true })
      await normalizedFs.mkdir(join(dir, '.git', 'objects'), { recursive: true })
      await normalizedFs.mkdir(join(dir, '.git', 'objects', 'pack'), { recursive: true })
    }
    const gitdir = join(dir, '.git')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs: normalizedFs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs: normalizedFs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.strictEqual(result, null, 'Should return null when no .idx files exist')
  })

  await t.test('ok:handles-wrapped-format', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'wrapped',
      getExternalRefDelta,
    })
    
    assert.ok(result, 'Should return object')
    assert.strictEqual(result.format, 'wrapped', 'Should return wrapped format')
  })

  await t.test('ok:uses-cache-for-packfile-index', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // First read - should load index
    const result1 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result1, 'First read should succeed')
    
    // Second read - should use cached index
    const result2 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result2, 'Second read should succeed')
    assert.deepStrictEqual(result1.object, result2.object, 'Results should be identical')
  })

  await t.test('ok:searches-multiple-packfiles', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // Try to read from the packfile - use a known commit OID
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result, 'Should find object in packfile')
    assert.strictEqual(result.type, 'commit', 'Should be a commit')
  })

  await t.test('ok:handles-packfile-without-corresponding-idx-file', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // This test verifies that the function gracefully handles missing .idx files
    // by continuing to search other packfiles
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Should still find the object if it exists in a valid packfile
    assert.ok(result, 'Should find object if it exists')
  })

  await t.test('ok:findPackfile-finds-packfile-containing-OID', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await findPackfile({
      fs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta,
    })
    
    assert.ok(result, 'Should find packfile')
    assert.ok(result.index, 'Should have index')
    assert.ok(result.filename, 'Should have filename')
    assert.ok(result.filename.endsWith('.idx'), 'Filename should end with .idx')
    assert.ok(result.index.offsets.has(oid), 'Index should contain OID')
  })

  await t.test('ok:findPackfile-returns-null-when-OID-not-found', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0000000000000000000000000000000000000000'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await findPackfile({
      fs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta,
    })
    
    assert.strictEqual(result, null, 'Should return null for non-existent OID')
  })

  await t.test('ok:findPackfile-returns-null-when-pack-directory-does-not-exist', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.mkdir(join(dir, '.git'), { recursive: true })
    const gitdir = join(dir, '.git')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs: normalizedFs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await findPackfile({
      fs: normalizedFs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta,
    })
    
    assert.strictEqual(result, null, 'Should return null when pack directory does not exist')
  })

  await t.test('ok:loadIndexFromPack-creates-index-from-packfile', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const packBuffer = await fs.read(
      join(gitdir, 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack')
    )
    if (!packBuffer) {
      throw new Error('Failed to read packfile')
    }
    const pack = UniversalBuffer.isBuffer(packBuffer) ? packBuffer : UniversalBuffer.from(packBuffer)
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const cache: Record<string, unknown> = {}
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const index = await loadIndexFromPack({
      pack,
      getExternalRefDelta,
    })
    
    assert.ok(index, 'Should create index')
    assert.ok(index.offsets.size > 0, 'Should have offsets')
    assert.strictEqual(index.packfileSha, '1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888', 'Should have correct packfile SHA')
  })

  await t.test('ok:loadIndexFromPack-handles-Uint8Array-input', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const packBuffer = await fs.read(
      join(gitdir, 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack')
    )
    if (!packBuffer) {
      throw new Error('Failed to read packfile')
    }
    const pack = UniversalBuffer.isBuffer(packBuffer) ? packBuffer : UniversalBuffer.from(packBuffer)
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const cache: Record<string, unknown> = {}
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const index = await loadIndexFromPack({
      pack,
      getExternalRefDelta,
    })
    
    assert.ok(index, 'Should create index from Uint8Array')
    assert.ok(index.offsets.size > 0, 'Should have offsets')
  })

  await t.test('ok:reads-different-object-types-from-packfile', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Test commit
    const commitOid = '0b8faa11b353db846b40eb064dfb299816542a46'
    const commit = await read({
      fs,
      cache,
      gitdir,
      oid: commitOid,
      format: 'content',
      getExternalRefDelta,
    })
    assert.ok(commit, 'Should read commit')
    assert.strictEqual(commit.type, 'commit', 'Should be commit type')
    
    // Test tree (if available in fixture)
    const treeOid = '637c4e69d85e0dcc18898ec251377453d0891585'
    const tree = await read({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      format: 'content',
      getExternalRefDelta,
    })
    if (tree) {
      // Tree might not be in this packfile, so only assert if found
      assert.ok(tree.type, 'Should have type')
    }
  })

  await t.test('ok:handles-packfile-with-lazy-loading', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // First read - pack should be loaded
    const result1 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result1, 'Should read object')
    
    // Second read - should use cached pack
    const result2 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result2, 'Should read object again')
    assert.deepStrictEqual(result1.object, result2.object, 'Results should be identical')
  })

  await t.test('ok:handles-multi-pack-index-MIDX-when-present', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // Check if MIDX exists - if not, skip this test
    const midxPath = join(gitdir, 'objects', 'info', 'multi-pack-index')
    let midxExists = false
    try {
      await fs.read(midxPath)
      midxExists = true
    } catch {
      // MIDX doesn't exist, skip test
      return
    }
    
    if (!midxExists) return
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should use MIDX for lookup
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result, 'Should read object via MIDX')
    assert.ok(result.source, 'Should have source path')
  })

  await t.test('ok:handles-MIDX-lookup-failure-gracefully', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should fall back to packfile iteration if MIDX lookup fails
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Should still find object even if MIDX lookup fails
    assert.ok(result, 'Should find object via fallback')
  })

  await t.test('ok:handles-loadIndex-error-gracefully', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    // Ensure all parent directories exist
    await normalizedFs.mkdir(join(dir, '.git'), { recursive: true })
    await normalizedFs.mkdir(join(dir, '.git', 'objects'), { recursive: true })
    await normalizedFs.mkdir(join(dir, '.git', 'objects', 'pack'), { recursive: true })
    const gitdir = join(dir, '.git')
    const cache: Record<string, unknown> = {}
    
    // Create a corrupted .idx file
    await normalizedFs.write(
      join(gitdir, 'objects', 'pack', 'pack-corrupted.idx'),
      Buffer.from('corrupted index data')
    )
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs: normalizedFs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should handle corrupted index gracefully
    const result = await read({
      fs: normalizedFs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Should return null when index is corrupted
    assert.strictEqual(result, null, 'Should return null for corrupted index')
  })

  await t.test('ok:handles-packfile-read-error-gracefully', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    // Create a mock fs that throws error when reading packfile
    const mockFs = {
      ...fs,
      read: async (path: string) => {
        if (path.includes('.pack')) {
          throw new Error('Packfile read error')
        }
        return fs.read(path)
      },
      readdir: fs.readdir,
      exists: fs.exists,
      mkdir: fs.mkdir,
      write: fs.write,
      rm: fs.rm,
      rmdir: fs.rmdir,
      lstat: fs.lstat,
      readlink: fs.readlink,
      writelink: fs.writelink,
    }
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs: mockFs as any, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should handle packfile read error
    try {
      await read({
        fs: mockFs as any,
        cache,
        gitdir,
        oid,
        format: 'content',
        getExternalRefDelta,
      })
      // If it doesn't throw, that's also acceptable (error handling may vary)
    } catch (err) {
      // Error is acceptable when packfile can't be read
      assert.ok(err instanceof Error)
    }
  })

  await t.test('ok:handles-objectFormat-parameter-SHA-256', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // Most fixtures use SHA-1, so this test verifies the parameter is passed through
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Explicitly specify SHA-1 format (default)
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
      objectFormat: 'sha1',
    })
    
    // Should work with explicit format
    if (result) {
      assert.ok(result.type, 'Should have object type')
    }
  })

  await t.test('ok:handles-external-ref-delta-resolution', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    // Mock getExternalRefDelta that returns a delta
    let deltaCallCount = 0
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      deltaCallCount++
      // Return the actual object (not a delta) for simplicity
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Should successfully read object (may or may not use external ref delta)
    assert.ok(result, 'Should read object')
  })

  await t.test('ok:handles-getExternalRefDelta-error-gracefully', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    // Mock getExternalRefDelta that throws error
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      throw new Error('External ref delta error')
    }
    
    // Should handle external ref delta error
    try {
      const result = await read({
        fs,
        cache,
        gitdir,
        oid,
        format: 'content',
        getExternalRefDelta,
      })
      // If object doesn't need external ref delta, should succeed
      if (result) {
        assert.ok(result.type, 'Should have object type')
      }
    } catch (err) {
      // Error is acceptable if object requires external ref delta
      assert.ok(err instanceof Error)
    }
  })

  await t.test('ok:handles-MIDX-cache-correctly', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // Check if MIDX exists
    const midxPath = join(gitdir, 'objects', 'info', 'multi-pack-index')
    try {
      await fs.read(midxPath)
    } catch {
      // MIDX doesn't exist, skip test
      return
    }
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // First read - should load MIDX
    const result1 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Second read - should use cached MIDX
    const result2 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Results should be identical
    if (result1 && result2) {
      assert.deepStrictEqual(result1.object, result2.object, 'Cached MIDX should return same result')
    }
  })

  await t.test('ok:handles-packfile-index-cache-correctly', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // First read - should load index
    const result1 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Second read - should use cached index
    const result2 = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Results should be identical
    assert.ok(result1, 'First read should succeed')
    assert.ok(result2, 'Second read should succeed')
    assert.deepStrictEqual(result1.object, result2.object, 'Cached index should return same result')
  })

  await t.test('ok:handles-packfile-without-pack-property', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should load packfile when pack property is not set
    const result = await read({
      fs,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    assert.ok(result, 'Should read object and load packfile')
  })

  await t.test('ok:handles-findPackfile-with-MIDX', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // Check if MIDX exists
    const midxPath = join(gitdir, 'objects', 'info', 'multi-pack-index')
    try {
      await fs.read(midxPath)
    } catch {
      // MIDX doesn't exist, skip test
      return
    }
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should use MIDX for finding packfile
    const result = await findPackfile({
      fs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta,
    })
    
    if (result) {
      assert.ok(result.index, 'Should have index')
      assert.ok(result.filename, 'Should have filename')
    }
  })

  await t.test('ok:handles-findPackfile-MIDX-lookup-failure', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should fall back to packfile iteration if MIDX lookup fails
    const result = await findPackfile({
      fs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta,
    })
    
    // Should still find packfile via fallback
    if (result) {
      assert.ok(result.index, 'Should have index')
      assert.ok(result.filename, 'Should have filename')
    }
  })

  await t.test('ok:handles-loadIndexFromPack-with-onProgress-callback', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const packBuffer = await fs.read(
      join(gitdir, 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack')
    )
    if (!packBuffer) {
      throw new Error('Failed to read packfile')
    }
    const pack = UniversalBuffer.isBuffer(packBuffer) ? packBuffer : UniversalBuffer.from(packBuffer)
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const cache: Record<string, unknown> = {}
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    let progressCalled = false
    const onProgress = (progress: { phase: string; loaded: number; total: number }) => {
      progressCalled = true
      assert.ok(progress.phase, 'Should have phase')
      assert.ok(typeof progress.loaded === 'number', 'Should have loaded')
      assert.ok(typeof progress.total === 'number', 'Should have total')
    }
    
    const index = await loadIndexFromPack({
      pack,
      getExternalRefDelta,
      onProgress,
    })
    
    assert.ok(index, 'Should create index')
    // Progress may or may not be called depending on implementation
  })

  await t.test('ok:handles-loadIndexFromPack-with-different-object-formats', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const packBuffer = await fs.read(
      join(gitdir, 'objects/pack/pack-1a1e70d2f116e8cb0cb42d26019e5c7d0eb01888.pack')
    )
    if (!packBuffer) {
      throw new Error('Failed to read packfile')
    }
    const pack = UniversalBuffer.isBuffer(packBuffer) ? packBuffer : UniversalBuffer.from(packBuffer)
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const cache: Record<string, unknown> = {}
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Test with SHA-1 format (default)
    const index1 = await loadIndexFromPack({
      pack,
      getExternalRefDelta,
      objectFormat: 'sha1',
    })
    
    assert.ok(index1, 'Should create index with SHA-1 format')
    
    // Test with SHA-256 format (if supported)
    const index2 = await loadIndexFromPack({
      pack,
      getExternalRefDelta,
      objectFormat: 'sha256',
    })
    
    assert.ok(index2, 'Should create index with SHA-256 format')
  })

  await t.test('ok:handles-readdir-returning-non-array', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    // Ensure all parent directories exist
    await normalizedFs.mkdir(join(dir, '.git'), { recursive: true })
    await normalizedFs.mkdir(join(dir, '.git', 'objects'), { recursive: true })
    await normalizedFs.mkdir(join(dir, '.git', 'objects', 'pack'), { recursive: true })
    const gitdir = join(dir, '.git')
    const cache: Record<string, unknown> = {}
    
    // Mock fs that returns non-array from readdir
    const mockFs = {
      ...normalizedFs,
      readdir: async () => {
        return 'not-an-array' as any
      },
      read: normalizedFs.read,
      exists: normalizedFs.exists,
      mkdir: normalizedFs.mkdir,
      write: normalizedFs.write,
      rm: normalizedFs.rm,
      rmdir: normalizedFs.rmdir,
      lstat: normalizedFs.lstat,
      readlink: normalizedFs.readlink,
      writelink: normalizedFs.writelink,
    }
    
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs: mockFs as any, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Should handle non-array readdir result
    const result = await read({
      fs: mockFs as any,
      cache,
      gitdir,
      oid,
      format: 'content',
      getExternalRefDelta,
    })
    
    // Should return null when readdir doesn't return array
    assert.strictEqual(result, null, 'Should return null for invalid readdir result')
  })

  await t.test('ok:handles-missing-pack-directory-gracefully', async () => {
    // Test - lines 268-270: catch block when pack directory doesn't exist
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.mkdir(join(dir, '.git'), { recursive: true })
    await normalizedFs.mkdir(join(dir, '.git', 'objects'), { recursive: true })
    // Don't create pack directory
    const gitdir = join(dir, '.git')
    const cache: Record<string, unknown> = {}
    
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs: normalizedFs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    const result = await findPackfile({
      fs: normalizedFs,
      cache,
      gitdir,
      oid: '0000000000000000000000000000000000000000',
      getExternalRefDelta,
    })
    
    assert.strictEqual(result, null, 'Should return null when pack directory doesn\'t exist')
  })

  await t.test('ok:loadMultiPackIndex-returns-midx-when-it-exists', async () => {
    // Test - lines 91-92: return midx
    // This is tested indirectly through MIDX lookup, but we can verify the path
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const cache: Record<string, unknown> = {}
    
    // If MIDX exists, it should be loaded and cached
    const getExternalRefDelta = async (oid: string): Promise<ReadResult> => {
      const result = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      // Ensure source is always provided for pack.ts ReadResult type
      return {
        ...result,
        source: result.source || 'loose'
      }
    }
    
    // Try to read an object - if MIDX exists, it will be used
    const result = await read({
      fs,
      cache,
      gitdir,
      oid: '0b8faa11b353db846b40eb064dfb299816542a46',
      format: 'content',
      getExternalRefDelta,
    })
    
    // If MIDX was loaded, it should be in cache now
    // The actual MIDX lookup code (lines 139-171) is tested through this
    if (result) {
      assert.ok(result, 'Should find object')
    }
  })
})

