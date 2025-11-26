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
import { analyzeCheckout } from '@awesome-os/universal-git-src/git/worktree/WorkdirManager.ts'

describe('stash checkout integration', () => {
  const addUserConfig = async (repo: any) => {
    await setConfig({ repo, path: 'user.name', value: 'stash tester' })
    await setConfig({ repo, path: 'user.email', value: 'test@stash.com' })
  }

  it('ok:restore-files-after-stash', async () => {
    const { repo } = await makeFixture('test-stash')
    await addUserConfig(repo)
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    
    // Get original content
    const originalContent = await repo.fs.read(`${dir}/a.txt`)
    
    // Make changes and stage them
    await repo.fs.write(`${dir}/a.txt`, 'staged changes - a')
    await add({ repo, filepath: 'a.txt' })
    
    // Verify file is staged (status should be 'modified' after staging)
    const statusBefore = await status({ repo, filepath: 'a.txt' })
    assert.ok(statusBefore === 'modified', `Status should be 'modified', got '${statusBefore}'`)
    
    // After add, index should match the staged content, but workdir still has the staged content
    // So index OID != HEAD OID, but workdir OID == index OID
    
    // Now stash - this should:
    // 1. Create stash commit with the staged changes
    // 2. Checkout HEAD to restore files
    // 3. Reset index to match HEAD
    await stash({ repo })
    
    // Verify file is restored to original content
    const restoredContent = await repo.fs.read(`${dir}/a.txt`)
    assert.ok(restoredContent !== null, 'restoredContent should not be null')
    assert.ok(originalContent !== null, 'originalContent should not be null')
    assert.strictEqual(restoredContent.toString(), originalContent.toString(), 'File should be restored to original content after stash')
    
    // Verify status shows file is unmodified
    const statusAfter = await status({ repo, filepath: 'a.txt' })
    assert.strictEqual(statusAfter, 'unmodified', 'File should be unmodified after stash')
  })

  it('behavior:detect-workdir-changes-analyzeCheckout', async () => {
    const { repo } = await makeFixture('test-stash')
    await addUserConfig(repo)
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    const gitdir = await repo.getGitdir()
    
    // Get HEAD tree OID
    const { readCommit, resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const headOid = await resolveRef({ repo, ref: 'HEAD' })
    const commitResult = await readCommit({ repo, oid: headOid })
    const treeOid = commitResult.commit.tree
    
    // Make changes and stage them (so index matches staged content, not HEAD)
    await repo.fs.write(`${dir}/a.txt`, 'staged changes - a')
    await add({ repo, filepath: 'a.txt' })
    
    // Now the index has the staged content, but HEAD has the original
    // When we analyze checkout to HEAD, it should detect that:
    // - index OID != tree OID (staged content != HEAD)
    // - workdir OID != tree OID (staged content != HEAD)
    // So it should create an update operation
    
    // Read the index first, then pass it to analyzeCheckout
    const index = await repo.readIndexDirect(false)
    
    const operations = await analyzeCheckout({
      fs: repo.fs,
      dir,
      gitdir,
      treeOid,
      force: true,
      cache: repo.cache,
      index, // Pass the index object
    })
    
    // Should have an update operation for a.txt
    const updateOp = operations.find(op => op[0] === 'update' && op[1] === 'a.txt')
    assert.ok(updateOp, 'Should have update operation for a.txt when index and workdir differ from HEAD')
  })

  it('ok:restore-files-unstaged-changes', async () => {
    const { repo } = await makeFixture('test-stash')
    await addUserConfig(repo)
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    
    // Get original content - use repo.fs
    const originalContent = await repo.fs.read(`${dir}/a.txt`)
    
    // Make changes but don't stage them
    await repo.fs.write(`${dir}/a.txt`, 'unstaged changes')
    
    // Verify file is modified but not staged (status might have '*' prefix)
    const statusBefore = await status({ repo, filepath: 'a.txt' })
    assert.ok(statusBefore === 'modified' || statusBefore === '*modified', `Status should be 'modified' or '*modified', got '${statusBefore}'`)
    
    // Now checkout with force should restore to HEAD
    await checkout({
      repo,
      ref: 'HEAD',
      force: true,
    })
    
    // Verify file is restored
    const restoredContent = await repo.fs.read(`${dir}/a.txt`)
    assert.ok(restoredContent !== null, 'restoredContent should not be null')
    assert.ok(originalContent !== null, 'originalContent should not be null')
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
    
    // Verify status shows file is unmodified
    const statusAfter = await status({ repo, filepath: 'a.txt' })
    assert.strictEqual(statusAfter, 'unmodified', `Expected 'unmodified', got '${statusAfter}'. File should be in HEAD after checkout.`)
  })

  it('ok:handle-stash-workdir-changes', async () => {
    const { repo } = await makeFixture('test-stash')
    await addUserConfig(repo)
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    
    // Get original content
    const originalContent = await repo.fs.read(`${dir}/a.txt`)
    
    // Make unstaged changes (index still matches HEAD)
    await repo.fs.write(`${dir}/a.txt`, 'unstaged changes')
    
    // Stash should detect the workdir changes and stash them
    await stash({ repo })
    
    // Verify file is restored to original
    const restoredContent = await repo.fs.read(`${dir}/a.txt`)
    assert.ok(restoredContent !== null, 'restoredContent should not be null')
    assert.ok(originalContent !== null, 'originalContent should not be null')
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
    
    // Verify status
    const statusAfter = await status({ repo, filepath: 'a.txt' })
    assert.strictEqual(statusAfter, 'unmodified')
  })
})

