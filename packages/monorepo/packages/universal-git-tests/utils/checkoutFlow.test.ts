import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  add,
  checkout,
  commit,
  status,
  setConfig,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { analyzeCheckout, executeCheckout } from '@awesome-os/universal-git-src/git/worktree/WorkdirManager.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'

describe('checkout flow', () => {
  const addUserConfig = async (repo: any) => {
    await setConfig({ repo, path: 'user.name', value: 'test user' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
  }

  it('ok:restore-files-force-checkout', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    // CRITICAL: Use createFileSystem to ensure we're using the same fs instance as the Repository
    // This ensures that writes from checkout are visible to reads in the test
    const normalizedFs = createFileSystem(fs)
    
    // Get original content - use normalized fs to match checkout's fs
    const originalContent = await normalizedFs.read(`${dir}/a.txt`)
    
    // Make changes to file using normalized fs
    await normalizedFs.write(`${dir}/a.txt`, 'modified content')
    
    // Verify file is modified using normalized fs
    const modifiedContent = await normalizedFs.read(`${dir}/a.txt`)
    assert.strictEqual(modifiedContent.toString(), 'modified content')
    
    // Checkout with force should restore to HEAD - pass repo to ensure fs consistency
    await checkout({
      repo,
      dir, // Pass dir explicitly
      ref: 'HEAD',
      force: true,
    })
    
    // Verify file is restored - use normalized fs to match checkout's fs
    const restoredContent = await normalizedFs.read(`${dir}/a.txt`)
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
  })

  it('ok:create-update-operations', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    // Get HEAD tree OID - use readCommit from universal-git
    const { readCommit, resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const headOid = await resolveRef({ fs: fs, gitdir, ref: 'HEAD' })
    const commitResult = await readCommit({ fs: fs, gitdir, oid: headOid })
    const treeOid = commitResult.commit.tree
    assert.ok(treeOid, 'treeOid should be defined')
    assert.strictEqual(typeof treeOid, 'string')
    assert.strictEqual(treeOid.length, 40)
    
    // Make changes to file
    await fs.write(`${dir}/a.txt`, 'modified content')
    
    // Read the index first, then pass it to analyzeCheckout
    const index = await repo.readIndexDirect()
    
    // Analyze checkout - should detect the change
    const operations = await analyzeCheckout({
      fs: fs,
      dir,
      gitdir,
      treeOid,
      force: true,
      cache: repo.cache,
      index, // Pass the index object
    })
    
    // Should have an update operation for a.txt
    const updateOp = operations.find(op => op[0] === 'update' && op[1] === 'a.txt')
    assert.ok(updateOp, 'Should have update operation for a.txt')
  })

  it('ok:execute-checkout-operations', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    // Get original content
    const originalContent = await fs.read(`${dir}/a.txt`)
    
    // Get HEAD tree OID - use readCommit from universal-git
    const { readCommit, resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const headOid = await resolveRef({ fs: fs, gitdir, ref: 'HEAD' })
    const commitResult = await readCommit({ fs: fs, gitdir, oid: headOid })
    const treeOid = commitResult.commit.tree
    assert.ok(treeOid, 'treeOid should be defined')
    assert.strictEqual(typeof treeOid, 'string')
    assert.strictEqual(treeOid.length, 40)
    
    // Make changes to file
    await fs.write(`${dir}/a.txt`, 'modified content')
    
    // Read the index first, then pass it to analyzeCheckout and executeCheckout
    const index = await repo.readIndexDirect()
    
    // Analyze and execute checkout
    const operations = await analyzeCheckout({
      fs: fs,
      dir,
      gitdir,
      treeOid,
      force: true,
      cache: repo.cache,
      index, // Pass the index object
    })
    
    await executeCheckout({
      fs: fs,
      index, // Pass the index object
      dir,
      gitdir,
      operations,
    })
    
    // Verify file is restored
    const restoredContent = await fs.read(`${dir}/a.txt`)
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
  })

  it('param:cache-checkout-operations', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash', { init: true })
    await addUserConfig(repo)
    // CRITICAL: Use createFileSystem to ensure we're using the same fs instance as the Repository
    // This ensures that writes from checkout are visible to reads in the test
    const normalizedFs = createFileSystem(fs)
    
    // Get original content - use normalized fs to match checkout's fs
    const originalContent = await normalizedFs.read(`${dir}/a.txt`)
    
    // Make changes and stage them using normalized fs
    await normalizedFs.write(`${dir}/a.txt`, 'staged changes')
    await add({ repo, filepath: 'a.txt' })
    
    // Now checkout with force should restore to HEAD - pass repo to ensure fs consistency
    await checkout({
      repo,
      dir, // Pass dir explicitly
      ref: 'HEAD',
      force: true,
    })
    
    // Verify file is restored - use normalized fs to match checkout's fs
    const restoredContent = await normalizedFs.read(`${dir}/a.txt`)
    assert.strictEqual(restoredContent.toString(), originalContent.toString())
    
    // Verify status shows file is unmodified
    const fileStatus = await status({ repo, filepath: 'a.txt' })
    assert.strictEqual(fileStatus, 'unmodified')
  })
})

