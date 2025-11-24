import { test } from 'node:test'
import assert from 'node:assert'
import { commit, checkout, merge, push, rebase, init, add, branch, resolveRef } from '@awesome-os/universal-git-src'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { createMockHttpClient } from '../../helpers/mockHttpServer.ts'
import * as os from 'os'
import * as path from 'path'
import { promises as nodeFs } from 'fs'

/**
 * Helper to create a hook script that writes to a file
 * Uses Node.js for cross-platform compatibility
 */
async function createHookScript(
  hookPath: string,
  outputPath: string,
  exitCode: number = 0,
  message: string = 'hook executed'
): Promise<void> {
  const fullPath = path.join(hookPath)
  const dir = path.dirname(fullPath)
  await nodeFs.mkdir(dir, { recursive: true })
  
  // Create a Node.js script for cross-platform compatibility
  // No shebang - will be detected as Node.js script and executed with node
  const script = `const fs = require('fs');
fs.writeFileSync('${outputPath.replace(/\\/g, '/')}', '${message}');
process.exit(${exitCode});
`
  await nodeFs.writeFile(fullPath, script, { mode: 0o755 })
}

/**
 * Helper to read hook output file
 */
async function readHookOutput(outputPath: string): Promise<string | null> {
  try {
    return await nodeFs.readFile(outputPath, 'utf8')
  } catch {
    return null
  }
}

