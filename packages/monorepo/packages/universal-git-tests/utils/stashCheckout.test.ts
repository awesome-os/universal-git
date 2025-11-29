import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
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
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    
    // Create initial commit so we have a HEAD
    // Explicitly add files instead of '.' to ensure they are added
    await repo.gitBackend.add(repo.worktreeBackend, ['a.txt'])
    await repo.gitBackend.commit(repo.worktreeBackend, 'initial commit')
    
    // Verify HEAD exists
    try {
      const head = await repo.resolveRef('HEAD')
      console.log('HEAD exists:', head)
    } catch (e) {
      console.error('HEAD does not exist after commit!', e)
      throw e
    }
    
    // Get original content
    const originalContent = await repo.worktreeBackend.read('a.txt')
    
    // Make changes and stage them
    await repo.worktreeBackend.write('a.txt', 'staged changes - a')
    await repo.gitBackend.add(repo.worktreeBackend, 'a.txt')
    
    // Verify file is staged (status should be 'modified' after staging)
    const statusBefore = await repo.gitBackend.status(repo.worktreeBackend, 'a.txt')
    assert.ok(statusBefore === 'modified', `Status should be 'modified', got '${statusBefore}'`)
    
    // After add, index should match the staged content, but workdir still has the staged content
    // So index OID != HEAD OID, but workdir OID == index OID
    
    // Now stash - this should:
    // 1. Create stash commit with the staged changes
    // 2. Checkout HEAD to restore files
    // 3. Reset index to match HEAD
    await stash({ repo })
    
    // Verify file is restored to original content
    const restoredContent = await repo.worktreeBackend.read('a.txt')
    assert.ok(restoredContent !== null, 'restoredContent should not be null')
    assert.ok(originalContent !== null, 'originalContent should not be null')
    assert.strictEqual(restoredContent.toString(), originalContent.toString(), 'File should be restored to original content after stash')
    
    // Verify status shows file is unmodified
    const statusAfter = await repo.gitBackend.status(repo.worktreeBackend, 'a.txt')
    assert.strictEqual(statusAfter, 'unmodified', 'File should be unmodified after stash')
  })

  it('behavior:detect-workdir-changes-analyzeCheckout', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    
    // Create initial commit so we have a HEAD
    await repo.gitBackend.add(repo.worktreeBackend, ['a.txt'])
    await repo.gitBackend.commit(repo.worktreeBackend, 'initial commit')

    // Get HEAD tree OID
    const headOid = await repo.gitBackend.readRef('HEAD')
    const { object: commitBuffer } = await repo.gitBackend.readObject(headOid!, 'content')
    const { parse: parseCommit } = await import('@awesome-os/universal-git-src/core-utils/parsers/Commit.ts')
    const commit = parseCommit(commitBuffer)
    const treeOid = commit.tree
    
    // Make changes and stage them (so index matches staged content, not HEAD)
    await repo.worktreeBackend.write('a.txt', 'staged changes - a')
    await repo.gitBackend.add(repo.worktreeBackend, 'a.txt')
    
    // Now the index has the staged content, but HEAD has the original
    // When we analyze checkout to HEAD, it should detect that:
    // - index OID != tree OID (staged content != HEAD)
    // - workdir OID != tree OID (staged content != HEAD)
    // - workdir OID == index OID (staged matches index)
    // So it should create an update operation
    
    // Read the index first, then pass it to analyzeCheckout
    const index = await repo.gitBackend.readIndex().then(async (buf: any) => {
      const { GitIndex } = await import('@awesome-os/universal-git-src/git/index/GitIndex.ts')
      return GitIndex.fromBuffer(buf, await repo.gitBackend.getObjectFormat(repo.cache))
    })
    
    const operations = await analyzeCheckout({
      gitBackend: repo.gitBackend,
      worktreeBackend: repo.worktreeBackend,
      treeOid,
      force: true,
      cache: repo.cache,
      index, // Pass the index object
    })
    
    // Should have an update operation for a.txt
    const updateOp = operations.find((op: any[]) => op[0] === 'update' && op[1] === 'a.txt')
    assert.ok(updateOp, 'Should have update operation for a.txt when index and workdir differ from HEAD')
  })

  it('ok:restore-files-unstaged-changes', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    
    // Create initial commit so we have a HEAD
    await repo.gitBackend.add(repo.worktreeBackend, ['a.txt'])
    await repo.gitBackend.commit(repo.worktreeBackend, 'initial commit')
    
    // Get original content
    const originalContent = await repo.worktreeBackend.read('a.txt')
    
    // Make changes but don't stage them
    await repo.worktreeBackend.write('a.txt', 'unstaged changes')
    
    // Verify file is modified but not staged (status might have '*' prefix)
    const statusBefore = await repo.gitBackend.status(repo.worktreeBackend, 'a.txt')
    assert.ok(statusBefore === 'modified' || statusBefore === '*modified', `Status should be 'modified' or '*modified', got '${statusBefore}'`)
    
    // Now checkout with force should restore to HEAD
    await repo.gitBackend.checkout(repo.worktreeBackend, 'HEAD', { force: true })
    
    // Verify file is restored
    const restoredContent = await repo.worktreeBackend.read('a.txt')
    assert.ok(restoredContent !== null, 'restoredContent should not be null')
    assert.ok(originalContent !== null, 'originalContent should not be null')
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
    
    // Verify status shows file is unmodified
    const statusAfter = await repo.gitBackend.status(repo.worktreeBackend, 'a.txt')
    assert.strictEqual(statusAfter, 'unmodified', `Expected 'unmodified', got '${statusAfter}'. File should be in HEAD after checkout.`)
  })

  it('ok:handle-stash-workdir-changes', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    
    // Create initial commit so we have a HEAD
    await repo.gitBackend.add(repo.worktreeBackend, ['a.txt'])
    await repo.gitBackend.commit(repo.worktreeBackend, 'initial commit')
    
    // Get original content
    const originalContent = await repo.worktreeBackend.read('a.txt')
    
    // Make unstaged changes (index still matches HEAD)
    await repo.worktreeBackend.write('a.txt', 'unstaged changes')
    
    // Stash should detect the workdir changes and stash them
    await stash({ repo })
    
    // Verify file is restored to original
    const restoredContent = await repo.worktreeBackend.read('a.txt')
    assert.ok(restoredContent !== null, 'restoredContent should not be null')
    assert.ok(originalContent !== null, 'originalContent should not be null')
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
    
    // Verify status
    const statusAfter = await repo.gitBackend.status(repo.worktreeBackend, 'a.txt')
    assert.strictEqual(statusAfter, 'unmodified')
  })
})
