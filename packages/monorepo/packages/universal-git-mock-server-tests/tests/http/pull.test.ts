import { test } from 'node:test'
import assert from 'node:assert'
import { setConfig, pull, log, add, commit, Errors } from '@awesome-os/universal-git-src'
import { createMockHttpClient } from '../../helpers/mockHttpServer.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
// join is not exported as subpath, use package import
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('pull', async (t) => {
  await t.test('pull', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-pull')
    const http = await createMockHttpClient('test-pull-server')
    
    await setConfig({
      fs,
      gitdir,
      path: 'remote.origin.url',
      value: 'http://localhost/test-pull-server.git',
    })
    
    // Test initial state
    let logs = await log({ fs, gitdir, dir, ref: 'refs/heads/master' })
    assert.strictEqual(logs.length, 1, 'Should have one commit initially')
    assert.strictEqual(logs[0].commit.message, 'Initial commit\n', 'Initial commit message should match')
    
    // Pull changes
    await pull({
      fs,
      http,
      gitdir,
      dir,
      remote: 'origin',
      ref: 'refs/heads/master',
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
    })
    
    // Verify commits after pull
    logs = await log({ fs, gitdir, dir, ref: 'refs/heads/master' })
    assert.strictEqual(logs.length, 3, 'Should have three commits after pull')
    assert.strictEqual(logs[0].commit.message, 'Added c.txt\n', 'First commit should be Added c.txt')
    assert.strictEqual(logs[1].commit.message, 'Added b.txt\n', 'Second commit should be Added b.txt')
    assert.strictEqual(logs[2].commit.message, 'Initial commit\n', 'Third commit should be Initial commit')
  })

  await t.test('pull fast-forward only', async () => {
    const author = {
      name: 'Mr. Test',
      email: 'mrtest@example.com',
      timestamp: 1262356920,
      timezoneOffset: -0,
    }
    const { fs, gitdir, dir } = await makeFixture('test-pull-no-ff')
    const http = await createMockHttpClient('test-pull-server')
    
    // makeFixture always provides a valid dir that's separate from gitdir
    // Use it directly - no need to create a custom workDir
    await setConfig({
      fs,
      gitdir,
      path: 'remote.origin.url',
      value: 'http://localhost/test-pull-server.git',
    })
    
    // Create a local commit that diverges
    await fs.write(join(dir, 'z.txt'), 'Hi')
    await add({ fs, dir, gitdir, filepath: 'z.txt' })
    await commit({ fs, dir, gitdir, message: 'Added z.txt', author })

    const logs = await log({ fs, gitdir, dir, ref: 'refs/heads/master' })
    assert.strictEqual(logs.length, 2, 'Should have two commits before pull')
    assert.strictEqual(logs[0].commit.message, 'Added z.txt\n', 'First commit should be Added z.txt')
    
    // Try to pull with fastForwardOnly - should fail
    let err: unknown = null
    try {
      await pull({
        fs,
        http,
        gitdir,
        dir,
        remote: 'origin',
        ref: 'refs/heads/master',
        fastForwardOnly: true,
        author,
      })
    } catch (e) {
      err = e
    }
    
    assert.ok(err, 'Should throw an error')
    assert.ok(err instanceof Errors.FastForwardError, 'Should throw FastForwardError')
    if (err instanceof Errors.FastForwardError) {
      assert.strictEqual(err.code, Errors.FastForwardError.code, 'Error code should match')
    }
  })

  await t.test('pull no fast-forward', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-pull-no-ff')
    const http = await createMockHttpClient('test-pull-server')
    
    await setConfig({
      fs,
      gitdir,
      path: 'remote.origin.url',
      value: 'http://localhost/test-pull-server.git',
    })
    
    // Test initial state
    let logs = await log({ fs, gitdir, dir, ref: 'refs/heads/master' })
    assert.strictEqual(logs.length, 1, 'Should have one commit initially')
    
    // Pull with fastForward: false (should create merge commit)
    await pull({
      fs,
      http,
      gitdir,
      dir,
      remote: 'origin',
      ref: 'refs/heads/master',
      fastForward: false,
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
    })
    
    // Verify merge commit was created
    logs = await log({ fs, gitdir, dir, ref: 'refs/heads/master' })
    assert.ok(logs.length >= 2, 'Should have multiple commits after pull')
    
    // Check that first commit is a merge (has multiple parents)
    const firstCommit = logs[0].commit
    assert.ok(firstCommit.parent.length >= 2, 'First commit should be a merge (multiple parents)')
  })
})

