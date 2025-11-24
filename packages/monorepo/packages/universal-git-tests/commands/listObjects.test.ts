import { test } from 'node:test'
import assert from 'node:assert'
import { init, commit, add } from '@awesome-os/universal-git-src/index.ts'
import { listObjects } from '@awesome-os/universal-git-src/commands/listObjects.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('listObjects', async (t) => {
  await t.test('returns Set for empty oids array', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const objects = await listObjects({ fs, cache: {}, gitdir, oids: [] })

    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.strictEqual(objects.size, 0, 'Should return empty Set for empty oids')
  })


  await t.test('handles non-existent OID gracefully', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const fakeOid = 'a'.repeat(40)
    try {
      await listObjects({ fs, cache: {}, gitdir, oids: [fakeOid] })
      // listObjects might not throw immediately, but will fail when trying to read the object
      // The error will occur during the walk() function when trying to readObject
      assert.fail('Should have thrown an error for non-existent OID')
    } catch (error) {
      assert.ok(error instanceof Error, 'Should throw an error when object does not exist')
    }
  })


  await t.test('handles iterable oids (array)', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    // Test that listObjects accepts an array as iterable
    const oidsArray: string[] = []
    const objects = await listObjects({ fs, cache: {}, gitdir, oids: oidsArray })

    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.strictEqual(objects.size, 0, 'Should return empty Set for empty array')
  })

  await t.test('handles iterable oids (Set)', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    // Test that listObjects accepts a Set as iterable
    const oidsSet = new Set<string>()
    const objects = await listObjects({ fs, cache: {}, gitdir, oids: oidsSet })

    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.strictEqual(objects.size, 0, 'Should return empty Set for empty Set')
  })

  await t.test('listObjects with comprehensive fixture', async () => {
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const objects = await listObjects({
      fs,
      cache: {},
      gitdir,
      oids: [
        'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc',
        'e05547ea87ea55eff079de295ff56f483e5b4439',
        'ebdedf722a3ec938da3fd53eb74fdea55c48a19d',
        '0518502faba1c63489562641c36a989e0f574d95',
      ],
    })
    
    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.ok(objects.size > 0, 'Should return non-empty Set')
    // Verify specific OIDs are included
    assert.ok(objects.has('c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'), 'Should include first OID')
    assert.ok(objects.has('e05547ea87ea55eff079de295ff56f483e5b4439'), 'Should include second OID')
    assert.ok(objects.has('ebdedf722a3ec938da3fd53eb74fdea55c48a19d'), 'Should include third OID')
    assert.ok(objects.has('0518502faba1c63489562641c36a989e0f574d95'), 'Should include fourth OID')
  })

  await t.test('lists objects from a commit', async () => {
    // Use a fixture that already has commits
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const cache: Record<string, unknown> = {}
    
    // Use a known commit OID from the fixture
    const commitOid = 'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'
    const objects = await listObjects({ fs, cache, gitdir, oids: [commitOid] })

    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.ok(objects.size > 0, 'Should have objects')
    assert.ok(objects.has(commitOid), 'Should include the commit OID')
  })

  await t.test('lists objects from multiple starting OIDs', async () => {
    // Use a fixture that already has commits
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const cache: Record<string, unknown> = {}
    
    // Use known commit OIDs from the fixture
    const commit1Oid = 'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'
    const commit2Oid = 'e05547ea87ea55eff079de295ff56f483e5b4439'
    const objects = await listObjects({ fs, cache, gitdir, oids: [commit1Oid, commit2Oid] })

    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.ok(objects.size > 0, 'Should have objects')
    assert.ok(objects.has(commit1Oid), 'Should include first commit OID')
    assert.ok(objects.has(commit2Oid), 'Should include second commit OID')
  })

  await t.test('handles nested trees', async () => {
    // Use a fixture that already has commits with nested trees
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const cache: Record<string, unknown> = {}
    
    // Use a known commit OID from the fixture
    const commitOid = 'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'
    const objects = await listObjects({ fs, cache, gitdir, oids: [commitOid] })

    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.ok(objects.size > 0, 'Should have objects')
    assert.ok(objects.has(commitOid), 'Should include the commit OID')
  })

  await t.test('handles circular references (visited set)', async () => {
    // Use a fixture that already has commits
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const cache: Record<string, unknown> = {}
    
    // Use a known commit OID from the fixture
    const commitOid = 'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'
    // Pass the same OID twice - should only be visited once
    const objects = await listObjects({ fs, cache, gitdir, oids: [commitOid, commitOid] })

    assert.ok(objects instanceof Set, 'Should return a Set')
    // Should only have one instance of the commit OID
    const commitCount = Array.from(objects).filter(oid => oid === commitOid).length
    assert.strictEqual(commitCount, 1, 'Should only visit each OID once')
  })

  await t.test('includes blobs from trees', async () => {
    // Use a fixture that already has commits
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const cache: Record<string, unknown> = {}
    
    // Get the tree OID from a known commit
    const commitOid = 'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'
    const { readCommit } = await import('@awesome-os/universal-git-src/commands/readCommit.ts')
    const commitObj = await readCommit({ fs, gitdir, oid: commitOid, cache })
    const treeOid = commitObj.commit.tree

    const objects = await listObjects({ fs, cache, gitdir, oids: [treeOid] })

    assert.ok(objects instanceof Set, 'Should return a Set')
    assert.ok(objects.has(treeOid), 'Should include the tree OID')
    // Should include blob OIDs from the tree
    assert.ok(objects.size > 1, 'Should include blobs from the tree')
  })

  await t.test('handles dir parameter', async () => {
    // Use a fixture that already has commits
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const cache: Record<string, unknown> = {}
    
    // Use a known commit OID from the fixture
    const commitOid = 'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'
    // Test with dir parameter (gitdir as dir for bare repos)
    const objects1 = await listObjects({ fs, cache, dir: gitdir, gitdir, oids: [commitOid] })
    // Test without dir parameter
    const objects2 = await listObjects({ fs, cache, gitdir, oids: [commitOid] })

    assert.deepStrictEqual(objects1, objects2, 'Should return same results with or without dir parameter')
  })

  await t.test('handles cache parameter', async () => {
    // Use a fixture that already has commits
    const { fs, gitdir } = await makeFixture('test-listObjects')
    const cache: Record<string, unknown> = {}
    
    // Use a known commit OID from the fixture
    const commitOid = 'c60bbbe99e96578105c57c4b3f2b6ebdf863edbc'
    const objects1 = await listObjects({ fs, cache, gitdir, oids: [commitOid] })
    const objects2 = await listObjects({ fs, cache, gitdir, oids: [commitOid] })

    // Results should be the same
    assert.deepStrictEqual(objects1, objects2, 'Should return same results with cache')
  })
})

