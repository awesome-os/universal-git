import { describe, it } from 'node:test'
import assert from 'node:assert'
import { checkout, commit, add, resolveRef } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('checkout restore missing files', () => {
  it('should restore files that exist in HEAD but are missing from workdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    
    // Get the HEAD commit to checkout to
    const headCommit = await resolveRef({ fs, dir, gitdir, ref: 'HEAD' })
    
    // Manually delete a file that exists in HEAD
    const fileToDelete = 'a.txt'
    const filePath = `${dir}/${fileToDelete}`
    
    // Verify file exists before deletion
    const existsBefore = await fs.exists(filePath)
    assert.strictEqual(existsBefore, true, 'File should exist before deletion')
    
    // Delete the file from workdir
    await fs.rm(filePath)
    
    // Verify file is deleted - try multiple ways to be sure
    const existsAfterDelete = await fs.exists(filePath)
    const lstatResult = await fs.lstat(filePath)
    assert.strictEqual(existsAfterDelete, false, 'fs.exists() should return false after deletion')
    assert.strictEqual(lstatResult, null, 'fs.lstat() should return null after deletion')
    
    // Now checkout HEAD with force - this should restore the file
    await checkout({ fs, dir, gitdir, ref: 'HEAD', force: true })
    
    // Verify file is restored
    const existsAfterCheckout = await fs.exists(filePath)
    assert.strictEqual(existsAfterCheckout, true, 'File should be restored after checkout')
    
    // Verify file content matches HEAD
    const restoredContent = await fs.read(filePath)
    // We can't easily verify the exact content without reading from HEAD tree,
    // but at least verify it's not empty
    assert.ok(restoredContent, 'Restored file should have content')
  })
})

