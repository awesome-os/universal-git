import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import {
  init,
  add,
  remove,
  commit,
  checkout,
  listFiles,
  readCommit,
  readTree,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('unicode filepath support', () => {
  it('write/read index 日本語', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-unicode-paths')
    await init({ fs, dir, gitdir })
    // Use a shared cache to ensure add() and listFiles() see the same index state
    const cache = {}
    
    // Test - create the file first, then add it
    const filepath = '日本語'
    const fullPath = path.join(dir, filepath)
    await fs.write(fullPath, 'test content')
    
    // Verify file exists before adding
    const stats = await fs.lstat(fullPath)
    assert.ok(stats, 'File should exist before adding')
    
    // Get initial file list (should be empty for fresh repo)
    const filesBefore = await listFiles({ fs, dir, gitdir, cache })
    
    await add({ fs, dir, gitdir, filepath, cache })
    
    // Verify file was added to index
    const files = await listFiles({ fs, dir, gitdir, cache })
    // The file should be in the list (might not be first if fixture has other files)
    assert.ok(files.includes(filepath), `Expected '${filepath}' to be in index, got: ${files.join(', ')}`)
    
    await remove({ fs, dir, gitdir, filepath, cache })
    const filesAfterRemove = await listFiles({ fs, dir, gitdir, cache })
    // After remove, should be back to initial state
    assert.strictEqual(filesAfterRemove.length, filesBefore.length, 
      `Expected index to return to initial state (${filesBefore.length} files), got: ${filesAfterRemove.length} files`)
  })
  
  it('write/read index docs/日本語', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-unicode-paths')
    await init({ fs, dir, gitdir })
    // Use a shared cache to ensure add() and listFiles() see the same index state
    const cache = {}
    // Test
    const filepath = 'docs/日本語'
    await fs.mkdir(path.join(dir, 'docs'))
    await fs.write(path.join(dir, filepath), 'test content')
    
    // Get initial file list
    const filesBefore = await listFiles({ fs, dir, gitdir, cache })
    
    await add({ fs, dir, gitdir, filepath, cache })
    const files = await listFiles({ fs, dir, gitdir, cache })
    // The file should be in the list (might not be first if fixture has other files)
    assert.ok(files.includes(filepath), `Expected '${filepath}' to be in index, got: ${files.join(', ')}`)
    
    await remove({ fs, dir, gitdir, filepath, cache })
    const filesAfterRemove = await listFiles({ fs, dir, gitdir, cache })
    // After remove, should be back to initial state
    assert.strictEqual(filesAfterRemove.length, filesBefore.length, 
      `Expected index to return to initial state (${filesBefore.length} files), got: ${filesAfterRemove.length} files`)
  })
  
  it('write/read commit 日本語', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-unicode-paths')
    await init({ fs, dir, gitdir })
    // Use a shared cache for consistency
    const cache = {}
    // Create the file first, then add it
    const filepath = '日本語'
    await fs.write(path.join(dir, filepath), 'test content')
    await add({ fs, dir, gitdir, filepath, cache })
    // Test
    const sha = await commit({
      fs,
      dir,
      gitdir,
      cache,
      author: {
        name: '日本語',
        email: '日本語@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: '日本語',
    })
    // Check GitCommit object
    const { commit: comm } = await readCommit({ fs, dir, gitdir, oid: sha, cache })
    assert.strictEqual(comm.author.name, '日本語')
    assert.strictEqual(comm.author.email, '日本語@example.com')
    assert.strictEqual(comm.message, '日本語\n')
  })
  
  it('write/read tree 日本語', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-unicode-paths')
    await init({ fs, dir, gitdir })
    // Use a shared cache for consistency
    const cache = {}
    // Create the file first, then add it
    const filepath = '日本語'
    await fs.write(path.join(dir, filepath), 'test content')
    await add({ fs, dir, gitdir, filepath, cache })
    const sha = await commit({
      fs,
      dir,
      gitdir,
      cache,
      ref: 'refs/heads/master',
      author: {
        name: '日本語',
        email: '日本語@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: '日本語',
    })
    const { commit: comm } = await readCommit({ fs, dir, gitdir, oid: sha, cache })
    // Test
    // Check GitTree object
    const { tree } = await readTree({
      fs,
      dir,
      gitdir,
      oid: comm.tree,
      cache,
    })
    // Find the file in the tree (might not be first)
    const fileEntry = tree.find(entry => entry.path === filepath)
    assert.ok(fileEntry, `Expected '${filepath}' to be in tree, got: ${tree.map(e => e.path).join(', ')}`)
    assert.strictEqual(fileEntry.path, filepath)
  })
  
  it('checkout 日本語', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-unicode-paths')
    await init({ fs, dir, gitdir })
    // Use a shared cache for consistency
    const cache = {}
    // Create the file first, then add it
    const filepath = '日本語'
    await fs.write(path.join(dir, filepath), 'test content')
    await add({ fs, dir, gitdir, filepath, cache })
    await commit({
      fs,
      dir,
      gitdir,
      cache,
      author: {
        name: '日本語',
        email: '日本語@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: '日本語',
    })
    await remove({ fs, dir, gitdir, filepath, cache })
    // Test
    // Check GitIndex object - checkout should restore the file to the index
    await checkout({ fs, dir, gitdir, ref: 'HEAD', force: true, cache })
    const files = await listFiles({ fs, dir, gitdir, cache })
    // The file should be in the list after checkout
    assert.ok(files.includes(filepath), `Expected '${filepath}' to be in index after checkout, got: ${files.join(', ')}`)
  })
  
  it('checkout docs/日本語', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-unicode-paths')
    await init({ fs, dir, gitdir })
    // Use a shared cache for consistency
    const cache = {}
    // Create the file first, then add it
    const filepath = 'docs/日本語'
    await fs.mkdir(path.join(dir, 'docs'))
    await fs.write(path.join(dir, filepath), 'test content')
    await add({ fs, dir, gitdir, filepath, cache })
    await commit({
      fs,
      dir,
      gitdir,
      cache,
      author: {
        name: '日本語',
        email: '日本語@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: '日本語',
    })
    await remove({ fs, dir, gitdir, filepath, cache })
    // Test
    // Check GitIndex object - checkout should restore the file to the index
    await checkout({ fs, dir, gitdir, ref: 'HEAD', force: true, cache })
    const files = await listFiles({ fs, dir, gitdir, cache })
    // The file should be in the list after checkout
    assert.ok(files.includes(filepath), `Expected '${filepath}' to be in index after checkout, got: ${files.join(', ')}`)
  })
})

