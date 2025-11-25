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
  const addUserConfig = async (fs: any, dir: string, gitdir: string) => {
    await setConfig({ fs, dir, gitdir, path: 'user.name', value: 'test user' })
    await setConfig({ fs, dir, gitdir, path: 'user.email', value: 'test@example.com' })
  }

  it('ok:restore-files-force-checkout', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    
    // CRITICAL: Create Repository instance once and use it for everything
    // This ensures the same fs instance is used throughout the test
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const cache = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    
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
  })

  it('ok:create-update-operations', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    
    // Get HEAD tree OID - use readCommit from universal-git
    const { readCommit, resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    const commitResult = await readCommit({ fs, gitdir, oid: headOid })
    const treeOid = commitResult.commit.tree
    assert.ok(treeOid, 'treeOid should be defined')
    assert.strictEqual(typeof treeOid, 'string')
    assert.strictEqual(treeOid.length, 40)
    
    // Make changes to file
    await fs.write(`${dir}/a.txt`, 'modified content')
    
    // Read the index first, then pass it to analyzeCheckout
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const cache = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    const index = await repo.readIndexDirect(false)
    
    // Analyze checkout - should detect the change
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
    assert.ok(updateOp, 'Should have update operation for a.txt')
  })

  it('ok:execute-checkout-operations', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    
    // Get original content
    const originalContent = await fs.read(`${dir}/a.txt`)
    
    // Get HEAD tree OID - use readCommit from universal-git
    const { readCommit, resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    const commitResult = await readCommit({ fs, gitdir, oid: headOid })
    const treeOid = commitResult.commit.tree
    assert.ok(treeOid, 'treeOid should be defined')
    assert.strictEqual(typeof treeOid, 'string')
    assert.strictEqual(treeOid.length, 40)
    
    // Make changes to file
    await fs.write(`${dir}/a.txt`, 'modified content')
    
    // Read the index first, then pass it to analyzeCheckout and executeCheckout
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const cache = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    const index = await repo.readIndexDirect(false)
    
    // Analyze and execute checkout
    const operations = await analyzeCheckout({
      fs,
      dir,
      gitdir,
      treeOid,
      force: true,
      cache,
      index, // Pass the index object
    })
    
    await executeCheckout({
      fs,
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
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    await addUserConfig(fs, dir, gitdir)
    
    // CRITICAL: Create Repository instance once and use it for everything
    // This ensures the same fs instance is used throughout the test
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const cache = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    
    // CRITICAL: Use createFileSystem to ensure we're using the same fs instance as the Repository
    // This ensures that writes from checkout are visible to reads in the test
    const normalizedFs = createFileSystem(fs)
    
    // Get original content - use normalized fs to match checkout's fs
    const originalContent = await normalizedFs.read(`${dir}/a.txt`)
    
    // Make changes and stage them using normalized fs
    await normalizedFs.write(`${dir}/a.txt`, 'staged changes')
    await add({ fs, dir, gitdir, filepath: 'a.txt', cache })
    
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
    const fileStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
    assert.strictEqual(fileStatus, 'unmodified')
  })
})

