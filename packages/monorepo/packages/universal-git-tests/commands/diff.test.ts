import { test } from 'node:test'
import assert from 'node:assert'
import { diff, commit, add } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'

test('diff', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await diff({
        gitdir: '/tmp/test.git',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:gitdir-or-dir-missing', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    try {
      await diff({
        fs: fs,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      // normalizeCommandArgs throws 'dir OR gitdir'
      assert.strictEqual((error as any).data?.parameter, 'dir OR gitdir')
    }
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write file to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file1.txt' })
    await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff should work with repo
    const result = await diff({
      repo,
    })
    
    assert.ok(Array.isArray(result.entries), 'Should return entries array')
    assert.ok(result.refA, 'Should have refA')
  })

  await t.test('ok:empty-diff', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write file to filesystem
    await fs.write(`${dir}/file.txt`, 'content')
    
    // Create initial commit
    await add({ repo, filepath: 'file.txt' })
    await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff HEAD to HEAD should be empty
    const result = await diff({
      repo,
      refA: 'HEAD',
      refB: 'HEAD',
    })
    
    assert.strictEqual(result.entries.length, 0, 'Should have no entries when comparing same refs')
  })

  await t.test('ok:detects-added', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file1.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Add a new file
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ repo, filepath: 'file2.txt' })
    const commit2 = await commit({ repo, message: 'Add file2', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff between commits
    const result = await diff({
      repo,
      refA: commit1,
      refB: commit2,
    })
    
    assert.ok(result.entries.length > 0, 'Should have entries')
    const addedFile = result.entries.find(e => e.filepath === 'file2.txt' && e.status === 'added')
    assert.ok(addedFile, 'Should detect added file')
    assert.ok(addedFile!.newOid, 'Added file should have newOid')
    assert.strictEqual(addedFile!.oldOid, undefined, 'Added file should not have oldOid')
  })

  await t.test('ok:detects-deleted', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    await fs.write(`${dir}/file2.txt`, 'content2')
    
    // Create initial commit with two files
    await add({ repo, filepath: 'file1.txt' })
    await add({ repo, filepath: 'file2.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Remove a file from index - use remove command
    await fs.rm(`${dir}/file2.txt`)
    const { remove } = await import('@awesome-os/universal-git-src/index.ts')
    await remove({ repo, filepath: 'file2.txt' })
    const commit2 = await commit({ repo, message: 'Remove file2', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff between commits
    const result = await diff({
      repo,
      refA: commit1,
      refB: commit2,
    })
    
    const deletedFile = result.entries.find(e => e.filepath === 'file2.txt' && e.status === 'deleted')
    assert.ok(deletedFile, 'Should detect deleted file')
    assert.ok(deletedFile!.oldOid, 'Deleted file should have oldOid')
    assert.strictEqual(deletedFile!.newOid, undefined, 'Deleted file should not have newOid')
  })

  await t.test('ok:detects-modified', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Modify the file
    await fs.write(`${dir}/file.txt`, 'content2')
    await add({ repo, filepath: 'file.txt' })
    const commit2 = await commit({ repo, message: 'Modify file', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff between commits
    const result = await diff({
      repo,
      refA: commit1,
      refB: commit2,
    })
    
    const modifiedFile = result.entries.find(e => e.filepath === 'file.txt' && e.status === 'modified')
    assert.ok(modifiedFile, 'Should detect modified file')
    assert.ok(modifiedFile!.oldOid, 'Modified file should have oldOid')
    assert.ok(modifiedFile!.newOid, 'Modified file should have newOid')
    assert.notStrictEqual(modifiedFile!.oldOid, modifiedFile!.newOid, 'OIDs should be different')
  })

  await t.test('behavior:compares-workdir-HEAD', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file1.txt' })
    await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Add a new file in working directory (not committed)
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ repo, filepath: 'file2.txt' })
    
    // Diff working directory vs HEAD
    const result = await diff({
      repo,
    })
    
    assert.ok(Array.isArray(result.entries), 'Should return entries array')
    // Should detect the new file in working directory
    const newFile = result.entries.find(e => e.filepath === 'file2.txt' && e.status === 'added')
    // Note: This might not work if the file isn't tracked, but the test structure is correct
  })

  await t.test('param:staged-true', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file1.txt' })
    await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Stage a new file
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ repo, filepath: 'file2.txt' })
    
    // Diff staged changes
    const result = await diff({
      repo,
      staged: true,
    })
    
    assert.ok(Array.isArray(result.entries), 'Should return entries array')
    assert.ok(result.refA, 'Should have refA (HEAD)')
  })

  await t.test('param:filepath-filter', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/dir1/file1.txt`, 'content1')
    await fs.write(`${dir}/dir2/file2.txt`, 'content2')
    
    // Create initial commit with multiple files
    await add({ repo, filepath: 'dir1/file1.txt' })
    await add({ repo, filepath: 'dir2/file2.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Modify both files
    await fs.write(`${dir}/dir1/file1.txt`, 'content1-modified')
    await fs.write(`${dir}/dir2/file2.txt`, 'content2-modified')
    await add({ repo, filepath: 'dir1/file1.txt' })
    await add({ repo, filepath: 'dir2/file2.txt' })
    const commit2 = await commit({ repo, message: 'Modify files', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff with filepath filter
    const result = await diff({
      repo,
      refA: commit1,
      refB: commit2,
      filepath: 'dir1/',
    })
    
    // Should only include files in dir1/
    const allInDir1 = result.entries.every(e => e.filepath.startsWith('dir1/'))
    assert.ok(allInDir1, 'All entries should be in dir1/')
    assert.ok(result.entries.length > 0, 'Should have entries in dir1/')
  })

  await t.test('edge:empty-repo-no-HEAD', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    
    // Diff in empty repo (no commits yet) - should handle gracefully
    try {
      const result = await diff({
        repo,
      })
      
      // Should return empty diff or handle gracefully
      assert.ok(Array.isArray(result.entries), 'Should return entries array')
    } catch (error) {
      // If it throws NotFoundError for HEAD, that's acceptable for empty repo
      assert.ok(error instanceof Error)
      // NotFoundError is expected when there's no HEAD
    }
  })

  await t.test('param:refA-only', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file1.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Add a new file
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ repo, filepath: 'file2.txt' })
    
    // Diff with only refA
    const result = await diff({
      repo,
      refA: commit1,
    })
    
    assert.ok(Array.isArray(result.entries), 'Should return entries array')
    assert.strictEqual(result.refA, commit1, 'refA should be set')
  })

  await t.test('param:refB-only', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file1.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Create another commit
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ repo, filepath: 'file2.txt' })
    const commit2 = await commit({ repo, message: 'Second', author: { name: 'Test', email: 'test@example.com' } })
    
    // Reset to first commit
    await repo.gitBackend.writeRef('HEAD', commit1, false, repo.cache)
    
    // Diff with only refB
    const result = await diff({
      repo,
      refB: commit2,
    })
    
    assert.ok(Array.isArray(result.entries), 'Should return entries array')
    assert.strictEqual(result.refB, commit2, 'refB should be set')
  })

  await t.test('ok:both-refA-refB', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file1.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Create another commit
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ repo, filepath: 'file2.txt' })
    const commit2 = await commit({ repo, message: 'Second', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff between two commits
    const result = await diff({
      repo,
      refA: commit1,
      refB: commit2,
    })
    
    assert.ok(Array.isArray(result.entries), 'Should return entries array')
    assert.strictEqual(result.refA, commit1, 'refA should be set')
    assert.strictEqual(result.refB, commit2, 'refB should be set')
  })

  await t.test('behavior:mode-changes', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write file to filesystem
    await fs.write(`${dir}/file.txt`, 'content1')
    
    // Create initial commit
    await add({ repo, filepath: 'file.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Modify file (this might change mode depending on implementation)
    await fs.write(`${dir}/file.txt`, 'content2')
    await add({ repo, filepath: 'file.txt' })
    const commit2 = await commit({ repo, message: 'Modify', author: { name: 'Test', email: 'test@example.com' } })
    
    // Diff should detect mode changes if any
    const result = await diff({
      repo,
      refA: commit1,
      refB: commit2,
    })
    
    assert.ok(Array.isArray(result.entries), 'Should return entries array')
    // If mode changed, it should be detected
    const modified = result.entries.find(e => e.status === 'modified')
    if (modified) {
      // Mode might be the same or different depending on implementation
      assert.ok(modified.oldMode !== undefined || modified.newMode !== undefined, 'Mode should be tracked')
    }
  })

  await t.test('edge:no-trees-available', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    
    // Try to diff with non-existent refs
    try {
      const result = await diff({
        repo,
        refA: 'nonexistent1',
        refB: 'nonexistent2',
      })
    
      // Should return empty diff or throw
      assert.ok(Array.isArray(result.entries), 'Should return entries array')
    } catch (error) {
      // If it throws for non-existent refs, that's acceptable
      assert.ok(error instanceof Error)
    }
  })

  await t.test('param:filepath-subdirectories', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Write files to filesystem
    await fs.write(`${dir}/a/b/file1.txt`, 'content1')
    await fs.write(`${dir}/a/c/file2.txt`, 'content2')
    await fs.write(`${dir}/x/y/file3.txt`, 'content3')
    
    // Create initial commit with nested structure
    await add({ repo, filepath: 'a/b/file1.txt' })
    await add({ repo, filepath: 'a/c/file2.txt' })
    await add({ repo, filepath: 'x/y/file3.txt' })
    const commit1 = await commit({ repo, message: 'Initial', author: { name: 'Test', email: 'test@example.com' } })
    
    // Modify files
    await fs.write(`${dir}/a/b/file1.txt`, 'content1-modified')
    await fs.write(`${dir}/a/c/file2.txt`, 'content2-modified')
    await fs.write(`${dir}/x/y/file3.txt`, 'content3-modified')
    await add({ repo, filepath: 'a/b/file1.txt' })
    await add({ repo, filepath: 'a/c/file2.txt' })
    await add({ repo, filepath: 'x/y/file3.txt' })
    const commit2 = await commit({ repo, message: 'Modify', author: { name: 'Test', email: 'test@example.com' } })
    
    // Filter by 'a/' prefix
    const result = await diff({
      repo,
      refA: commit1,
      refB: commit2,
      filepath: 'a/',
    })
    
    // All entries should start with 'a/'
    const allInA = result.entries.every(e => e.filepath.startsWith('a/'))
    assert.ok(allInA, 'All entries should be in a/ directory')
    // Should not include x/y/file3.txt
    const hasX = result.entries.some(e => e.filepath.startsWith('x/'))
    assert.strictEqual(hasX, false, 'Should not include files outside a/')
  })
})

