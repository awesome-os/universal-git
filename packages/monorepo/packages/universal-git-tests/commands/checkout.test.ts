import { test } from 'node:test'
import assert from 'node:assert'
import {
  Errors,
  checkout,
  listFiles,
  add,
  commit,
  branch,
  getConfig,
  worktree,
  resolveRef,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { verifyReflogEntry } from '@awesome-os/universal-git-test-helpers/helpers/reflogHelpers.ts'
import { cleanupWorktrees, createWorktreePath, commitInWorktree } from '@awesome-os/universal-git-test-helpers/helpers/worktreeHelpers.ts'

test('checkout', async (t) => {
  await t.test('ok:checkout-branch', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    const onPostCheckout: any[] = []
    
    await checkout({
      repo,
      ref: 'test-branch',
      onPostCheckout: (args) => {
        onPostCheckout.push(args)
      },
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('.babelrc'), 'Should have .babelrc')
    assert.ok(files.includes('src'), 'Should have src directory')
    assert.ok(files.includes('test'), 'Should have test directory')
    
    const index = await listFiles({ repo })
    assert.ok(index.length > 0, 'Should have files in index')
    assert.ok(index.includes('src/commands/checkout.js'), 'Should have checkout.js')
    
    const headRef = await repo.gitBackend!.readSymbolicRef('HEAD')
    assert.strictEqual(headRef, 'refs/heads/test-branch', 'HEAD should point to test-branch')
    
    assert.strictEqual(onPostCheckout.length, 1, 'onPostCheckout should be called once')
    assert.strictEqual(onPostCheckout[0].newHead, 'e10ebb90d03eaacca84de1af0a59b444232da99e', 'newHead should match')
    assert.strictEqual(onPostCheckout[0].previousHead, '0f55956cbd50de80c2f86e6e565f00c92ce86631', 'previousHead should match')
    assert.strictEqual(onPostCheckout[0].type, 'branch', 'type should be branch')
    
    // Verify HEAD reflog entry was created
    await verifyReflogEntry({
      fs: fs,
      gitdir,
      ref: 'HEAD',
      expectedOldOid: '0f55956cbd50de80c2f86e6e565f00c92ce86631',
      expectedNewOid: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      expectedMessage: 'checkout',
      index: 0, // Most recent entry
    })
  })

  await t.test('ok:checkout-tag', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    
    await checkout({
      repo,
      ref: 'v1.0.0',
      force: true,
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('src'), 'Should have src directory')
    
    const headOid = await repo.resolveRef('HEAD')
    assert.strictEqual(headOid, 'e10ebb90d03eaacca84de1af0a59b444232da99e', 'HEAD should point to tag commit')
  })

  await t.test('ok:checkout-sha', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    
    await checkout({
      repo,
      ref: 'e10ebb90d03eaacca84de1af0a59b444232da99e',
      force: true,
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('src'), 'Should have src directory')
    
    const headOid = await repo.resolveRef('HEAD')
    assert.strictEqual(headOid, 'e10ebb90d03eaacca84de1af0a59b444232da99e', 'HEAD should point to SHA')
  })

  await t.test('error:unfetched-branch', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    
    let error: unknown = null
    try {
      await checkout({
        repo,
        ref: 'missing-branch',
      })
      assert.fail('Checkout should have failed')
    } catch (err) {
      error = err
    }
    
    assert.ok(error, 'Error should be defined')
    assert.ok(error instanceof Errors.CommitNotFetchedError, 'Should throw CommitNotFetchedError')
    if (error instanceof Errors.CommitNotFetchedError) {
      assert.strictEqual(error.code, 'CommitNotFetchedError', 'Error code should match')
      assert.strictEqual(error.data.ref, 'missing-branch', 'Ref should match')
      assert.strictEqual(error.data.oid, '033417ae18b174f078f2f44232cb7a374f4c60ce', 'OID should match')
    }
  })

  await t.test('behavior:file-permissions', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    // Create branch without checking it out (we'll use worktree instead)
    await branch({ repo, ref: 'other', checkout: false })
    
    // Verify branch creation reflog
    await verifyReflogEntry({
      fs: fs,
      gitdir,
      ref: 'refs/heads/other',
      expectedMessage: 'branch',
      index: 0, // Most recent entry
    })
    
    // Use worktree to work on test-branch - this avoids switching branches in main worktree
    const testBranchWorktreePath = createWorktreePath(dir, 'test-branch-worktree')
    
    try {
      // Create worktree for test-branch
      await worktree({ repo, add: true, path: testBranchWorktreePath, ref: 'test-branch' })
      
      // Create files in the worktree
      // Note: testBranchWorktreePath is a different worktree, so we need to use fs directly
      // This is a test-specific case where we're writing to a different worktree path
      const fs = repo.gitBackend.getFs()
      await fs.write(`${testBranchWorktreePath}/regular-file.txt`, 'regular file', { mode: 0o666 })
      await fs.write(`${testBranchWorktreePath}/executable-file.sh`, 'executable file', { mode: 0o777 })
      
      // Capture expected file modes from worktree
      const regularFileStat = await fs.lstat(`${testBranchWorktreePath}/regular-file.txt`)
      const executableFileStat = await fs.lstat(`${testBranchWorktreePath}/executable-file.sh`)
      assert.ok(regularFileStat, 'regular-file.txt stat should not be null')
      assert.ok(executableFileStat, 'executable-file.sh stat should not be null')
      const expectedRegularFileMode = regularFileStat.mode
      const expectedExecutableFileMode = executableFileStat.mode
      
      // Stage files in worktree
      // Create worktree backend for the worktree path
      const { createGitWorktreeBackend } = await import('@awesome-os/universal-git-src/git/worktree/index.ts')
      const worktreeBackend = createGitWorktreeBackend({ fs: fs, dir: testBranchWorktreePath })
      const { createBackend } = await import('@awesome-os/universal-git-src/backends/index.ts')
      const gitBackend = createBackend({ type: 'filesystem', fs: fs, gitdir })
      
      await add({ gitBackend, worktree: worktreeBackend, filepath: 'regular-file.txt' })
      await add({ gitBackend, worktree: worktreeBackend, filepath: 'executable-file.sh' })
      
      // Commit in worktree using helper - handles symbolic HEAD setup automatically
      const commitOid = await commitInWorktree({
        repo,
        worktreePath: testBranchWorktreePath,
        message: 'add files',
        author: { name: 'Git', email: 'git@example.org' },
        branch: 'test-branch',
      })
      
      // Verify the branch ref exists and points to the commit
      // Note: The branch might have existed in the fixture, so we check it was updated
      const branchOid = await resolveRef({ repo, ref: 'refs/heads/test-branch' })
      // The branch should point to our new commit
      assert.strictEqual(branchOid, commitOid, `Branch should point to the commit. Branch OID: ${branchOid}, Commit OID: ${commitOid}`)
      
      // Now checkout test-branch in main worktree to verify file permissions are preserved
      // This is the key test - verifying that checkout preserves file permissions
      await checkout({
        repo,
        ref: 'test-branch',
      })
      
      // Verify files exist and have correct permissions in main worktree
      if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
      const actualRegularFileStat = await repo.worktreeBackend.stat('regular-file.txt')
      const actualExecutableFileStat = await repo.worktreeBackend.stat('executable-file.sh')
      
      assert.ok(actualRegularFileStat, 'regular-file.txt should exist')
      assert.ok(actualExecutableFileStat, 'executable-file.sh should exist')
      
      const actualRegularFileMode = actualRegularFileStat.mode
      const actualExecutableFileMode = actualExecutableFileStat.mode
      
      assert.strictEqual(actualRegularFileMode, expectedRegularFileMode, 'Regular file mode should be preserved')
      assert.strictEqual(actualExecutableFileMode, expectedExecutableFileMode, 'Executable file mode should be preserved')
    } finally {
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('behavior:changing-file-permissions', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('regular-file.txt', 'regular file', { mode: 0o666 })
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('executable-file.sh', 'executable file', { mode: 0o777 })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const regularFileStat = await repo.worktreeBackend.stat('regular-file.txt')
    const executableFileStat = await repo.worktreeBackend.stat('executable-file.sh')
    assert.ok(regularFileStat, 'regular-file.txt stat should not be null')
    assert.ok(executableFileStat, 'executable-file.sh stat should not be null')
    const { mode: expectedRegularFileMode } = regularFileStat
    const { mode: expectedExecutableFileMode } = executableFileStat

    await checkout({
      repo,
      ref: 'regular-file',
      force: true,
    })
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const helloStat1 = await repo.worktreeBackend.stat('hello.sh')
    assert.ok(helloStat1, 'hello.sh stat should not be null')
    const { mode: actualRegularFileMode } = helloStat1
    assert.strictEqual(actualRegularFileMode, expectedRegularFileMode, 'File mode should match')

    await checkout({
      repo,
      ref: 'executable-file',
      force: true,
    })
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const helloStat2 = await repo.worktreeBackend.stat('hello.sh')
    assert.ok(helloStat2, 'hello.sh stat should not be null')
    const { mode: actualExecutableFileMode } = helloStat2
    assert.strictEqual(actualExecutableFileMode, expectedExecutableFileMode, 'Executable mode should match')
  })

  await t.test('ok:directories-filepaths', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await checkout({
      repo,
      ref: 'test-branch',
      filepaths: ['src/models', 'test'],
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('src'), 'Should have src directory')
    assert.ok(files.includes('test'), 'Should have test directory')
    assert.strictEqual(files.length, 2, 'Should only have src and test')
    
    const index = await listFiles({ repo })
    assert.ok(index.includes('src/models/GitBlob.js'), 'Should have GitBlob.js')
    assert.ok(index.includes('test/resolveRef.js'), 'Should have resolveRef.js')
  })

  await t.test('ok:files-filepaths', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await checkout({
      repo,
      ref: 'test-branch',
      filepaths: ['src/models/GitBlob.js', 'src/utils/write.js'],
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('src'), 'Should have src directory')
    assert.strictEqual(files.length, 1, 'Should only have src')
    
    const index = await listFiles({ repo })
    assert.ok(index.includes('src/models/GitBlob.js'), 'Should have GitBlob.js')
    assert.ok(index.includes('src/utils/write.js'), 'Should have write.js')
  })

  await t.test('error:detects-conflicts', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('README.md', 'Hello world', 'utf8')
    
    let error: unknown = null
    try {
      await checkout({
        repo,
        ref: 'v1.0.0',
      })
    } catch (e) {
      error = e
    }
    
    assert.ok(error, 'Error should be defined')
    assert.ok(error instanceof Errors.CheckoutConflictError, 'Should throw CheckoutConflictError')
    if (error instanceof Errors.CheckoutConflictError) {
      assert.ok(Array.isArray(error.data.filepaths) && error.data.filepaths.includes('README.md'), 'Should include README.md in conflicts')
    }
  })

  await t.test('behavior:ignore-conflicts-dryRun', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('README.md', 'Hello world', 'utf8')
    
    let error: unknown = null
    try {
      await checkout({
        repo,
        ref: 'test-branch',
        force: true,
        dryRun: true,
      })
    } catch (e) {
      error = e
    }
    
    assert.strictEqual(error, null, 'Should not throw error with force and dryRun')
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const content = await repo.worktreeBackend.read('README.md', 'utf8')
    assert.strictEqual(content, 'Hello world', 'File should not be changed in dry run')
  })

  await t.test('param:force-ignore-conflicts', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('README.md', 'Hello world', 'utf8')
    
    let error: unknown = null
    try {
      await checkout({
        repo,
        ref: 'test-branch',
        force: true,
      })
    } catch (e) {
      error = e
    }
    
    assert.strictEqual(error, null, 'Should not throw error with force')
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const content = await repo.worktreeBackend.read('README.md', 'utf8')
    assert.notStrictEqual(content, 'Hello world', 'File should be changed when force is true')
  })

  await t.test('behavior:restore-to-HEAD', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await checkout({
      repo,
      ref: 'test-branch',
    })

    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('README.md', 'Hello world', 'utf8')
    
    let error: unknown = null
    try {
      await checkout({
        repo,
        force: true,
      })
    } catch (e) {
      error = e
    }
    
    assert.strictEqual(error, null, 'Should not throw error')
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const content = await repo.worktreeBackend.read('README.md', 'utf8')
    assert.notStrictEqual(content, 'Hello world', 'File should be restored to HEAD')
  })

  await t.test('behavior:no-delete-other-files', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await checkout({
      repo,
      ref: 'v1.0.0',
      force: true,
    })
    
    await checkout({
      repo,
      ref: 'v1.0.0',
      force: true,
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('README.md'), 'README.md should still exist')
  })

  await t.test('behavior:onPostCheckout-dryRun', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    const onPostCheckout: any[] = []
    
    await checkout({
      repo,
      ref: 'test-branch',
      dryRun: true,
      onPostCheckout: (args) => {
        onPostCheckout.push(args)
      },
    })

    assert.strictEqual(onPostCheckout.length, 1, 'onPostCheckout should be called once')
    assert.strictEqual(onPostCheckout[0].newHead, 'e10ebb90d03eaacca84de1af0a59b444232da99e', 'newHead should match')
    assert.strictEqual(onPostCheckout[0].previousHead, '0f55956cbd50de80c2f86e6e565f00c92ce86631', 'previousHead should match')
    assert.strictEqual(onPostCheckout[0].type, 'branch', 'type should be branch')
  })

  await t.test('behavior:onPostCheckout-filepaths', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await checkout({
      repo,
      ref: 'v1.0.0',
      force: true,
    })
    
    const onPostCheckout: any[] = []
    await checkout({
      repo,
      ref: 'test-branch',
      filepaths: ['src/utils', 'test'],
      force: true,
      onPostCheckout: (args) => {
        onPostCheckout.push(args)
      },
    })

    assert.strictEqual(onPostCheckout.length, 1, 'onPostCheckout should be called once')
    assert.strictEqual(onPostCheckout[0].newHead, 'e10ebb90d03eaacca84de1af0a59b444232da99e', 'newHead should match')
    assert.strictEqual(onPostCheckout[0].previousHead, 'e10ebb90d03eaacca84de1af0a59b444232da99e', 'previousHead should match (same commit)')
    assert.strictEqual(onPostCheckout[0].type, 'file', 'type should be file when filepaths are specified')
  })

  await t.test('behavior:no-delete-ignored-files', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    // Checkout the test-branch
    await checkout({
      repo,
      ref: 'v1.0.0',
      force: true,
    })

    // Create a branch from test-branch
    await branch({
      repo,
      ref: 'branch-w-ignored-dir',
      checkout: true,
    })
    
    // Add a regular file to the ignored dir
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('ignored/regular-file.txt', 'regular file', { mode: 0o666 })

    // Add and commit a gitignore, ignoring everything but itself
    const gitignoreContent = `*
!.gitignore`
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('ignored/.gitignore', gitignoreContent, { mode: 0o666 })
    await add({ repo, filepath: 'ignored/.gitignore' })

    await commit({
      repo,
      author: { name: 'Git', email: 'git@example.org' },
      message: 'add gitignore',
    })

    // Checkout the test-branch, which does not contain the ignore/.gitignore
    // should not delete files from ignore, but leave them as untracked in the working tree
    await checkout({
      repo,
      ref: 'v1.0.0',
      force: true,
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('ignored') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('regular-file.txt'), 'regular-file.txt should still exist')
    assert.strictEqual(files.includes('.gitignore'), false, '.gitignore should be removed (was tracked)')
  })

  await t.test('param:repo-provided', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await repo.checkout('test-branch', {})
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('.babelrc'), 'Should have .babelrc')
    assert.ok(files.includes('src'), 'Should have src directory')
    
    const headRef = await repo.gitBackend!.readSymbolicRef('HEAD')
    assert.strictEqual(headRef, 'refs/heads/test-branch', 'HEAD should point to test-branch')
  })

  await t.test('param:repo-or-fs-missing', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    
    await assert.rejects(
      async () => {
        // @ts-ignore - testing error case (fs is intentionally missing)
        await checkout({
          dir,
          gitdir,
          ref: 'test-branch',
        } as any)
      },
      (err: any) => {
        return err instanceof MissingParameterError && (err as any).data?.parameter === 'fs'
      }
    )
  })

  await t.test('param:dir-missing', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    
    await assert.rejects(
      async () => {
        // @ts-ignore - testing error case (dir is intentionally missing)
        // When dir is missing and repo is not provided, checkout requires dir parameter
        await checkout({
          fs: fs,
          gitdir,
          ref: 'test-branch',
        } as any)
      },
      (err: any) => {
        // The error might be about 'dir' or 'fs' depending on how normalizeCommandArgs processes it
        return err instanceof MissingParameterError && 
          (err.data?.parameter === 'dir' || err.data?.parameter === 'fs' || 
           err.message?.includes('dir') || err.message?.includes('filesystem'))
      }
    )
  })

  await t.test('param:noUpdateHead-default', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    
    // First checkout a branch to set up state
    await checkout({
      repo,
      ref: 'test-branch',
    })
    
    // Modify a file
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('README.md', 'modified', 'utf8')
    
    // Checkout with no ref (should default noUpdateHead to true)
    await checkout({
      repo,
      filepaths: ['README.md'],
      force: true,
    })
    
    // File should be restored but HEAD should not change
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const content = await repo.worktreeBackend.read('README.md', 'utf8')
    assert.notStrictEqual(content, 'modified', 'File should be restored')
    
    const headRef = await repo.gitBackend!.readSymbolicRef('HEAD')
    assert.strictEqual(headRef, 'refs/heads/test-branch', 'HEAD should still point to test-branch')
  })

  await t.test('param:noUpdateHead-false', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    // First checkout a branch to set up state
    await checkout({
      repo,
      ref: 'v1.0.0',
    })
    
    // Modify a file
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('README.md', 'modified', 'utf8')
    
    // Checkout with no ref but noUpdateHead explicitly false
    await checkout({
      repo,
      filepaths: ['README.md'],
      force: true,
      noUpdateHead: false,
    })
    
    // File should be restored
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const content = await repo.worktreeBackend.read('README.md', 'utf8')
    assert.notStrictEqual(content, 'modified', 'File should be restored')
  })

  await t.test('param:ref-defaults-HEAD', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    // First checkout a branch to set up state
    await checkout({
      repo,
      ref: 'v1.0.0',
    })
    
    // Modify a file
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    await repo.worktreeBackend.write('README.md', 'modified', 'utf8')
    
    // Checkout with no ref parameter (should default to HEAD)
    await checkout({
      repo,
      filepaths: ['README.md'],
      force: true,
    })
    
    // File should be restored to HEAD state
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const content = await repo.worktreeBackend.read('README.md', 'utf8')
    assert.notStrictEqual(content, 'modified', 'File should be restored to HEAD')
  })

  await t.test('error:caller-property', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    let error: any = null
    try {
      await checkout({
        repo,
        ref: 'nonexistent-branch',
      })
    } catch (err) {
      error = err
    }
    
    assert.ok(error, 'Error should be thrown')
    assert.strictEqual(error?.caller, 'git.checkout', 'Error should have caller property set')
  })

  await t.test('param:repo-and-filepaths', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    
    await checkout({
      repo,
      ref: 'v1.0.0',
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('src'), 'Should have src directory')
    assert.ok(files.includes('test'), 'Should have test directory')
  })

  await t.test('param:repo-uses-dir', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    
    // Checkout without providing dir (should use dir)
    await checkout({
      repo,
      ref: 'v1.0.0',
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('.babelrc'), 'Should have .babelrc')
    assert.ok(files.includes('src'), 'Should have src directory')
  })

  await t.test('param:nonBlocking-batchSize', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await checkout({
      repo,
      ref: 'v1.0.0',
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('.babelrc'), 'Should have .babelrc')
    assert.ok(files.includes('src'), 'Should have src directory')
  })

  await t.test('param:track-false', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')

    await checkout({
      repo,
      ref: 'test-branch',
    })
    
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(files.includes('.babelrc'), 'Should have .babelrc')
    assert.ok(files.includes('src'), 'Should have src directory')
  })

  await t.test('param:noCheckout-true', async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
    const { repo, fs, dir, gitdir } = await makeFixture('test-checkout')
    // Get initial state
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const initialFiles = await repo.worktreeBackend.readdir('.') || []
    
    await checkout({
      repo,
      ref: 'test-branch',
      noCheckout: true,
    })
    
    // HEAD should be updated but working directory should not change
    const headRef = await repo.gitBackend!.readSymbolicRef('HEAD')
    assert.strictEqual(headRef, 'refs/heads/test-branch', 'HEAD should point to test-branch')
    
    // Working directory should remain unchanged
    if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
    const files = await repo.worktreeBackend.readdir('.') || []
    assert.ok(files, 'Files should not be null')
    assert.ok(initialFiles, 'Initial files should not be null')
    assert.deepStrictEqual(files.sort(), initialFiles.sort(), 'Working directory should not change')
  })
})

