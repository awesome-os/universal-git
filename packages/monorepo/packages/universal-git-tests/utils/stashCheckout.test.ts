import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  add,
  checkout,
  status,
  setConfig,
  stash,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { analyzeCheckout } from '@awesome-os/universal-git-src/core-utils/filesystem/WorkdirManager.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'

describe('stash checkout integration', () => {
  const addUserConfig = async (fs: any, dir: string, gitdir: string) => {
    await setConfig({ fs, dir, gitdir, path: 'user.name', value: 'stash tester' })
    await setConfig({ fs, dir, gitdir, path: 'user.email', value: 'test@stash.com' })
  }

  it('ok:restore-files-after-stash', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    const cache = {}
    
    // Get original content
    const originalContent = await fs.read(`${dir}/a.txt`)
    
    // Make changes and stage them
    await fs.write(`${dir}/a.txt`, 'staged changes - a')
    await add({ fs, dir, gitdir, filepath: 'a.txt', cache })
    
    // Verify file is staged (status might be 'modified' or 'staged' depending on implementation)
    const statusBefore = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
    assert.ok(statusBefore === 'staged' || statusBefore === 'modified', `Status should be 'staged' or 'modified', got '${statusBefore}'`)
    
    // After add, index should match the staged content, but workdir still has the staged content
    // So index OID != HEAD OID, but workdir OID == index OID
    
    // Now stash - this should:
    // 1. Create stash commit with the staged changes
    // 2. Checkout HEAD to restore files
    // 3. Reset index to match HEAD
    await stash({ fs, dir, gitdir, cache })
    
    // Verify file is restored to original content
    const restoredContent = await fs.read(`${dir}/a.txt`)
    assert.strictEqual(restoredContent.toString(), originalContent.toString(), 'File should be restored to original content after stash')
    
    // Verify status shows file is unmodified
    const statusAfter = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
    assert.strictEqual(statusAfter, 'unmodified', 'File should be unmodified after stash')
  })

  it('behavior:detect-workdir-changes-analyzeCheckout', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    const cache = {}
    
    // Get HEAD tree OID
    const { readCommit, resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    const commitResult = await readCommit({ fs, gitdir, oid: headOid })
    const treeOid = commitResult.commit.tree
    
    // Make changes and stage them (so index matches staged content, not HEAD)
    await fs.write(`${dir}/a.txt`, 'staged changes - a')
    await add({ fs, dir, gitdir, filepath: 'a.txt', cache })
    
    // Now the index has the staged content, but HEAD has the original
    // When we analyze checkout to HEAD, it should detect that:
    // - index OID != tree OID (staged content != HEAD)
    // - workdir OID != tree OID (staged content != HEAD)
    // So it should create an update operation
    
    // Read the index first, then pass it to analyzeCheckout
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    const index = await repo.readIndexDirect(false)
    
    const operations = await analyzeCheckout({
      fs,
      dir,
      gitdir,
      treeOid,
      force: true,
      cache,
      index, // Pass the index object
    })
    
    // Should have an update operation for a.txt
    const updateOp = operations.find(op => op[0] === 'update' && op[1] === 'a.txt')
    assert.ok(updateOp, 'Should have update operation for a.txt when index and workdir differ from HEAD')
  })

  it('ok:restore-files-unstaged-changes', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    const cache = {}
    
    // CRITICAL: Create Repository instance once and use it for everything
    // This ensures the same fs instance is used throughout the test
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    
    // CRITICAL: Use createFileSystem to ensure we're using the same fs instance as the Repository
    // This ensures that writes from checkout are visible to reads in the test
    const normalizedFs = createFileSystem(fs)
    
    // Get original content - use normalized fs to match checkout's fs
    const originalContent = await normalizedFs.read(`${dir}/a.txt`)
    
    // Make changes but don't stage them using normalized fs
    await normalizedFs.write(`${dir}/a.txt`, 'unstaged changes')
    
    // Verify file is modified but not staged (status might have '*' prefix)
    const statusBefore = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
    assert.ok(statusBefore === 'modified' || statusBefore === '*modified', `Status should be 'modified' or '*modified', got '${statusBefore}'`)
    
    // Now checkout with force should restore to HEAD - pass repo to ensure fs consistency
    await checkout({
      repo, // Pass Repository instance to ensure same fs instance
      fs,   // Still pass for backward compatibility
      dir,
      gitdir,
      ref: 'HEAD',
      force: true,
      cache,
    })
    
    // Verify file is restored - use normalized fs to match checkout's fs
    const restoredContent = await normalizedFs.read(`${dir}/a.txt`)
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
    
    // Verify status shows file is unmodified
    // CRITICAL: Use the same repo instance to ensure we see the updated index
    // The status API creates its own Repository instance, but we can ensure cache consistency
    // by using the same cache object and ensuring the index is written to disk
    const statusAfter = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
    assert.strictEqual(statusAfter, 'unmodified', `Expected 'unmodified', got '${statusAfter}'. File should be in HEAD after checkout.`)
  })

  it('ok:handle-stash-workdir-changes', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    const cache = {}
    
    // Get original content
    const originalContent = await fs.read(`${dir}/a.txt`)
    
    // Make unstaged changes (index still matches HEAD)
    await fs.write(`${dir}/a.txt`, 'unstaged changes')
    
    // Stash should detect the workdir changes and stash them
    await stash({ fs, dir, gitdir, cache })
    
    // Verify file is restored to original
    const restoredContent = await fs.read(`${dir}/a.txt`)
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
    
    // Verify status
    const statusAfter = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
    assert.strictEqual(statusAfter, 'unmodified')
  })
})

