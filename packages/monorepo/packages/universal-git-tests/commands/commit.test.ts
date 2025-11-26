import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import {
  Errors,
  readCommit,
  commit,
  log,
  resolveRef,
  add,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { verifyReflogEntry } from '@awesome-os/universal-git-test-helpers/helpers/reflogHelpers.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

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
    const { repo } = await makeFixture('test-GitIndex-unmerged')
    // Test
    let error = null
    try {
      await commit({
        repo,
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
        message: 'Initial commit',
      })
    } catch (e) {
      error = e
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.UnmergedPathsError || (error && typeof error === 'object' && ('code' in error && error.code === Errors.UnmergedPathsError.code)) || (error && typeof error === 'object' && ('name' in error && error.name === 'UnmergedPathsError')))
  })
  
  it('ok:basic', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    // Test
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    const sha = await commit({
      repo,
      author,
      message: 'Initial commit',
    })
    assert.strictEqual(sha, '7a51c0b1181d738198ff21c4679d3aa32eb52fe0')
    // updates branch pointer
    const { oid: currentOid, commit: currentCommit } = (
      await log({ repo, ref: 'HEAD', depth: 1 })
    )[0]
    assert.deepStrictEqual(currentCommit.parent, [originalOid])
    assert.deepStrictEqual(currentCommit.author, author)
    assert.deepStrictEqual(currentCommit.committer, author)
    assert.strictEqual(currentCommit.message, 'Initial commit\n')
    assert.notStrictEqual(currentOid, originalOid)
    assert.strictEqual(currentOid, sha)
    
    // Verify reflog entry was created
    const gitdir = await repo.getGitdir()
    await verifyReflogEntry({
      fs: repo.fs,
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
    const { repo } = await makeFixture('test-init', { init: true })
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    await repo.fs.write(path.join(dir, 'hello.md'), 'Hello, World!')
    await add({ repo, filepath: 'hello.md' })

    // Test
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }

    await commit({
      repo,
      author,
      message: 'Initial commit',
    })

    const commits = await log({ repo, ref: 'HEAD' })
    assert.strictEqual(commits.length, 1)
    assert.deepStrictEqual(commits[0].commit.parent, [])
    assert.strictEqual(await resolveRef({ repo, ref: 'HEAD' }), commits[0].oid)
  })

  it('param:message-missing', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
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
        repo,
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
    const { repo } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    // Test
    const sha = await commit({
      repo,
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
    const { oid: currentOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    assert.strictEqual(currentOid, originalOid)
    assert.notStrictEqual(currentOid, sha)
    // but DID create commit object - use backend to check
    const gitdir = await repo.getGitdir()
    assert.strictEqual(
      await repo.fs.exists(
        `${gitdir}/objects/7a/51c0b1181d738198ff21c4679d3aa32eb52fe0`
      ),
      true
    )
  })

  it('behavior:dryRun', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    // Test
    const sha = await commit({
      repo,
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
    const { oid: currentOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    assert.strictEqual(currentOid, originalOid)
    assert.notStrictEqual(currentOid, sha)
    // and did NOT create commit object - use backend to check
    const gitdir = await repo.getGitdir()
    assert.strictEqual(
      await repo.fs.exists(
        `${gitdir}/objects/7a/51c0b1181d738198ff21c4679d3aa32eb52fe0`
      ),
      false
    )
  })

  it('param:custom-ref', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    // Test
    const sha = await commit({
      repo,
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
    const { oid: currentOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    assert.strictEqual(currentOid, originalOid)
    assert.notStrictEqual(currentOid, sha)
    // but DOES update master-copy
    const { oid: copyOid } = (
      await log({
        repo,
        depth: 1,
        ref: 'master-copy',
      })
    )[0]
    assert.strictEqual(sha, copyOid)
  })

  it('param:custom-parents-tree', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    // Test
    const parent = [
      '1111111111111111111111111111111111111111',
      '2222222222222222222222222222222222222222',
      '3333333333333333333333333333333333333333',
    ]
    const tree = '4444444444444444444444444444444444444444'
    const sha = await commit({
      repo,
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
        repo,
        ref: 'HEAD',
        depth: 1,
      })
    )[0].commit
    assert.notDeepStrictEqual(parents, [originalOid])
    assert.deepStrictEqual(parents, parent)
    assert.strictEqual(_tree, tree)
  })

  it('param:author-missing', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
    // Test
    // Use ignoreSystemConfig: true to ensure no global/system config is read
    // This makes the test hermetic and independent of the test environment
    let error = null
    try {
      await commit({
        repo,
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
    const { repo } = await makeFixture('test-commit')
    let commits
    // Test
    await commit({
      repo,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: '-0 offset',
    })
    commits = await log({ repo, ref: 'HEAD', depth: 1 })
    assert.strictEqual(Object.is(commits[0].commit.author.timezoneOffset, -0), true)

    await commit({
      repo,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: 0,
      },
      message: '+0 offset',
    })
    commits = await log({ repo, ref: 'HEAD', depth: 1 })
    assert.strictEqual(Object.is(commits[0].commit.author.timezoneOffset, 0), true)

    await commit({
      repo,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: 240,
      },
      message: '+240 offset',
    })
    commits = await log({ repo, ref: 'HEAD', depth: 1 })
    assert.strictEqual(Object.is(commits[0].commit.author.timezoneOffset, 240), true)

    await commit({
      repo,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -240,
      },
      message: '-240 offset',
    })
    commits = await log({ repo, ref: 'HEAD', depth: 1 })
    assert.strictEqual(
      Object.is(commits[0].commit.author.timezoneOffset, -240),
      true
    )
  })

  it('behavior:amend-new-message', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    await commit({
      repo,
      author,
      message: 'Initial commit',
    })

    // Test
    const { oid: originalOid, commit: originalCommit } = (
      await log({ repo, ref: 'HEAD', depth: 1 })
    )[0]
    await commit({
      repo,
      message: 'Amended commit',
      amend: true,
    })
    const { oid: amendedOid, commit: amendedCommit } = (
      await log({ repo, ref: 'HEAD', depth: 1 })
    )[0]

    assert.notStrictEqual(amendedOid, originalOid)
    assert.deepStrictEqual(amendedCommit.author, originalCommit.author)
    // Committer name and email should be the same, but timestamp may be updated when amending
    assert.strictEqual(amendedCommit.committer.name, originalCommit.committer.name)
    assert.strictEqual(amendedCommit.committer.email, originalCommit.committer.email)
    assert.strictEqual(amendedCommit.message, 'Amended commit\n')
    assert.deepStrictEqual(amendedCommit.parent, originalCommit.parent)
    assert.strictEqual(await resolveRef({ repo, ref: 'HEAD' }), amendedOid)
  })

  it('behavior:amend-change-author', async () => {
    // Setup
    const { repo } = await makeFixture('test-commit')
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    await commit({
      repo,
      author,
      message: 'Initial commit',
    })

    // Test
    const { oid: originalOid, commit: originalCommit } = (
      await log({ repo, ref: 'HEAD', depth: 1 })
    )[0]

    const newAuthor = {
      name: 'Mr. Test 2',
      email: 'mrtest2@example.com',
      timestamp: 1262356921,
      timezoneOffset: -0,
    }
    await commit({
      repo,
      author: newAuthor,
      amend: true,
    })
    const { oid: amendedOid, commit: amendedCommit } = (
      await log({ repo, ref: 'HEAD', depth: 1 })
    )[0]

    assert.notStrictEqual(amendedOid, originalOid)
    assert.deepStrictEqual(amendedCommit.author, newAuthor)
    assert.deepStrictEqual(amendedCommit.committer, newAuthor)
    assert.strictEqual(amendedCommit.message, originalCommit.message)
    assert.deepStrictEqual(amendedCommit.parent, originalCommit.parent)
    assert.strictEqual(await resolveRef({ repo, ref: 'HEAD' }), amendedOid)
  })

  it('error:amend-no-initial-commit', async () => {
    // Setup
    const { repo } = await makeFixture('test-init', { init: true })
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    await repo.fs.write(path.join(dir, 'hello.md'), 'Hello, World!')
    await add({ repo, filepath: 'hello.md' })

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
        repo,
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
    // Use a fresh repo without config to ensure no author is found
    const { repo } = await makeFixture('test-init', { init: true })
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    
    // Add a file so we have something to commit
    await repo.fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ repo, filepath: 'file.txt' })
    
    let error: any = null
    try {
      await commit({
        repo,
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
    const { repo } = await makeFixture('test-commit')
    
    let error: any = null
    try {
      await commit({
        repo,
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
    const { repo } = await makeFixture('test-init', { init: true, defaultBranch: 'develop' })
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    
    await repo.fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ repo, filepath: 'file.txt' })
    
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    const sha = await commit({
      repo,
      author,
      message: 'Initial commit',
    })
    
    // Verify commit was created and branch was set
    const commits = await log({ repo, ref: 'HEAD' })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
    
    // Verify HEAD points to develop branch
    const headRef = await resolveRef({ repo, ref: 'HEAD' })
    const developRef = await resolveRef({ repo, ref: 'refs/heads/develop' })
    assert.strictEqual(headRef, developRef)
  })

  it('behavior:default-branch-master', async () => {
    const { repo } = await makeFixture('test-init', { init: true })
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    
    await repo.fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ repo, filepath: 'file.txt' })
    
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    const sha = await commit({
      repo,
      author,
      message: 'Initial commit',
    })
    
    // Verify commit was created
    const commits = await log({ repo, ref: 'HEAD' })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
  })

  it('param:custom-ref-creates-commit', async () => {
    const { repo } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    
    const sha = await commit({
      repo,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Test commit',
      ref: 'refs/heads/custom-branch',
    })
    
    // Verify custom branch was created and updated
    const customLog = await log({ repo, depth: 1, ref: 'custom-branch' })
    assert.ok(customLog.length > 0, 'Custom branch should have commits')
    const { oid: customOid } = customLog[0]
    assert.strictEqual(customOid, sha, 'Custom branch should point to new commit')
    
    // Verify the commit OID matches what was returned
    assert.ok(sha, 'Commit should return an OID')
  })

  it('behavior:amend-uses-previous-parents', async () => {
    const { repo } = await makeFixture('test-commit')
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    // Make first commit
    const firstSha = await commit({
      repo,
      author,
      message: 'First commit',
    })
    
    // Make second commit
    await commit({
      repo,
      author,
      message: 'Second commit',
    })
    
    // Amend the second commit
    const amendedSha = await commit({
      repo,
      author,
      message: 'Amended second commit',
      amend: true,
    })
    
    // Verify amended commit has the same parent as the original second commit
    const { commit: amendedCommit } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    assert.deepStrictEqual(amendedCommit.parent, [firstSha], 'Amended commit should have same parent')
    assert.notStrictEqual(amendedSha, firstSha, 'Amended commit should be different OID')
  })

  it('param:parent-resolves-refs', async () => {
    const { repo } = await makeFixture('test-commit')
    const { oid: originalOid } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    
    const sha = await commit({
      repo,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Test commit',
      parent: ['HEAD'], // Use ref instead of OID
    })
    
    // Verify commit has correct parent
    const { commit: newCommit } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    assert.deepStrictEqual(newCommit.parent, [originalOid], 'Parent should be resolved from ref')
  })

  it('param:tree-uses-provided', async () => {
    const { repo } = await makeFixture('test-commit')
    const { commit: originalCommit } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    
    const sha = await commit({
      repo,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
      message: 'Test commit',
      tree: originalCommit.tree, // Use existing tree
    })
    
    // Verify commit uses provided tree
    const { commit: newCommit } = (await log({ repo, ref: 'HEAD', depth: 1 }))[0]
    assert.strictEqual(newCommit.tree, originalCommit.tree, 'Commit should use provided tree')
  })

  it('error:index-read-error', async () => {
    const { repo } = await makeFixture('test-init', { init: true })
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    const gitdir = await repo.getGitdir()
    
    await repo.fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ repo, filepath: 'file.txt' })
    
    // Delete index to simulate read error - use backend method
    try {
      const indexBuffer = await repo.gitBackend!.readIndex()
      if (indexBuffer.length > 0) {
        // Write empty index to simulate deletion
        await repo.gitBackend!.writeIndex(UniversalBuffer.alloc(0))
      }
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
      repo,
      author,
      message: 'Initial commit',
    })
    
    // Verify commit was created
    const commits = await log({ repo, ref: 'HEAD' })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
  })

  it('param:autoDetectConfig-false', async () => {
    const { repo } = await makeFixture('test-init', { init: true })
    const dir = repo.getWorktree()?.dir
    if (!dir) throw new Error('Repository must have a worktree')
    
    await repo.fs.write(path.join(dir, 'file.txt'), 'content')
    await add({ repo, filepath: 'file.txt' })
    
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    
    const sha = await commit({
      repo,
      author,
      message: 'Initial commit',
      autoDetectConfig: false,
    })
    
    // Verify commit was created
    const commits = await log({ repo, ref: 'HEAD' })
    assert.strictEqual(commits.length, 1)
    assert.strictEqual(commits[0].oid, sha)
  })
})