test('Git Hooks', async (t) => {
  await t.test('pre-commit hook - aborts commit on failure', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-commit-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    
    // Create a file to commit
    await nodeFs.writeFile(path.join(dir, 'test.txt'), 'test content')
    
    // Create a pre-commit hook that fails
    await createHookScript(
      path.join(hooksPath, 'pre-commit'),
      outputPath,
      1
    )
    
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    
    let error: any = null
    try {
      await commit({
        fs,
        dir,
        gitdir,
        message: 'Test commit',
        author: {
          name: 'Test',
          email: 'test@example.com',
        },
      })
    } catch (e) {
      error = e
    }
    
    assert.ok(error, 'Commit should have been aborted')
    // Check if error mentions hook (could be different formats)
    // On Windows, the error might be about spawn failure, so check for that too
    assert.ok(
      error.message.includes('pre-commit') || 
      error.message.includes('hook failed') || 
      error.message.includes('Hook') ||
      error.message.includes('spawn'),
      `Error should mention pre-commit hook or spawn error. Got: ${error.message}`
    )
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('pre-commit hook - allows commit on success', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-commit-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    
    // Create a file to commit
    await nodeFs.writeFile(path.join(dir, 'test.txt'), 'test content')
    
    // Create a pre-commit hook that succeeds
    await createHookScript(
      path.join(hooksPath, 'pre-commit'),
      outputPath,
      0
    )
    
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    
    const oid = await commit({
      fs,
      dir,
      gitdir,
      message: 'Test commit',
      author: {
        name: 'Test',
        email: 'test@example.com',
      },
    })
    
    assert.ok(oid, 'Commit should succeed')
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('post-checkout hook - executes after checkout', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-checkout-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    
    // Create initial commit on master
    await add({ fs, dir, gitdir, filepath: '.' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a branch to checkout
    await branch({ fs, dir, gitdir, ref: 'test-branch', checkout: false })
    
    // Create a post-checkout hook
    await createHookScript(
      path.join(hooksPath, 'post-checkout'),
      outputPath,
      0,
      'post-checkout hook executed'
    )
    
    await checkout({ fs, dir, gitdir, ref: 'test-branch' })
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('post-checkout hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('post-merge hook - executes after merge', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-merge-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    
    // Create initial commit on master
    await add({ fs, dir, gitdir, filepath: '.' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a branch to merge
    await branch({ fs, dir, gitdir, ref: 'feature', checkout: true })
    await nodeFs.writeFile(path.join(dir, 'feature.txt'), 'feature content')
    await add({ fs, dir, gitdir, filepath: 'feature.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Feature commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await checkout({ fs, dir, gitdir, ref: 'master' })
    
    // Create a post-merge hook
    await createHookScript(
      path.join(hooksPath, 'post-merge'),
      outputPath,
      0,
      'post-merge hook executed'
    )
    
    await merge({ fs, dir, gitdir, ours: 'master', theirs: 'feature' })
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('post-merge hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('pre-push hook - aborts push on failure', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-push-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    const http = await createMockHttpClient('test-push-hooks-server')
    
    // Set up remote
    await init({ fs, dir, gitdir })
    await nodeFs.writeFile(path.join(dir, 'test.txt'), 'test content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a pre-push hook that fails
    await createHookScript(
      path.join(hooksPath, 'pre-push'),
      outputPath,
      1
    )
    
    let error: any = null
    try {
      await push({
        fs,
        http,
        gitdir,
        remote: 'origin',
        ref: 'refs/heads/master',
        remoteRef: 'refs/heads/master',
        url: 'http://localhost/test-push-hooks-server.git',
      })
    } catch (e) {
      error = e
    }
    
    assert.ok(error, 'Push should have been aborted')
    // Check if error mentions hook (could be different formats)
    assert.ok(
      error.message.includes('pre-push') || 
      error.message.includes('hook failed') || 
      error.message.includes('Hook') ||
      error.message.includes('spawn'),
      `Error should mention pre-push hook or spawn error. Got: ${error.message}`
    )
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('pre-push hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('pre-push hook - allows push on success', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-push-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    const http = await createMockHttpClient('test-push-hooks-server')
    
    // Set up remote
    await init({ fs, dir, gitdir })
    await nodeFs.writeFile(path.join(dir, 'test.txt'), 'test content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a pre-push hook that succeeds
    await createHookScript(
      path.join(hooksPath, 'pre-push'),
      outputPath,
      0,
      'pre-push hook executed'
    )
    
    const result = await push({
      fs,
      http,
      gitdir,
      remote: 'origin',
      remoteRef: 'refs/heads/master',
      ref: 'refs/heads/master',
      url: 'http://localhost/test-push-hooks-server.git',
    })
    
    assert.ok(result, 'Push should succeed')
    assert.strictEqual(result.ok, true, 'Push should be successful')
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('pre-push hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('post-push hook - executes after successful push', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-push-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    const http = await createMockHttpClient('test-push-hooks-server')
    
    // Set up remote
    await init({ fs, dir, gitdir })
    await nodeFs.writeFile(path.join(dir, 'test.txt'), 'test content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a post-push hook
    await createHookScript(
      path.join(hooksPath, 'post-push'),
      outputPath,
      0,
      'post-push hook executed'
    )
    
    const result = await push({
      fs,
      http,
      gitdir,
      remote: 'origin',
      remoteRef: 'refs/heads/master',
      ref: 'refs/heads/master',
      url: 'http://localhost/test-push-hooks-server.git',
    })
    
    assert.ok(result, 'Push should succeed')
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('post-push hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('pre-rebase hook - aborts rebase on failure', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-rebase-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    
    // Create initial commit on master
    await add({ fs, dir, gitdir, filepath: '.' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a branch to rebase
    await branch({ fs, dir, gitdir, ref: 'feature', checkout: true })
    await nodeFs.writeFile(path.join(dir, 'feature.txt'), 'feature content')
    await add({ fs, dir, gitdir, filepath: 'feature.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Feature commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    const masterOid = await resolveRef({ fs, gitdir, ref: 'refs/heads/master' })
    
    // Create a pre-rebase hook that fails
    await createHookScript(
      path.join(hooksPath, 'pre-rebase'),
      outputPath,
      1
    )
    
    let error: any = null
    try {
      await rebase({
        fs,
        dir,
        gitdir,
        upstream: 'master',
        branch: 'feature',
      })
    } catch (e) {
      error = e
    }
    
    assert.ok(error, 'Rebase should have been aborted')
    // Check if error mentions hook (could be different formats)
    assert.ok(
      error.message.includes('pre-rebase') || 
      error.message.includes('hook failed') || 
      error.message.includes('Hook') ||
      error.message.includes('spawn'),
      `Error should mention pre-rebase hook or spawn error. Got: ${error.message}`
    )
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('pre-rebase hook executed'), 'Hook should have executed')
    
    // Verify branch was not rebased
    const featureOid = await resolveRef({ fs, gitdir, ref: 'refs/heads/feature' })
    assert.notStrictEqual(featureOid, masterOid, 'Branch should not have been rebased')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('pre-rebase hook - allows rebase on success', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-rebase-hooks')
    const hooksPath = path.join(gitdir, 'hooks')
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    
    // Create initial commit on master
    await add({ fs, dir, gitdir, filepath: '.' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a branch to rebase
    await branch({ fs, dir, gitdir, ref: 'feature', checkout: true })
    await nodeFs.writeFile(path.join(dir, 'feature.txt'), 'feature content')
    await add({ fs, dir, gitdir, filepath: 'feature.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'Feature commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a pre-rebase hook that succeeds
    await createHookScript(
      path.join(hooksPath, 'pre-rebase'),
      outputPath,
      0,
      'pre-rebase hook executed'
    )
    
    const result = await rebase({
      fs,
      dir,
      gitdir,
      upstream: 'master',
      branch: 'feature',
    })
    
    assert.ok(result, 'Rebase should succeed')
    assert.ok(result.oid, 'Rebase should return OID')
    
    // Verify hook was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('pre-rebase hook executed'), 'Hook should have executed')
    
    // Cleanup
    try {
      await nodeFs.unlink(outputPath)
    } catch {}
  })

  await t.test('hooks respect core.hooksPath config', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-commit-hooks')
    const customHooksPath = path.join(os.tmpdir(), `custom-hooks-${Date.now()}`)
    const outputPath = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`)
    
    // Set custom hooks path
    await init({ fs, dir, gitdir })
    const { setConfig } = await import('@awesome-os/universal-git-src')
    await setConfig({
      fs,
      gitdir,
      path: 'core.hooksPath',
      value: customHooksPath,
    })
    
    // Create hook in custom location
    await createHookScript(
      path.join(customHooksPath, 'pre-commit'),
      outputPath,
      0,
      'custom hooks path hook executed'
    )
    
    await nodeFs.writeFile(path.join(dir, 'test.txt'), 'test content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    
    const oid = await commit({
      fs,
      dir,
      gitdir,
      message: 'Test commit',
      author: {
        name: 'Test',
        email: 'test@example.com',
      },
    })
    
    assert.ok(oid, 'Commit should succeed')
    
    // Verify hook from custom path was executed
    const output = await readHookOutput(outputPath)
    assert.ok(output, 'Hook should have written output')
    assert.ok(output.includes('custom hooks path hook executed'), 'Hook from custom path should have executed')
    
    // Cleanup
    try {
      await fs.unlink(outputPath)
      await nodeFs.rmdir(customHooksPath, { recursive: true })
    } catch {}
  })

  await t.test('hooks are skipped when they do not exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-commit-hooks')
    
    // No hooks directory exists
    await nodeFs.writeFile(path.join(dir, 'test.txt'), 'test content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    
    // Commit should succeed without hooks
    const oid = await commit({
      fs,
      dir,
      gitdir,
      message: 'Test commit',
      author: {
        name: 'Test',
        email: 'test@example.com',
      },
    })
    
    assert.ok(oid, 'Commit should succeed even without hooks')
  })
})

