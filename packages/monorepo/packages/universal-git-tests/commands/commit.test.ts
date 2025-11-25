import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import {
  Errors,
  readCommit,
  commit,
  log,
  resolveRef,
  init,
  add,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { verifyReflogEntry } from '@awesome-os/universal-git-test-helpers/helpers/reflogHelpers.ts'

describe('commit', () => {
  // CRITICAL: Use a shared cache object for ALL git commands in these tests
  // This ensures state modifications (like index updates) are immediately
  // visible to subsequent commands, eliminating race conditions
  let cache: Record<string, unknown>

  beforeEach(() => {
    cache = {} // Reset the cache for each test
  })
  it('error:UnmergedPathsError', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-GitIndex-unmerged')
    // Test
    let error = null
    try {
      await commit({
        fs,
        gitdir,
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
        message: 'Initial commit',
        cache,
      })
    } catch (e) {
      error = e
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.UnmergedPathsError || (error && typeof error === 'object' && ('code' in error && error.code === Errors.UnmergedPathsError.code)) || (error && typeof error === 'object' && ('name' in error && error.name === 'UnmergedPathsError')))
  })
  
  it('ok:basic', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    // Test
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    const sha = await commit({
      fs,
      gitdir,
      author,
      message: 'Initial commit',
    })
    assert.strictEqual(sha, '7a51c0b1181d738198ff21c4679d3aa32eb52fe0')
    // updates branch pointer
    const { oid: currentOid, commit: currentCommit } = (
      await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    )[0]
    assert.deepStrictEqual(currentCommit.parent, [originalOid])
    assert.deepStrictEqual(currentCommit.author, author)
    assert.deepStrictEqual(currentCommit.committer, author)
    assert.strictEqual(currentCommit.message, 'Initial commit\n')
    assert.notStrictEqual(currentOid, originalOid)
    assert.strictEqual(currentOid, sha)
    
    // Verify reflog entry was created
    await verifyReflogEntry({
      fs,
      gitdir,
      ref: 'refs/heads/master',
      expectedOldOid: originalOid,
      expectedNewOid: sha,
      expectedMessage: 'Initial commit',
      index: 0, // Most recent entry
    })
  })

  it('ok:initial-commit', async () => {
    // Setup
    const { fs, dir } = await makeFixture('test-init')
    await init({ fs, dir })
    await fs.write(path.join(dir, 'hello.md'), 'Hello, World!')
    await add({ fs, dir, filepath: 'hello.md', cache })

    // Test
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }

    await commit({
      fs,
      dir,
      author,
      message: 'Initial commit',
      cache,
    })

    const commits = await log({ fs, dir, ref: 'HEAD', cache })
    assert.strictEqual(commits.length, 1)
    assert.deepStrictEqual(commits[0].commit.parent, [])
    assert.strictEqual(await resolveRef({ fs, dir, ref: 'HEAD', cache }), commits[0].oid)
  })

  it('param:message-missing', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    // Test
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }

    let error = null

    try {
      await commit({
        fs,
        gitdir,
        author,
      })
    } catch (err) {
      error = err
    }

    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MissingParameterError || (error && typeof error === 'object' && 'code' in error && error.code === Errors.MissingParameterError.code))
  })

  it('behavior:noUpdateBranch', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    // Test
    const sha = await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Initial commit',
      noUpdateBranch: true,
    })
    assert.strictEqual(sha, '7a51c0b1181d738198ff21c4679d3aa32eb52fe0')
    // does NOT update branch pointer
    const { oid: currentOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    assert.strictEqual(currentOid, originalOid)
    assert.notStrictEqual(currentOid, sha)
    // but DID create commit object
    assert.strictEqual(
      await fs.exists(
        `${gitdir}/objects/7a/51c0b1181d738198ff21c4679d3aa32eb52fe0`
      ),
      true
    )
  })

  it('behavior:dryRun', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    // Test
    const sha = await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Initial commit',
      dryRun: true,
    })
    assert.strictEqual(sha, '7a51c0b1181d738198ff21c4679d3aa32eb52fe0')
    // does NOT update branch pointer
    const { oid: currentOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    assert.strictEqual(currentOid, originalOid)
    assert.notStrictEqual(currentOid, sha)
    // and did NOT create commit object
    assert.strictEqual(
      await fs.exists(
        `${gitdir}/objects/7a/51c0b1181d738198ff21c4679d3aa32eb52fe0`
      ),
      false
    )
  })

  it('param:custom-ref', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    // Test
    const sha = await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Initial commit',
      ref: 'refs/heads/master-copy',
    })
    assert.strictEqual(sha, '7a51c0b1181d738198ff21c4679d3aa32eb52fe0')
    // does NOT update master branch pointer
    const { oid: currentOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    assert.strictEqual(currentOid, originalOid)
    assert.notStrictEqual(currentOid, sha)
    // but DOES update master-copy
    const { oid: copyOid } = (
      await log({
        fs,
        gitdir,
        depth: 1,
        ref: 'master-copy',
        cache,
      })
    )[0]
    assert.strictEqual(sha, copyOid)
  })

  it('param:custom-parents-tree', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    // Test
    const parent = [
      '1111111111111111111111111111111111111111',
      '2222222222222222222222222222222222222222',
      '3333333333333333333333333333333333333333',
    ]
    const tree = '4444444444444444444444444444444444444444'
    const sha = await commit({
      fs,
      gitdir,
      parent,
      tree,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Initial commit',
    })
    assert.strictEqual(sha, '43fbc94f2c1db655a833e08c72d005954ff32f32')
    // does NOT update master branch pointer
    const { parent: parents, tree: _tree } = (
      await log({
        fs,
        gitdir,
        ref: 'HEAD',
        depth: 1,
        cache,
      })
    )[0].commit
    assert.notDeepStrictEqual(parents, [originalOid])
    assert.deepStrictEqual(parents, parent)
    assert.strictEqual(_tree, tree)
  })

  it('param:author-missing', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    // Test
    // Use ignoreSystemConfig: true to ensure no global/system config is read
    // This makes the test hermetic and independent of the test environment
    let error = null
    try {
      await commit({
        fs,
        gitdir,
        author: {
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: 0,
        },
        message: 'Initial commit',
        autoDetectConfig: false,
        ignoreSystemConfig: true, // Ignore system/global config to ensure no user.name is found
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error && typeof error === 'object' && 'code' in error)
    assert.strictEqual((error as any).code, Errors.MissingNameError.code)
  })

  it('behavior:timezone', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    let commits
    // Test
    await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: '-0 offset',
    })
    commits = await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    assert.strictEqual(Object.is(commits[0].commit.author.timezoneOffset, -0), true)

    await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: 0,
      },
      message: '+0 offset',
    })
    commits = await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    assert.strictEqual(Object.is(commits[0].commit.author.timezoneOffset, 0), true)

    await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: 240,
      },
      message: '+240 offset',
    })
    commits = await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    assert.strictEqual(Object.is(commits[0].commit.author.timezoneOffset, 240), true)

    await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -240,
      },
      message: '-240 offset',
    })
    commits = await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    assert.strictEqual(
      Object.is(commits[0].commit.author.timezoneOffset, -240),
      true
    )
  })

  it('behavior:amend-new-message', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    await commit({
      fs,
      gitdir,
      author,
      message: 'Initial commit',
    })

    // Test
    const { oid: originalOid, commit: originalCommit } = (
      await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    )[0]
    await commit({
      fs,
      gitdir,
      message: 'Amended commit',
      amend: true,
    })
    const { oid: amendedOid, commit: amendedCommit } = (
      await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    )[0]

    assert.notStrictEqual(amendedOid, originalOid)
    assert.deepStrictEqual(amendedCommit.author, originalCommit.author)
    // Committer name and email should be the same, but timestamp may be updated when amending
    assert.strictEqual(amendedCommit.committer.name, originalCommit.committer.name)
    assert.strictEqual(amendedCommit.committer.email, originalCommit.committer.email)
    assert.strictEqual(amendedCommit.message, 'Amended commit\n')
    assert.deepStrictEqual(amendedCommit.parent, originalCommit.parent)
    assert.strictEqual(await resolveRef({ fs, gitdir, ref: 'HEAD', cache }), amendedOid)
  })

  it('behavior:amend-change-author', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-commit')
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    await commit({
      fs,
      gitdir,
      author,
      message: 'Initial commit',
    })

    // Test
    const { oid: originalOid, commit: originalCommit } = (
      await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    )[0]

    const newAuthor = {
      name: 'Mr. Test 2',
      email: 'mrtest2@example.com',
      timestamp: 1262356921,
      timezoneOffset: -0,
    }
    await commit({
      fs,
      gitdir,
      author: newAuthor,
      amend: true,
    })
    const { oid: amendedOid, commit: amendedCommit } = (
      await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache })
    )[0]

    assert.notStrictEqual(amendedOid, originalOid)
    assert.deepStrictEqual(amendedCommit.author, newAuthor)
    assert.deepStrictEqual(amendedCommit.committer, newAuthor)
    assert.strictEqual(amendedCommit.message, originalCommit.message)
    assert.deepStrictEqual(amendedCommit.parent, originalCommit.parent)
    assert.strictEqual(await resolveRef({ fs, gitdir, ref: 'HEAD', cache }), amendedOid)
  })

  it('error:amend-no-initial-commit', async () => {
    // Setup
    const { fs, dir } = await makeFixture('test-init')
    await init({ fs, dir })
    await fs.write(path.join(dir, 'hello.md'), 'Hello, World!')
    await add({ fs, dir, filepath: 'hello.md', cache })

    // Test
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }

    let error = null
    try {
      await commit({
        fs,
        dir,
        author,
        message: 'Initial commit',
        amend: true,
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.NoCommitError || (error && typeof error === 'object' && 'code' in error && (error as any).code === Errors.NoCommitError.code))
  })

  it('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-commit')
    
    let error: any = null
    try {
      await commit({
        fs,
        gitdir,
        message: 'Test commit',
        // Missing author - use ignoreSystemConfig: true to ensure no author from config
        autoDetectConfig: false,
        ignoreSystemConfig: true,
      })
    } catch (err) {
      error = err
    }
    
    assert.ok(error, 'Error should be thrown')
    assert.strictEqual(error.caller, 'git.commit', 'Error should have caller property set')
  })

  it('param:signingKey-without-onSign', async () => {
    const { fs, gitdir } = await makeFixture('test-commit')
    
    let error: any = null
    try {
      await commit({
        fs,
        gitdir,
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
        message: 'Test commit',
        signingKey: 'test-key',
        // Missing onSign
      })
    } catch (err) {
      error = err
    }
    
    assert.ok(error, 'Error should be thrown')
    assert.ok(error instanceof Errors.MissingParameterError, 'Should throw MissingParameterError')
    assert.ok(error.message.includes('onSign'), 'Error should mention onSign')
  })

  it('behavior:default-branch-from-config', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-init')
    await init({ fs, dir, gitdir, defaultBranch: 'develop' })
    
    await fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache })
    
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    const sha = await commit({
      fs,
      dir,
      gitdir,
      author,
      message: 'Initial commit',
      cache,
    })
    
    // Verify commit was created and branch was set
    const commits = await log({ fs, dir, gitdir, ref: 'HEAD', cache })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
    
    // Verify HEAD points to develop branch
    const headRef = await resolveRef({ fs, dir, gitdir, ref: 'HEAD', cache })
    const developRef = await resolveRef({ fs, dir, gitdir, ref: 'refs/heads/develop', cache })
    assert.strictEqual(headRef, developRef)
  })

  it('behavior:default-branch-master', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-init')
    await init({ fs, dir, gitdir })
    
    await fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache })
    
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    const sha = await commit({
      fs,
      dir,
      gitdir,
      author,
      message: 'Initial commit',
      cache,
    })
    
    // Verify commit was created
    const commits = await log({ fs, dir, gitdir, ref: 'HEAD', cache })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
  })

  it('param:custom-ref-creates-commit', async () => {
    const { fs, gitdir } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    
    const sha = await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Test commit',
      ref: 'refs/heads/custom-branch',
      cache,
    })
    
    // Verify custom branch was created and updated
    const customLog = await log({ fs, gitdir, depth: 1, ref: 'custom-branch', cache })
    assert.ok(customLog.length > 0, 'Custom branch should have commits')
    const { oid: customOid } = customLog[0]
    assert.strictEqual(customOid, sha, 'Custom branch should point to new commit')
    
    // Verify the commit OID matches what was returned
    assert.ok(sha, 'Commit should return an OID')
  })

  it('behavior:amend-uses-previous-parents', async () => {
    const { fs, gitdir } = await makeFixture('test-commit')
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    // Make first commit
    const firstSha = await commit({
      fs,
      gitdir,
      author,
      message: 'First commit',
      cache,
    })
    
    // Make second commit
    await commit({
      fs,
      gitdir,
      author,
      message: 'Second commit',
      cache,
    })
    
    // Amend the second commit
    const amendedSha = await commit({
      fs,
      gitdir,
      author,
      message: 'Amended second commit',
      amend: true,
      cache,
    })
    
    // Verify amended commit has the same parent as the original second commit
    const { commit: amendedCommit } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    assert.deepStrictEqual(amendedCommit.parent, [firstSha], 'Amended commit should have same parent')
    assert.notStrictEqual(amendedSha, firstSha, 'Amended commit should be different OID')
  })

  it('param:parent-resolves-refs', async () => {
    const { fs, gitdir } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    
    const sha = await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Test commit',
      parent: ['HEAD'], // Use ref instead of OID
      cache,
    })
    
    // Verify commit has correct parent
    const { commit: newCommit } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    assert.deepStrictEqual(newCommit.parent, [originalOid], 'Parent should be resolved from ref')
  })

  it('param:tree-uses-provided', async () => {
    const { fs, gitdir } = await makeFixture('test-commit')
    const { commit: originalCommit } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    
    const sha = await commit({
      fs,
      gitdir,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Test commit',
      tree: originalCommit.tree, // Use existing tree
      cache,
    })
    
    // Verify commit uses provided tree
    const { commit: newCommit } = (await log({ fs, gitdir, ref: 'HEAD', depth: 1, cache }))[0]
    assert.strictEqual(newCommit.tree, originalCommit.tree, 'Commit should use provided tree')
  })

  it('error:index-read-error', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-init')
    await init({ fs, dir, gitdir })
    
    await fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache })
    
    // Delete index to simulate read error
    try {
      await fs.rm(path.join(gitdir, 'index'))
    } catch {
      // Index might not exist
    }
    
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    // Commit should still work with empty index
    const sha = await commit({
      fs,
      dir,
      gitdir,
      author,
      message: 'Initial commit',
      cache,
    })
    
    // Verify commit was created
    const commits = await log({ fs, dir, gitdir, ref: 'HEAD', cache })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
  })

  it('param:autoDetectConfig-false', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-init')
    await init({ fs, dir, gitdir })
    
    await fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ fs, dir, gitdir, filepath: 'file.txt', cache })
    
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    const sha = await commit({
      fs,
      dir,
      gitdir,
      author,
      message: 'Initial commit',
      autoDetectConfig: false,
      cache,
    })
    
    // Verify commit was created
    const commits = await log({ fs, dir, gitdir, ref: 'HEAD', cache })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
  })
})

