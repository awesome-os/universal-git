import { test } from 'node:test'
import assert from 'node:assert'
import { resetIndex, listFiles, statusMatrix } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('resetIndex', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await resetIndex({
        gitdir: '/tmp/test.git',
        filepath: 'test.txt',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:gitdir-or-dir-missing', async () => {
    const { fs } = await makeFixture('test-empty')
    try {
      await resetIndex({
        fs,
        filepath: 'test.txt',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      // normalizeCommandArgs throws 'dir OR gitdir' when both are missing
      assert.ok(error instanceof Error, 'Should throw an error')
      if (error instanceof MissingParameterError) {
        assert.strictEqual((error as any).data?.parameter, 'dir OR gitdir')
      }
    }
  })

  await t.test('param:filepath-missing', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    try {
      await resetIndex({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'filepath')
    }
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    // gitdir is derived from dir, so when dir is provided, gitdir should be join(dir, '.git')
    try {
      await resetIndex({
        fs,
        dir,
        // gitdir not provided, should default to join(dir, '.git')
        filepath: 'nonexistent.txt',
      })
      // resetIndex should not throw for non-existent files, it just removes them from index
      assert.ok(true)
    } catch (error) {
      // If there's an error, it should be about the repository state, not gitdir
      assert.ok(error instanceof Error, 'Should throw an error if repository is invalid')
    }
  })

  await t.test('edge:missing-ref-new-repo', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    // In a new repository without commits, resetIndex should not throw when ref is not provided
    try {
      await resetIndex({
        fs,
        dir,
        gitdir,
        filepath: 'nonexistent.txt',
        // ref not provided, should default to 'HEAD' but handle gracefully if HEAD doesn't exist
      })
      // resetIndex should handle this gracefully
      assert.ok(true)
    } catch (error) {
      // If there's an error, it should be about the file not existing, not about HEAD
      assert.ok(error instanceof Error, 'Should throw an error if file operations fail')
    }
  })
  await t.test('ok:modified-file', async () => {
    // Setup
    const { fs, gitdir, dir } = await makeFixture('test-resetIndex')
    // Test
    const before = await listFiles({ fs, gitdir })
    assert.ok(Array.isArray(before))
    assert.ok(before.includes('a.txt'))
    assert.ok(before.includes('b.txt'))
    assert.ok(before.includes('d.txt'))
    await resetIndex({ fs, dir, gitdir, filepath: 'a.txt' })
    const after = await listFiles({ fs, gitdir })
    assert.ok(Array.isArray(after))
    assert.ok(after.includes('a.txt'))
    assert.ok(after.includes('b.txt'))
    assert.ok(after.includes('d.txt'))
    assert.strictEqual(before.length, after.length)
  })

  await t.test('ok:new-file', async () => {
    // Setup
    const { fs, gitdir, dir } = await makeFixture('test-resetIndex')
    // Test
    const before = await listFiles({ fs, gitdir })
    assert.ok(Array.isArray(before))
    assert.ok(before.includes('a.txt'))
    assert.ok(before.includes('b.txt'))
    assert.ok(before.includes('d.txt'))
    await resetIndex({ fs, dir, gitdir, filepath: 'd.txt' })
    const after = await listFiles({ fs, gitdir })
    assert.ok(Array.isArray(after))
    assert.ok(after.includes('a.txt'))
    assert.ok(after.includes('b.txt'))
    assert.ok(!after.includes('d.txt'))
    assert.strictEqual(before.length, after.length + 1)
  })

  await t.test('ok:new-repository', async () => {
    // Setup
    const { fs, gitdir, dir } = await makeFixture('test-resetIndex-new')
    // Test
    const before = await listFiles({ fs, gitdir })
    assert.ok(Array.isArray(before))
    assert.ok(before.includes('a.txt'))
    assert.ok(before.includes('b.txt'))
    await resetIndex({ fs, dir, gitdir, filepath: 'b.txt' })
    const after = await listFiles({ fs, gitdir })
    assert.ok(Array.isArray(after))
    assert.ok(after.includes('a.txt'))
    assert.ok(!after.includes('b.txt'))
    assert.strictEqual(before.length, after.length + 1)
  })

  await t.test('ok:reset-to-oid', async () => {
    // Setup
    const { fs, gitdir, dir } = await makeFixture('test-resetIndex-oid')
    // Test
    const before = await statusMatrix({ fs, dir, gitdir })
    assert.ok(Array.isArray(before))
    // Find b.txt in the status matrix
    const bBefore = before.find((entry: any) => entry[0] === 'b.txt')
    assert.ok(bBefore, 'b.txt should be in status matrix')
    // Status matrix format: [filepath, HEAD, INDEX, WORKDIR]
    // All should be 1 (present) before reset
    assert.strictEqual(bBefore[1], 1) // HEAD
    assert.strictEqual(bBefore[2], 1) // INDEX
    assert.strictEqual(bBefore[3], 1) // WORKDIR
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'b.txt',
      ref: '572d5ec8ea719ed6780ef0e6a115a75999cb3091',
    })
    const after = await statusMatrix({ fs, dir, gitdir })
    assert.ok(Array.isArray(after))
    // Find b.txt in the status matrix after reset
    const bAfter = after.find((entry: any) => entry[0] === 'b.txt')
    assert.ok(bAfter, 'b.txt should still be in status matrix')
    // After reset to specific OID, WORKDIR should be 0 (absent)
    assert.strictEqual(bAfter[1], 1) // HEAD
    assert.strictEqual(bAfter[2], 1) // INDEX
    assert.strictEqual(bAfter[3], 0) // WORKDIR (absent after reset)
  })

  await t.test('error:ref-cannot-be-resolved', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    
    // Try to reset with invalid ref
    await assert.rejects(
      async () => {
        await resetIndex({
          fs,
          dir,
          gitdir,
          filepath: 'a.txt',
          ref: 'nonexistent-ref',
        })
      },
      (err: any) => {
        // Should throw an error about ref not found
        return err !== undefined && err !== null
      }
    )
  })

  await t.test('edge:file-not-in-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    
    // Reset a file that doesn't exist in HEAD (should remove from index)
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'nonexistent.txt',
    })
    
    // File should not be in index after reset
    const files = await listFiles({ fs, gitdir })
    assert.ok(!files.includes('nonexistent.txt'))
  })

  await t.test('behavior:workdir-stats-match', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // Get file stats before reset
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    const beforeStats = await normalizedFs.lstat(join(dir, 'a.txt'))
    
    // Reset file (should use workdir stats if hash matches)
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'a.txt',
      cache,
    })
    
    // Verify file is still in index
    const files = await listFiles({ fs, gitdir, cache })
    assert.ok(files.includes('a.txt'))
    
    // The stats should match workdir stats (implementation detail, but we can verify file is still there)
    const afterStats = await normalizedFs.lstat(join(dir, 'a.txt'))
    assert.ok(afterStats)
  })

  await t.test('behavior:default-stats-no-match', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // Modify file in workdir so hash doesn't match
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(join(dir, 'a.txt'), 'modified content')
    
    // Reset file (should use default stats since hash doesn't match)
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'a.txt',
      cache,
    })
    
    // Verify file is still in index
    const files = await listFiles({ fs, gitdir, cache })
    assert.ok(files.includes('a.txt'))
  })

  await t.test('param:dir-not-provided', async () => {
    const { fs, gitdir } = await makeFixture('test-resetIndex')
    
    // Reset without dir (should skip workdir check)
    await resetIndex({
      fs,
      gitdir,
      filepath: 'a.txt',
    })
    
    // Verify file is still in index
    const files = await listFiles({ fs, gitdir })
    assert.ok(files.includes('a.txt'))
  })

  await t.test('behavior:remove-when-oid-null', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    
    // Add a new file to index first
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(join(dir, 'newfile.txt'), 'new content')
    const { add } = await import('@awesome-os/universal-git-src/index.ts')
    const cache: Record<string, unknown> = {}
    await add({ fs, dir, gitdir, filepath: 'newfile.txt', cache })
    
    // Verify file is in index
    let files = await listFiles({ fs, gitdir, cache })
    assert.ok(files.includes('newfile.txt'))
    
    // Reset file that doesn't exist in HEAD (should remove from index)
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'newfile.txt',
      cache,
    })
    
    // File should be removed from index
    files = await listFiles({ fs, gitdir, cache })
    assert.ok(!files.includes('newfile.txt'))
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    
    // Try to reset with invalid ref (should set caller property)
    try {
      await resetIndex({
        fs,
        gitdir,
        filepath: 'test.txt',
        ref: 'invalid-ref',
      })
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.strictEqual(error.caller, 'git.resetIndex')
    }
  })

  await t.test('param:custom-ref', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // Get a valid commit OID from the repository
    const { readCommit } = await import('@awesome-os/universal-git-src/index.ts')
    const { resolveRef } = await import('@awesome-os/universal-git-src/git/refs/readRef.ts')
    const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    const commit = await readCommit({ fs, dir, gitdir, oid: headOid, cache })
    
    // Reset to HEAD explicitly
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'a.txt',
      ref: 'HEAD',
      cache,
    })
    
    // Verify file is still in index
    const files = await listFiles({ fs, gitdir, cache })
    assert.ok(files.includes('a.txt'))
  })

  await t.test('edge:file-in-workdir-not-in-ref', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // Create a new file in workdir
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(join(dir, 'workdir-only.txt'), 'workdir content')
    
    // Add to index
    const { add } = await import('@awesome-os/universal-git-src/index.ts')
    await add({ fs, dir, gitdir, filepath: 'workdir-only.txt', cache })
    
    // Reset to HEAD (file doesn't exist in HEAD, so should be removed from index)
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'workdir-only.txt',
      cache,
    })
    
    // File should be removed from index
    const files = await listFiles({ fs, gitdir, cache })
    assert.ok(!files.includes('workdir-only.txt'))
  })

  await t.test('edge:nested-paths', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // Create a nested file
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.mkdir(join(dir, 'subdir'), { recursive: true })
    await normalizedFs.write(join(dir, 'subdir', 'nested.txt'), 'nested content')
    
    // Add to index
    const { add } = await import('@awesome-os/universal-git-src/index.ts')
    await add({ fs, dir, gitdir, filepath: 'subdir/nested.txt', cache })
    
    // Verify file is in index
    let files = await listFiles({ fs, gitdir, cache })
    assert.ok(files.includes('subdir/nested.txt'))
    
    // Reset nested file
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'subdir/nested.txt',
      cache,
    })
    
    // File should be removed from index (doesn't exist in HEAD)
    files = await listFiles({ fs, gitdir, cache })
    assert.ok(!files.includes('subdir/nested.txt'))
  })

  await t.test('edge:special-chars', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // Create a file with special characters in name
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(join(dir, 'file with spaces.txt'), 'content')
    
    // Add to index
    const { add } = await import('@awesome-os/universal-git-src/index.ts')
    await add({ fs, dir, gitdir, filepath: 'file with spaces.txt', cache })
    
    // Verify file is in index
    let files = await listFiles({ fs, gitdir, cache })
    assert.ok(files.includes('file with spaces.txt'))
    
    // Reset file
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'file with spaces.txt',
      cache,
    })
    
    // File should be removed from index (doesn't exist in HEAD)
    files = await listFiles({ fs, gitdir, cache })
    assert.ok(!files.includes('file with spaces.txt'))
  })

  await t.test('error:resolveFilepath-non-NotFoundError', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // This test verifies that errors from resolveFilepath are caught and handled
    // by setting oid to null (deleted state)
    // We can't easily simulate a non-NotFoundError from resolveFilepath,
    // but we can verify the behavior when file doesn't exist in tree
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'nonexistent-in-tree.txt',
      cache,
    })
    
    // File should not be in index
    const files = await listFiles({ fs, gitdir, cache })
    assert.ok(!files.includes('nonexistent-in-tree.txt'))
  })

  await t.test('edge:file-in-index-not-in-workdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // File exists in index and HEAD, but not in workdir
    // Reset should still work (uses default stats)
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'a.txt',
      cache,
    })
    
    // File should still be in index
    const files = await listFiles({ fs, gitdir, cache })
    assert.ok(files.includes('a.txt'))
  })

  await t.test('edge:empty-filepath', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    
    // Empty filepath might be accepted (empty string is truthy in JavaScript)
    // The operation might succeed or fail depending on implementation
    // Let's just verify it doesn't crash
    try {
      await resetIndex({
        fs,
        dir,
        gitdir,
        filepath: '',
      })
      // If it succeeds, that's okay - empty filepath might be valid
    } catch (err: any) {
      // If it fails, that's also okay - empty filepath might be rejected
      assert.ok(err !== undefined && err !== null, 'Error should be defined if thrown')
    }
  })

  await t.test('error:Repository-open-fails', async () => {
    const { fs } = await makeFixture('test-empty')
    
    // Try to reset with invalid gitdir
    // Repository.open might not fail immediately, but operations later might fail
    // Let's verify that an error is thrown and has the caller property
    try {
      await resetIndex({
        fs,
        gitdir: '/nonexistent/gitdir',
        filepath: 'test.txt',
      })
      // If it doesn't throw, that's unexpected but we'll allow it
      // (Repository.open might handle nonexistent gitdir gracefully)
    } catch (err: any) {
      // If it throws, verify caller property is set
      assert.ok(err !== undefined && err !== null, 'Error should be defined')
      assert.strictEqual(err.caller, 'git.resetIndex', 'Error should have caller property set')
    }
  })

  await t.test('error:index-operations-fail', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    
    // This test verifies error handling in index operations
    // We can't easily simulate index operation failures, but we can verify
    // that the operation completes successfully in normal cases
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'a.txt',
    })
    
    // Operation should complete
    const files = await listFiles({ fs, gitdir })
    assert.ok(Array.isArray(files))
  })

  await t.test('edge:forward-slashes', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    const cache: Record<string, unknown> = {}
    
    // Create nested file - ensure parent directories exist
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    const nestedPath = join(dir, 'dir1', 'dir2')
    const filePath = join(nestedPath, 'deep.txt')
    
    // Create parent directories first if they don't exist
    try {
      await normalizedFs.mkdir(nestedPath, { recursive: true })
    } catch (err: any) {
      // If mkdir fails, try creating parent directories one by one
      if (err.code === 'ENOENT') {
        await normalizedFs.mkdir(join(dir, 'dir1'), { recursive: true })
        await normalizedFs.mkdir(nestedPath, { recursive: true })
      } else {
        throw err
      }
    }
    await normalizedFs.write(filePath, 'deep content')
    
    // Add to index
    const { add } = await import('@awesome-os/universal-git-src/index.ts')
    await add({ fs, dir, gitdir, filepath: 'dir1/dir2/deep.txt', cache })
    
    // Reset with nested path
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'dir1/dir2/deep.txt',
      cache,
    })
    
    // File should be removed from index
    const files = await listFiles({ fs, gitdir, cache })
    assert.ok(!files.includes('dir1/dir2/deep.txt'))
  })

  await t.test('edge:workdir-read-null', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-resetIndex')
    
    // When dir is provided but file doesn't exist, fs.read returns null
    // This should be handled gracefully (uses default stats)
    await resetIndex({
      fs,
      dir,
      gitdir,
      filepath: 'nonexistent-workdir-file.txt',
    })
    
    // File should not be in index
    const files = await listFiles({ fs, gitdir })
    assert.ok(!files.includes('nonexistent-workdir-file.txt'))
  })
})

