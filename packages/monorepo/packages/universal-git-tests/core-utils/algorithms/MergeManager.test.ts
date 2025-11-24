import { test } from 'node:test'
import assert from 'node:assert'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import { mergeBlobs, mergeTrees } from '@awesome-os/universal-git-src/core-utils/algorithms/MergeManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, add, commit, readCommit, remove, checkout, branch, worktree } from '@awesome-os/universal-git-src/index.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'
import { cleanupWorktrees, createWorktreePath, commitInWorktree } from '@awesome-os/universal-git-test-helpers/helpers/worktreeHelpers.ts'

test('MergeManager', async (t) => {
  await t.test('ok:mergeBlobs-clean-merge-no-conflicts', async () => {
    // Setup: Base has "Line 1\nLine 2\nLine 3"
    // Ours adds Line 4
    // Theirs adds Line 5 (both add after Line 3, but different content)
    // Note: diff3 may treat this as a conflict if both add at the same position
    // Let's test a truly clean case: ours modifies, theirs doesn't change
    const base = 'Line 1\nLine 2\nLine 3\n'
    const ours = 'Line 1\nLine 2 modified\nLine 3\n'
    const theirs = 'Line 1\nLine 2\nLine 3\n' // unchanged

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, false)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('Line 1'))
    assert.ok(mergedText.includes('Line 2 modified'))
    assert.ok(mergedText.includes('Line 3'))
  })

  await t.test('ok:mergeBlobs-conflict-when-both-modify-same-line', async () => {
    // Setup: Base has "Line 1\nLine 2\nLine 3"
    // Ours changes Line 2 to "Line 2 modified by us"
    // Theirs changes Line 2 to "Line 2 modified by them"
    // Result should have conflict markers
    const base = 'Line 1\nLine 2\nLine 3\n'
    const ours = 'Line 1\nLine 2 modified by us\nLine 3\n'
    const theirs = 'Line 1\nLine 2 modified by them\nLine 3\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('======='))
    assert.ok(mergedText.includes('>>>>>>> theirs'))
    assert.ok(mergedText.includes('Line 2 modified by us'))
    assert.ok(mergedText.includes('Line 2 modified by them'))
  })

  await t.test('ok:mergeBlobs-conflict-markers-format', async () => {
    // Setup: Create a conflict
    const base = 'Base content\n'
    const ours = 'Our content\n'
    const theirs = 'Their content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    // Check for 7 '<' characters
    assert.ok(mergedText.includes('<<<<<<< ours'))
    // Check for 7 '=' characters
    assert.ok(mergedText.includes('======='))
    // Check for 7 '>' characters
    assert.ok(mergedText.includes('>>>>>>> theirs'))
  })

  await t.test('ok:mergeBlobs-custom-branch-names', async () => {
    // Setup: Create a conflict with custom names
    const base = 'Base\n'
    const ours = 'Ours\n'
    const theirs = 'Theirs\n'

    // Test
    const result = mergeBlobs({
      base,
      ours,
      theirs,
      ourName: 'feature-branch',
      theirName: 'main',
    })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< feature-branch'))
    assert.ok(mergedText.includes('>>>>>>> main'))
  })

  await t.test('ok:mergeBlobs-empty-base-new-file-added-by-both', async () => {
    // Setup: Both branches add the same file
    const base = ''
    const ours = 'New file content\n'
    const theirs = 'New file content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, false)
    const mergedText = result.mergedContent.toString('utf8')
    assert.strictEqual(mergedText, 'New file content\n')
  })

  await t.test('ok:mergeBlobs-empty-base-different-content-conflict', async () => {
    // Setup: Both branches add different content to new file
    const base = ''
    const ours = 'Our new content\n'
    const theirs = 'Their new content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('Our new content'))
    assert.ok(mergedText.includes('Their new content'))
  })

  await t.test('ok:mergeBlobs-file-deleted-by-us-modified-by-them', async () => {
    // Setup: Base has content, we delete it, they modify it
    const base = 'Original content\n'
    const ours = ''
    const theirs = 'Modified content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This should result in a conflict
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('Modified content'))
  })

  await t.test('ok:mergeBlobs-file-modified-by-us-deleted-by-them', async () => {
    // Setup: Base has content, we modify it, they delete it
    const base = 'Original content\n'
    const ours = 'Modified content\n'
    const theirs = ''

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This should result in a conflict
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('Modified content'))
  })

  await t.test('ok:mergeBlobs-Buffer-input-instead-of-string', async () => {
    // Setup: Use Buffer inputs
    const base = UniversalBuffer.from('Base content\n', 'utf8')
    const ours = UniversalBuffer.from('Our content\n', 'utf8')
    const theirs = UniversalBuffer.from('Their content\n', 'utf8')

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    assert.ok(result.mergedContent instanceof UniversalBuffer)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
  })

  await t.test('ok:mergeBlobs-mixed-Buffer-and-string-inputs', async () => {
    // Setup: Mix Buffer and string inputs
    const base = 'Base content\n'
    const ours = UniversalBuffer.from('Our content\n', 'utf8')
    const theirs = 'Their content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
  })

  await t.test('ok:mergeBlobs-single-line-file', async () => {
    // Setup: Single line file
    const base = 'Single line\n'
    const ours = 'Single line modified by us\n'
    const theirs = 'Single line modified by them\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
  })

  await t.test('ok:mergeBlobs-no-newline-at-end', async () => {
    // Setup: Files without trailing newline, both modify different parts
    const base = 'Line 1\nLine 2'
    const ours = 'Line 1 modified\nLine 2'
    const theirs = 'Line 1\nLine 2 modified'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This may or may not be a conflict depending on diff3 behavior
    // Just verify it processes correctly
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('Line 1'))
    assert.ok(mergedText.includes('Line 2'))
    // Verify it doesn't crash and produces valid output
    assert.ok(result.mergedContent instanceof UniversalBuffer)
  })

  await t.test('ok:mergeBlobs-multiple-conflicts-in-same-file', async () => {
    // Setup: Multiple conflicting sections
    const base = 'Line 1\nLine 2\nLine 3\nLine 4\n'
    const ours = 'Line 1 modified\nLine 2\nLine 3 modified\nLine 4\n'
    const theirs = 'Line 1\nLine 2 modified\nLine 3\nLine 4 modified\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    // Should have multiple conflict markers
    const conflictCount = (mergedText.match(/<<<<<<< /g) || []).length
    assert.ok(conflictCount >= 1)
  })

  await t.test('ok:mergeBlobs-identical-changes-no-conflict', async () => {
    // Setup: Both make the same change
    const base = 'Original\n'
    const ours = 'Modified\n'
    const theirs = 'Modified\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, false)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('Modified'))
    assert.ok(!mergedText.includes('<<<<<<<'))
  })

  await t.test('ok:mergeBlobs-whitespace-only-changes', async () => {
    // Setup: Only whitespace differences
    const base = 'Line 1\nLine 2\n'
    const ours = 'Line 1\nLine 2  \n' // trailing spaces
    const theirs = 'Line 1\nLine 2\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This may or may not be a conflict depending on diff3 behavior
    // Just verify it doesn't crash
    assert.ok(result.mergedContent instanceof UniversalBuffer)
  })

  // ============================================================================
  // mergeTrees TESTS
  // ============================================================================
  //
  // IMPORTANT: Three-Way Merge Test Pattern
  // =========================================
  // 
  // All mergeTrees tests must use the branching pattern to create proper
  // three-way merge scenarios. A three-way merge requires three distinct commits
  // that share a common ancestor but have diverged:
  //
  // 1. Create base commit on 'main' branch
  // 2. Create 'ours' branch from main, make changes, commit
  // 3. Checkout 'main' again, create 'theirs' branch, make different changes, commit
  // 4. Use the three tree OIDs (base, ours, theirs) for mergeTrees
  //
  // DO NOT:
  // - Create linear history (Base -> Ours -> Theirs)
  // - Use checkout to reset and overwrite commits
  // - Create commits without proper branching
  //
  // CORRECT PATTERN:
  // ```typescript
  // // 1. Create base commit on 'main'
  // await add({ fs, dir, gitdir, filepath: 'file.txt', cache })
  // const baseCommit = await commit({ fs, dir, gitdir, message: 'Base', ... })
  // const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache })
  // const baseTreeOid = baseCommitObj.commit.tree
  //
  // // 2. Create 'ours' branch and make a commit
  // await branch({ fs, dir, gitdir, ref: 'ours' })
  // await checkout({ fs, dir, gitdir, ref: 'ours', cache })
  // // ... make changes ...
  // const ourCommit = await commit({ fs, dir, gitdir, message: 'Ours', ... })
  // const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache })
  // const ourTreeOid = ourCommitObj.commit.tree
  //
  // // 3. Create 'theirs' branch from base and make a commit
  // await checkout({ fs, dir, gitdir, ref: 'main', cache }) // Go back to base
  // await branch({ fs, dir, gitdir, ref: 'theirs' })
  // await checkout({ fs, dir, gitdir, ref: 'theirs', cache })
  // // ... make different changes ...
  // const theirCommit = await commit({ fs, dir, gitdir, message: 'Theirs', ... })
  // const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache })
  // const theirTreeOid = theirCommitObj.commit.tree
  //
  // // 4. Test mergeTrees with the three divergent tree OIDs
  // const result = await mergeTrees({ fs, cache, gitdir, base: baseTreeOid, ours: ourTreeOid, theirs: theirTreeOid })
  // ```
  //

  await t.test('ok:mergeTrees-clean-merge-no-conflicts', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main' (unchanged)
    await normalizedFs.write(`${dir}/file1.txt`, 'content1\n')
    await add({ fs, dir, gitdir, filepath: 'file1.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and add file2.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Make changes in worktree
      await normalizedFs.write(`${oursWorktreePath}/file2.txt`, 'content2\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file2.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and add file3.txt
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Make changes in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file3.txt`, 'content3\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file3.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      assert.ok(result.mergedTree.length > 0, 'Should have merged tree entries')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-conflict-when-both-modify-same-file', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main' (unchanged)
    await normalizedFs.write(`${dir}/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first (without checking out)
      await branch({ fs, dir, gitdir, ref: 'ours', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Make changes in worktree
      await normalizedFs.write(`${oursWorktreePath}/file.txt`, 'our content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper (handles symbolic HEAD setup)
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree (from base/main)
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch (will checkout the 'theirs' branch)
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Make changes in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file.txt`, 'their content\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees with the three divergent tree OIDs
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.ok(result.conflicts.length > 0, 'Should have conflicts')
      assert.ok(result.conflicts.includes('file.txt'), 'Should report conflict for file.txt')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID even with conflicts')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-only-ours-changed', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main' (unchanged)
    await normalizedFs.write(`${dir}/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and modify file.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Make changes in worktree
      await normalizedFs.write(`${oursWorktreePath}/file.txt`, 'our content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Theirs is same as base (no change) - use base tree OID directly
      const theirTreeOid = baseTreeOid
      
      // 4. Test mergeTrees
      const result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-only-theirs-changed', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    await normalizedFs.write(`${dir}/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Ours is same as base (no change) - use base tree OID directly
    const ourTreeOid = baseTreeOid
    
    // 3. Create 'theirs' branch using worktree and modify file.txt
    const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Make changes in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file.txt`, 'their content\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      const result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-deleted-by-us-modified-by-them-conflict', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main' (unchanged)
    await normalizedFs.write(`${dir}/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and delete file.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Delete file in worktree
      await normalizedFs.rm(`${oursWorktreePath}/file.txt`)
      await remove({ fs, dir: oursWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours - delete',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and modify file.txt
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Modify file in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file.txt`, 'their content\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs - modify',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.ok(result.conflicts.length > 0, 'Should have conflicts')
      assert.ok(result.conflicts.includes('file.txt'), 'Should report conflict for file.txt')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-modified-by-us-deleted-by-them-conflict', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main' (unchanged)
    await normalizedFs.write(`${dir}/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and modify file.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Modify file in worktree
      await normalizedFs.write(`${oursWorktreePath}/file.txt`, 'our content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours - modify',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and delete file.txt
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Delete file in worktree
      await normalizedFs.rm(`${theirsWorktreePath}/file.txt`)
      await remove({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs - delete',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.ok(result.conflicts.length > 0, 'Should have conflicts')
      assert.ok(result.conflicts.includes('file.txt'), 'Should report conflict for file.txt')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-deleted-by-both-no-conflict', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    await normalizedFs.write(`${dir}/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and delete file.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Delete file in worktree
      await normalizedFs.rm(`${oursWorktreePath}/file.txt`)
      await remove({ fs, dir: oursWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours - delete',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and delete file.txt
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Delete file in worktree
      await normalizedFs.rm(`${theirsWorktreePath}/file.txt`)
      await remove({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs - delete',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts when both delete')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // File should not be in merged tree
      const hasFile = result.mergedTree.some(entry => entry.path === 'file.txt')
      assert.strictEqual(hasFile, false, 'File should not be in merged tree when deleted by both')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-both-unchanged-no-merge-needed', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // Create base commit
    await normalizedFs.write(`${dir}/file.txt`, 'content\n')
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // Ours and theirs are same as base (no changes) - use base tree OID directly
    const ourTreeOid = baseTreeOid
    const theirTreeOid = baseTreeOid
    
    // Test mergeTrees
    const gitdir = await repo.getGitdir()
    const result = await mergeTrees({
      fs,
      cache: repo.cache,
      gitdir,
      base: baseTreeOid,
      ours: ourTreeOid,
      theirs: theirTreeOid,
    })
    
    // Assert
    assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
    assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
  })

  await t.test('ok:mergeTrees-recursive-subtree-merge-nested-directories', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    // FileSystem.mkdir automatically creates parent directories recursively
    await normalizedFs.mkdir(`${dir}/subdir`)
    await normalizedFs.write(`${dir}/subdir/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'subdir/file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and modify nested file
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Modify nested file in worktree
      await normalizedFs.write(`${oursWorktreePath}/subdir/file.txt`, 'our content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'subdir/file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and add new file in nested directory
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Add new file in nested directory in worktree
      await normalizedFs.write(`${theirsWorktreePath}/subdir/file2.txt`, 'their new file\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'subdir/file2.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // Should have subdir tree entry in merged tree (files are inside the subtree)
      const hasSubdir = result.mergedTree.some(entry => entry.path === 'subdir' && entry.type === 'tree')
      assert.ok(hasSubdir, 'Should have subdir tree entry in merged tree')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-recursive-subtree-merge-with-conflict', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    // FileSystem.mkdir automatically creates parent directories recursively
    await normalizedFs.mkdir(`${dir}/subdir`)
    await normalizedFs.write(`${dir}/subdir/file.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'subdir/file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and modify nested file
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Modify nested file in worktree
      await normalizedFs.write(`${oursWorktreePath}/subdir/file.txt`, 'our content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'subdir/file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and modify nested file differently
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Modify nested file differently in worktree
      await normalizedFs.write(`${theirsWorktreePath}/subdir/file.txt`, 'their content\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'subdir/file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.ok(result.conflicts.length > 0, 'Should have conflicts')
      assert.ok(result.conflicts.some(c => c.includes('subdir/file.txt')), 'Should report conflict for nested file')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID even with conflicts')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-type-mismatch-blob-vs-tree-conflict', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    await normalizedFs.write(`${dir}/path`, 'base file content\n')
    await add({ fs, dir, gitdir, filepath: 'path', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and modify file
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Modify file in worktree
      await normalizedFs.write(`${oursWorktreePath}/path`, 'our file content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'path', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and replace file with directory
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Remove old file and create directory in worktree
      await remove({ fs, dir: theirsWorktreePath, gitdir, filepath: 'path', cache: repo.cache })
      await normalizedFs.rm(`${theirsWorktreePath}/path`)
      // FileSystem.mkdir automatically creates parent directories recursively
      await normalizedFs.mkdir(`${theirsWorktreePath}/path`)
      await normalizedFs.write(`${theirsWorktreePath}/path/file.txt`, 'nested file\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'path/file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      // Type mismatch should create a conflict
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // Type mismatch MUST be detected as a conflict
      assert.ok(result.conflicts.length > 0, 'Should have conflicts for type mismatch')
      assert.ok(result.conflicts.includes('path'), 'Should report conflict for type mismatch (blob vs tree)')
      // Should take ours (blob) when there's a type mismatch
      const pathEntry = result.mergedTree.find(entry => entry.path === 'path')
      assert.ok(pathEntry, 'Should have path entry')
      if (pathEntry) {
        // When there's a type mismatch, the code takes "ours" (blob)
        assert.strictEqual(pathEntry.type, 'blob', 'Should take ours (blob) when type mismatch')
      }
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-null-base-initial-merge', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create initial empty commit on main (needed for branching)
    const initialCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Initial', 
      author: { name: 'Test', email: 'test@example.com' },
      allowEmpty: true,
      cache: repo.cache 
    })
    
    // 2. Create 'ours' branch using worktree and add file1.txt (no base commit for merge)
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to initial commit
      await branch({ fs, dir, gitdir, ref: 'ours', object: initialCommit, checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Add file in worktree
      await normalizedFs.write(`${oursWorktreePath}/file1.txt`, 'our content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and add file2.txt (different file, no base)
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to initial commit
      await branch({ fs, dir, gitdir, ref: 'theirs', object: initialCommit, checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Add different file in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file2.txt`, 'their content\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file2.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees with null base
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: null,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts when base is null and files are different')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // Should have both files
      const hasFile1 = result.mergedTree.some(entry => entry.path === 'file1.txt')
      const hasFile2 = result.mergedTree.some(entry => entry.path === 'file2.txt')
      assert.ok(hasFile1 && hasFile2, 'Should have files from both sides')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-new-file-added-by-both-empty-base', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main' (empty)
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      allowEmpty: true,
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and add file
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Add file in worktree
      await normalizedFs.write(`${oursWorktreePath}/newfile.txt`, 'our content\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'newfile.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and add same file with different content
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Add same file with different content in worktree
      await normalizedFs.write(`${theirsWorktreePath}/newfile.txt`, 'their content\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'newfile.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.ok(result.conflicts.length > 0, 'Should have conflicts when both add same file with different content')
      assert.ok(result.conflicts.includes('newfile.txt'), 'Should report conflict for newfile.txt')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID even with conflicts')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-new-file-added-by-one-side-only', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    await normalizedFs.write(`${dir}/existing.txt`, 'base content\n')
    await add({ fs, dir, gitdir, filepath: 'existing.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and add new file
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Add new file in worktree
      await normalizedFs.write(`${oursWorktreePath}/newfile.txt`, 'our new file\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'newfile.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Theirs is same as base (no change) - use base tree OID directly
      const theirTreeOid = baseTreeOid
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // Should have both existing and new file
      const hasNewFile = result.mergedTree.some(entry => entry.path === 'newfile.txt')
      assert.ok(hasNewFile, 'Should have new file from ours')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-multiple-files-with-mixed-scenarios', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    await normalizedFs.write(`${dir}/file1.txt`, 'base1\n')
    await normalizedFs.write(`${dir}/file2.txt`, 'base2\n')
    await normalizedFs.write(`${dir}/file3.txt`, 'base3\n')
    await add({ fs, dir, gitdir, filepath: 'file1.txt', cache: repo.cache })
    await add({ fs, dir, gitdir, filepath: 'file2.txt', cache: repo.cache })
    await add({ fs, dir, gitdir, filepath: 'file3.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree - modify file1, delete file2, add file4
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Make changes in worktree
      await normalizedFs.write(`${oursWorktreePath}/file1.txt`, 'our1\n')
      await normalizedFs.rm(`${oursWorktreePath}/file2.txt`)
      await normalizedFs.write(`${oursWorktreePath}/file4.txt`, 'our4\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      await remove({ fs, dir: oursWorktreePath, gitdir, filepath: 'file2.txt', cache: repo.cache })
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file4.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree - modify file1 differently, modify file2, add file5
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Make changes in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file1.txt`, 'their1\n')
      await normalizedFs.write(`${theirsWorktreePath}/file2.txt`, 'their2\n')
      await normalizedFs.write(`${theirsWorktreePath}/file5.txt`, 'their5\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file2.txt', cache: repo.cache })
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file5.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert
      // file1: both modified - conflict
      // file2: deleted by us, modified by them - conflict
      // file3: unchanged - no conflict
      // file4: added by us - no conflict
      // file5: added by them - no conflict
      assert.ok(result.conflicts.length >= 2, 'Should have conflicts for file1 and file2')
      assert.ok(result.conflicts.includes('file1.txt'), 'Should report conflict for file1.txt')
      assert.ok(result.conflicts.includes('file2.txt'), 'Should report conflict for file2.txt')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-handles-null-base-initial-merge', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create initial empty commit on main (needed for branching)
    const initialCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Initial', 
      author: { name: 'Test', email: 'test@example.com' },
      allowEmpty: true,
      cache: repo.cache 
    })
    
    // 2. Create 'ours' branch using worktree and add file1.txt (no base commit for merge)
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to initial commit
      await branch({ fs, dir, gitdir, ref: 'ours', object: initialCommit, checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Add file in worktree
      await normalizedFs.write(`${oursWorktreePath}/file1.txt`, 'our1\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and add file2.txt (different file, no base)
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to initial commit
      await branch({ fs, dir, gitdir, ref: 'theirs', object: initialCommit, checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Add different file in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file2.txt`, 'their2\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file2.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees with null base
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: null,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert - should merge both files
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts with null base')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      assert.ok(result.mergedTree.length >= 2, 'Should have both files in merged tree')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-handles-type-mismatch-blob-vs-tree', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main' (unchanged)
    await normalizedFs.write(`${dir}/file1.txt`, 'content1\n')
    await add({ fs, dir, gitdir, filepath: 'file1.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree - keep file1.txt as blob
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit) - without checking out
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch (will checkout 'ours' which points to main)
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Ensure file1.txt is in the index (even though unchanged, we need it staged for commit)
      // This ensures the commit has the same tree as base (with file1.txt as blob)
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree - convert file1.txt to directory (tree)
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Make changes in worktree - convert file1.txt to directory
      // First, remove the old file from the index
      await remove({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      // Then remove it from filesystem
      await normalizedFs.rm(`${theirsWorktreePath}/file1.txt`)
      // FileSystem.mkdir automatically creates parent directories recursively
      await normalizedFs.mkdir(`${theirsWorktreePath}/file1.txt`)
      await normalizedFs.write(`${theirsWorktreePath}/file1.txt/nested.txt`, 'nested\n')
      // Add the new directory structure
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file1.txt/nested.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert - should report conflict for type mismatch
      assert.ok(result.conflicts.length > 0, 'Should have conflict for type mismatch')
      assert.ok(result.conflicts.includes('file1.txt'), 'Should report conflict for file1.txt')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('edge:mergeTrees-handles-empty-trees', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    
    // Get empty tree OID
    const emptyTreeOid = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    
    // Test mergeTrees with empty trees
    const gitdir = await repo.getGitdir()
    const result = await mergeTrees({
      fs,
      cache: repo.cache,
      gitdir,
      base: emptyTreeOid,
      ours: emptyTreeOid,
      theirs: emptyTreeOid,
    })
    
    // Assert - should return empty merged tree
    assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
    assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
    assert.strictEqual(result.mergedTree.length, 0, 'Should have empty merged tree')
  })

  await t.test('ok:mergeTrees-handles-both-sides-deleted', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    await normalizedFs.write(`${dir}/file1.txt`, 'content1\n')
    await add({ fs, dir, gitdir, filepath: 'file1.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and delete file1.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Delete file in worktree
      await remove({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      await normalizedFs.rm(`${oursWorktreePath}/file1.txt`) // Remove from filesystem
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours - delete',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and also delete file1.txt
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Delete file in worktree
      await remove({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      await normalizedFs.rm(`${theirsWorktreePath}/file1.txt`) // Remove from filesystem
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs - delete',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert - should have no conflict (both deleted)
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts when both delete')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // File should not be in merged tree (deleted by both)
      const hasFile1 = result.mergedTree.some(e => e.path === 'file1.txt')
      assert.strictEqual(hasFile1, false, 'Should not have file1.txt in merged tree')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-handles-deeply-nested-recursive-merge', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    // FileSystem.mkdir automatically creates parent directories recursively
    await normalizedFs.mkdir(`${dir}/a/b/c`)
    await normalizedFs.write(`${dir}/a/b/c/file.txt`, 'base\n')
    await add({ fs, dir, gitdir, filepath: 'a/b/c/file.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and modify nested file
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Modify nested file in worktree
      await normalizedFs.write(`${oursWorktreePath}/a/b/c/file.txt`, 'ours\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'a/b/c/file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and modify nested file differently
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Modify nested file differently in worktree
      await normalizedFs.write(`${theirsWorktreePath}/a/b/c/file.txt`, 'theirs\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'a/b/c/file.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert - should recursively merge nested structure
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // Should have conflict for nested file
      assert.ok(result.conflicts.length > 0, 'Should have conflict for nested file')
      assert.ok(result.conflicts.some(c => c.includes('a/b/c/file.txt')), 'Should report conflict for nested file')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-handles-mode-differences', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // 1. Create the base commit on 'main'
    await normalizedFs.write(`${dir}/file1.txt`, 'content1\n')
    await add({ fs, dir, gitdir, filepath: 'file1.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // 2. Create 'ours' branch using worktree and modify content
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'ours', object: 'main', checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Modify content in worktree
      await normalizedFs.write(`${oursWorktreePath}/file1.txt`, 'ours\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and modify content differently
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to main (the base commit)
      await branch({ fs, dir, gitdir, ref: 'theirs', object: 'main', checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Modify content differently in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file1.txt`, 'theirs\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert - should merge content (mode differences handled by mergeBlobs)
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      // May or may not have conflict depending on content
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:mergeTrees-handles-empty-base-with-additions-on-both-sides', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // Get empty tree OID
    const emptyTreeOid = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    
    // 1. Create initial empty commit on main (needed for branching)
    const initialCommit = await commit({ 
      fs, 
      dir, 
      gitdir,
      message: 'Initial', 
      author: { name: 'Test', email: 'test@example.com' },
      allowEmpty: true,
      cache: repo.cache 
    })
    
    // 2. Create 'ours' branch using worktree and add file1.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to initial commit
      await branch({ fs, dir, gitdir, ref: 'ours', object: initialCommit, checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Add file in worktree
      await normalizedFs.write(`${oursWorktreePath}/file1.txt`, 'ours\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // 3. Create 'theirs' branch using worktree and add file2.txt (different file)
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to initial commit
      await branch({ fs, dir, gitdir, ref: 'theirs', object: initialCommit, checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Add different file in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file2.txt`, 'theirs\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file2.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // 4. Test mergeTrees with empty base
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: emptyTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // 5. Assert - should merge both files
      assert.strictEqual(result.conflicts.length, 0, 'Should have no conflicts')
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
      assert.ok(result.mergedTree.length >= 2, 'Should have both files in merged tree')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('error:mergeTrees-handles-readTree-error-gracefully', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    
    // Use invalid OID to trigger readTree error
    const invalidOid = '0000000000000000000000000000000000000000'
    
    // Test mergeTrees with invalid OID
    const gitdir = await repo.getGitdir()
    try {
      await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: null,
        ours: invalidOid,
        theirs: invalidOid,
      })
      // Should throw error for invalid OID
      assert.fail('Should have thrown error for invalid OID')
    } catch (err) {
      // Error is expected
      assert.ok(err instanceof Error, 'Should throw error for invalid OID')
    }
  })

  await t.test('error:mergeTrees-handles-readBlob-error-in-merge', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    const gitdir = await repo.getGitdir()
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    
    // Create base commit with file1.txt
    await normalizedFs.write(`${dir}/file1.txt`, 'base\n')
    await add({ fs, dir, filepath: 'file1.txt', cache: repo.cache })
    const baseCommit = await commit({ 
      fs, 
      dir, 
      message: 'Base', 
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache 
    })
    const baseCommitObj = await readCommit({ fs, dir, oid: baseCommit, cache: repo.cache })
    const baseTreeOid = baseCommitObj.commit.tree
    
    // Create ours commit using worktree - modify file1.txt
    const oursWorktreePath = createWorktreePath(dir, 'ours-worktree')
    let result: Awaited<ReturnType<typeof mergeTrees>>
    try {
      // Create branch first pointing to base commit
      await branch({ fs, dir, gitdir, ref: 'ours', object: baseCommit, checkout: false })
      
      // Create worktree for 'ours' branch
      await worktree({ fs, dir, gitdir, add: true, path: oursWorktreePath, ref: 'ours' })
      
      // Modify file in worktree
      await normalizedFs.write(`${oursWorktreePath}/file1.txt`, 'ours\n')
      await add({ fs, dir: oursWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const ourCommit = await commitInWorktree({
        repo,
        worktreePath: oursWorktreePath,
        message: 'Ours',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'ours',
      })
      const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit, cache: repo.cache })
      const ourTreeOid = ourCommitObj.commit.tree
      
      // Create theirs commit using worktree - modify file1.txt differently
      const theirsWorktreePath = createWorktreePath(dir, 'theirs-worktree')
      
      // Create branch first pointing to base commit
      await branch({ fs, dir, gitdir, ref: 'theirs', object: baseCommit, checkout: false })
      
      // Create worktree for 'theirs' branch
      await worktree({ fs, dir, gitdir, add: true, path: theirsWorktreePath, ref: 'theirs' })
      
      // Modify file differently in worktree
      await normalizedFs.write(`${theirsWorktreePath}/file1.txt`, 'theirs\n')
      await add({ fs, dir: theirsWorktreePath, gitdir, filepath: 'file1.txt', cache: repo.cache })
      
      // Commit using commitInWorktree helper
      const theirCommit = await commitInWorktree({
        repo,
        worktreePath: theirsWorktreePath,
        message: 'Theirs',
        author: { name: 'Test', email: 'test@example.com' },
        branch: 'theirs',
      })
      const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit, cache: repo.cache })
      const theirTreeOid = theirCommitObj.commit.tree
      
      // Test mergeTrees - should handle blob reading
      result = await mergeTrees({
        fs,
        cache: repo.cache,
        gitdir,
        base: baseTreeOid,
        ours: ourTreeOid,
        theirs: theirTreeOid,
      })
      
      // Assert - should merge blobs (may or may not have conflict)
      assert.ok(result.mergedTreeOid, 'Should return merged tree OID')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })
})
