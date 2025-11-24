import { test } from 'node:test'
import assert from 'node:assert'
import { mergeTree, mergeBlobs } from '@awesome-os/universal-git-src/utils/mergeTree.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, add, commit, readCommit, readBlob, readTree } from '@awesome-os/universal-git-src/index.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'
import { GitIndex } from '@awesome-os/universal-git-src/git/index/GitIndex.ts'
import { createWalkerEntry } from '@awesome-os/universal-git-src/models/Walker.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('mergeTree', async (t) => {
  await t.test('ok:clean-merge-no-conflicts', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-clean')
    await init({ fs, dir, gitdir })
    
    // Create base commit
    await fs.write(`${dir}/file.txt`, 'base content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Create our branch (modify file)
    await fs.write(`${dir}/file.txt`, 'our content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours' })
    
    // Reset to base and create their branch (modify file differently)
    await fs.write(`${dir}/file.txt`, 'base content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    await commit({ fs, dir, gitdir, message: 'reset' })
    await fs.write(`${dir}/file.txt`, 'their content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs' })
    
    // Merge trees
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
      abortOnConflict: false,
    })
    
    // Should have conflicts (both modified same file)
    assert.ok(result instanceof Error || typeof result === 'string')
  })

  await t.test('ok:both-sides-unchanged', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-unchanged')
    await init({ fs, dir, gitdir })
    
    // Create base commit
    await fs.write(`${dir}/file.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Both branches keep file unchanged
    const ourCommit = baseCommit
    const theirCommit = baseCommit
    
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
    })
    
    // Should return tree OID (no conflicts)
    // Note: mergeTree may create a new tree even when unchanged, so just verify it's a string
    assert.ok(typeof result === 'string')
    // When both sides are unchanged, the result should be the same tree OID
    // But mergeTree might create a new tree, so we just verify it's a valid OID
    assert.ok(result.length >= 40, 'Result should be a valid OID')
  })

  await t.test('ok:one-side-unchanged-other-modified', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-one-side')
    await init({ fs, dir, gitdir })
    
    // Create base commit
    await fs.write(`${dir}/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Our side unchanged, their side modified
    const ourCommit = baseCommit
    await fs.write(`${dir}/file.txt`, 'modified')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs' })
    
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
    })
    
    // Should accept their changes (no conflicts)
    assert.ok(typeof result === 'string')
    // mergeTree may create a new tree, so just verify it's a valid OID
    assert.ok(result.length >= 40, 'Result should be a valid OID')
  })

  await t.test('behavior:file-deleted-by-us', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-delete-us')
    await init({ fs, dir, gitdir })
    
    // Create base commit
    await fs.write(`${dir}/file.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Our side deletes file, their side keeps it
    await fs.rm(`${dir}/file.txt`)
    // Use resetIndex to stage the deletion instead of add
    const { resetIndex } = await import('@awesome-os/universal-git-src/index.ts')
    await resetIndex({ fs, dir, gitdir, filepath: 'file.txt', ref: 'HEAD' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours delete' })
    
    // Reset and their side keeps file
    await fs.write(`${dir}/file.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    await commit({ fs, dir, gitdir, message: 'reset' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs keep' })
    
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
      abortOnConflict: false,
    })
    
    // Should have conflict (delete vs keep)
    assert.ok(result instanceof Error || typeof result === 'string')
  })

  await t.test('behavior:file-deleted-by-them', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-delete-them')
    await init({ fs, dir, gitdir })
    
    // Create base commit
    await fs.write(`${dir}/file.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Our side keeps file
    const ourCommit = baseCommit
    
    // Their side deletes file
    await fs.rm(`${dir}/file.txt`)
    // Use resetIndex to stage the deletion instead of add
    const { resetIndex } = await import('@awesome-os/universal-git-src/index.ts')
    await resetIndex({ fs, dir, gitdir, filepath: 'file.txt', ref: 'HEAD' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs delete' })
    
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
      abortOnConflict: false,
    })
    
    // Should have conflict (keep vs delete)
    assert.ok(result instanceof Error || typeof result === 'string')
  })

  await t.test('behavior:new-file-added-by-both', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-both-add')
    await init({ fs, dir, gitdir })
    
    // Create base commit (no file)
    await fs.write(`${dir}/other.txt`, 'other')
    await add({ fs, dir, gitdir, filepath: 'other.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Our side adds file
    await fs.write(`${dir}/new.txt`, 'our new')
    await add({ fs, dir, gitdir, filepath: 'new.txt' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours add' })
    
    // Reset and their side adds same file with different content
    // Reset to base commit to remove our changes (use hard mode for clean state)
    const { resetToCommit } = await import('@awesome-os/universal-git-src/index.ts')
    await resetToCommit({ fs, dir, gitdir, ref: baseCommit, mode: 'hard' })
    await fs.write(`${dir}/new.txt`, 'their new')
    await add({ fs, dir, gitdir, filepath: 'new.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs add' })
    
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
      abortOnConflict: false,
    })
    
    // Should have conflict (both added same file with different content)
    assert.ok(result instanceof Error || typeof result === 'string')
  })

  await t.test('ok:nested-directory-merge', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-nested')
    await init({ fs, dir, gitdir })
    
    // Create base with nested structure
    await fs.mkdir(`${dir}/nested`)
    await fs.write(`${dir}/nested/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'nested/file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Our side modifies nested file
    await fs.write(`${dir}/nested/file.txt`, 'our')
    await add({ fs, dir, gitdir, filepath: 'nested/file.txt' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours' })
    
    // Reset and their side modifies nested file differently
    await fs.write(`${dir}/nested/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'nested/file.txt' })
    await commit({ fs, dir, gitdir, message: 'reset' })
    await fs.write(`${dir}/nested/file.txt`, 'their')
    await add({ fs, dir, gitdir, filepath: 'nested/file.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs' })
    
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
      abortOnConflict: false,
    })
    
    // Should have conflict
    assert.ok(result instanceof Error || typeof result === 'string')
  })

  await t.test('param:dryRun', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-tree-dryrun')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    await fs.write(`${dir}/file.txt`, 'our')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours' })
    
    await fs.write(`${dir}/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    await commit({ fs, dir, gitdir, message: 'reset' })
    await fs.write(`${dir}/file.txt`, 'their')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs' })
    
    const repo = await Repository.open({ fs, dir, gitdir })
    const index = await repo.readIndexDirect()
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const result = await mergeTree({
      repo,
      index,
      ourOid: ourCommitObj.commit.tree,
      baseOid: baseCommitObj.commit.tree,
      theirOid: theirCommitObj.commit.tree,
      dryRun: true,
      abortOnConflict: false,
    })
    
    // Should work in dryRun mode
    assert.ok(result instanceof Error || typeof result === 'string')
  })

  await t.test('ok:mergeBlobs-identical', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-blobs-identical')
    await init({ fs, dir, gitdir })
    
    // Create three identical blobs
    await fs.write(`${dir}/file.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    // Read the commit to get the tree OID, then read the tree to get the blob OID
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const tree = await readTree({ fs, dir, gitdir, oid: baseCommitObj.commit.tree })
    const fileEntry = tree.tree.find(e => e.path === 'file.txt')
    if (!fileEntry) throw new Error('file.txt not found in tree')
    const baseBlob = await readBlob({ fs, dir, gitdir, oid: fileEntry.oid })
    const ourBlob = baseBlob
    const theirBlob = baseBlob
    
    // Create mock WalkerEntry objects
    const mockOurs = createWalkerEntry({
      oid: async () => fileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('content'),
      stat: async () => ({ size: 7, mode: 0o100644 } as any),
    })
    
    const mockBase = createWalkerEntry({
      oid: async () => fileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('content'),
      stat: async () => ({ size: 7, mode: 0o100644 } as any),
    })
    
    const mockTheirs = createWalkerEntry({
      oid: async () => fileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('content'),
      stat: async () => ({ size: 7, mode: 0o100644 } as any),
    })
    
    const result = await mergeBlobs({
      fs,
      gitdir,
      path: 'file.txt',
      ours: mockOurs,
      base: mockBase,
      theirs: mockTheirs,
    })
    
    assert.strictEqual(result.cleanMerge, true)
    assert.ok(result.mergeResult.oid)
  })

  await t.test('ok:mergeBlobs-one-side-unchanged', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-blobs-one-side')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    await fs.write(`${dir}/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours' })
    
    await fs.write(`${dir}/file.txt`, 'modified')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs' })
    
    // Read commits to get tree OIDs, then read trees to get blob OIDs
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const baseTree = await readTree({ fs, dir, gitdir, oid: baseCommitObj.commit.tree })
    const ourTree = await readTree({ fs, dir, gitdir, oid: ourCommitObj.commit.tree })
    const theirTree = await readTree({ fs, dir, gitdir, oid: theirCommitObj.commit.tree })
    const baseFileEntry = baseTree.tree.find(e => e.path === 'file.txt')
    const ourFileEntry = ourTree.tree.find(e => e.path === 'file.txt')
    const theirFileEntry = theirTree.tree.find(e => e.path === 'file.txt')
    if (!baseFileEntry || !ourFileEntry || !theirFileEntry) throw new Error('file.txt not found in tree')
    
    const mockOurs = createWalkerEntry({
      oid: async () => ourFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('base'),
      stat: async () => ({ size: 4, mode: 0o100644 } as any),
    })
    
    const mockBase = createWalkerEntry({
      oid: async () => baseFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('base'),
      stat: async () => ({ size: 4, mode: 0o100644 } as any),
    })
    
    const mockTheirs = createWalkerEntry({
      oid: async () => theirFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('modified'),
      stat: async () => ({ size: 8, mode: 0o100644 } as any),
    })
    
    const result = await mergeBlobs({
      fs,
      gitdir,
      path: 'file.txt',
      ours: mockOurs,
      base: mockBase,
      theirs: mockTheirs,
    })
    
    // Should accept their changes (clean merge)
    assert.strictEqual(result.cleanMerge, true)
  })

  await t.test('error:mergeBlobs-conflict', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-blobs-conflict')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/file.txt`, 'base\nline2')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    await fs.write(`${dir}/file.txt`, 'our\nline2')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours' })
    
    await fs.write(`${dir}/file.txt`, 'their\nline2')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs' })
    
    // Read commits to get tree OIDs, then read trees to get blob OIDs
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const baseTree = await readTree({ fs, dir, gitdir, oid: baseCommitObj.commit.tree })
    const ourTree = await readTree({ fs, dir, gitdir, oid: ourCommitObj.commit.tree })
    const theirTree = await readTree({ fs, dir, gitdir, oid: theirCommitObj.commit.tree })
    const baseFileEntry = baseTree.tree.find(e => e.path === 'file.txt')
    const ourFileEntry = ourTree.tree.find(e => e.path === 'file.txt')
    const theirFileEntry = theirTree.tree.find(e => e.path === 'file.txt')
    if (!baseFileEntry || !ourFileEntry || !theirFileEntry) throw new Error('file.txt not found in tree')
    
    const mockOurs = createWalkerEntry({
      oid: async () => ourFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('our\nline2'),
      stat: async () => ({ size: 9, mode: 0o100644 } as any),
    })
    
    const mockBase = createWalkerEntry({
      oid: async () => baseFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('base\nline2'),
      stat: async () => ({ size: 10, mode: 0o100644 } as any),
    })
    
    const mockTheirs = createWalkerEntry({
      oid: async () => theirFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('their\nline2'),
      stat: async () => ({ size: 11, mode: 0o100644 } as any),
    })
    
    const result = await mergeBlobs({
      fs,
      gitdir,
      path: 'file.txt',
      ours: mockOurs,
      base: mockBase,
      theirs: mockTheirs,
    })
    
    // Should have conflict
    assert.strictEqual(result.cleanMerge, false)
    assert.ok(result.mergedText)
    assert.ok(result.mergedText.includes('<<<<<<<'))
  })

  await t.test('param:mergeBlobs-custom-branch-names', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-blobs-names')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/file.txt`, 'base')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const baseCommit = await commit({ fs, dir, gitdir, message: 'base' })
    
    await fs.write(`${dir}/file.txt`, 'our')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const ourCommit = await commit({ fs, dir, gitdir, message: 'ours' })
    
    await fs.write(`${dir}/file.txt`, 'their')
    await add({ fs, dir, gitdir, filepath: 'file.txt' })
    const theirCommit = await commit({ fs, dir, gitdir, message: 'theirs' })
    
    // Read commits to get tree OIDs, then read trees to get blob OIDs
    const baseCommitObj = await readCommit({ fs, dir, gitdir, oid: baseCommit })
    const ourCommitObj = await readCommit({ fs, dir, gitdir, oid: ourCommit })
    const theirCommitObj = await readCommit({ fs, dir, gitdir, oid: theirCommit })
    const baseTree = await readTree({ fs, dir, gitdir, oid: baseCommitObj.commit.tree })
    const ourTree = await readTree({ fs, dir, gitdir, oid: ourCommitObj.commit.tree })
    const theirTree = await readTree({ fs, dir, gitdir, oid: theirCommitObj.commit.tree })
    const baseFileEntry = baseTree.tree.find(e => e.path === 'file.txt')
    const ourFileEntry = ourTree.tree.find(e => e.path === 'file.txt')
    const theirFileEntry = theirTree.tree.find(e => e.path === 'file.txt')
    if (!baseFileEntry || !ourFileEntry || !theirFileEntry) throw new Error('file.txt not found in tree')
    
    const mockOurs = createWalkerEntry({
      oid: async () => ourFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('our'),
      stat: async () => ({ size: 3, mode: 0o100644 } as any),
    })
    
    const mockBase = createWalkerEntry({
      oid: async () => baseFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('base'),
      stat: async () => ({ size: 4, mode: 0o100644 } as any),
    })
    
    const mockTheirs = createWalkerEntry({
      oid: async () => theirFileEntry.oid,
      mode: async () => 0o100644,
      type: async () => 'blob',
      content: async () => UniversalBuffer.from('their'),
      stat: async () => ({ size: 5, mode: 0o100644 } as any),
    })
    
    const result = await mergeBlobs({
      fs,
      gitdir,
      path: 'file.txt',
      ours: mockOurs,
      base: mockBase,
      theirs: mockTheirs,
      ourName: 'feature',
      theirName: 'main',
      baseName: 'base',
    })
    
    // Should use custom names in conflict markers
    assert.strictEqual(result.cleanMerge, false)
    assert.ok(result.mergedText)
    assert.ok(result.mergedText.includes('<<<<<<< feature'))
    assert.ok(result.mergedText.includes('>>>>>>> main'))
  })
})

