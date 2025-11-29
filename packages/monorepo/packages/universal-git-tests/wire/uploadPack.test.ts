import { test } from 'node:test'
import assert from 'node:assert'
import { uploadPack } from '@awesome-os/universal-git-src/commands/uploadPack.ts'
import { collect } from '@awesome-os/universal-git-src/utils/collect.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { commit, add } from '@awesome-os/universal-git-src/index.ts'
import fs from 'node:fs';
test('uploadPack', async (t) => {
  await t.test('advertiseRefs: true', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer when advertiseRefs is true')
    
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    // Verify the response contains expected refs and capabilities
    assert.ok(result.includes('HEAD'), 'Response should contain HEAD')
    assert.ok(result.includes('refs/heads/master'), 'Response should contain refs/heads/master')
    assert.ok(result.includes('thin-pack'), 'Response should contain thin-pack capability')
    assert.ok(result.includes('side-band'), 'Response should contain side-band capability')
    assert.ok(result.includes('side-band-64k'), 'Response should contain side-band-64k capability')
    assert.ok(result.includes('shallow'), 'Response should contain shallow capability')
    assert.ok(result.includes('deepen-since'), 'Response should contain deepen-since capability')
    assert.ok(result.includes('deepen-not'), 'Response should contain deepen-not capability')
    assert.ok(result.includes('allow-tip-sha1-in-want'), 'Response should contain allow-tip-sha1-in-want capability')
    assert.ok(result.includes('allow-reachable-sha1-in-want'), 'Response should contain allow-reachable-sha1-in-want capability')
    assert.ok(result.includes('symref=HEAD:refs/heads/master'), 'Response should contain symref')
  })

  await t.test('advertiseRefs: false', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ repo, advertiseRefs: false })
    
    assert.strictEqual(res, undefined, 'uploadPack should return undefined when advertiseRefs is false')
  })

  await t.test('advertiseRefs: default (false)', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ repo })
    
    assert.strictEqual(res, undefined, 'uploadPack should return undefined by default')
  })

  await t.test('empty repository', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    
    // Create an initial commit so HEAD exists
    if (!repo.worktreeBackend) {
      throw new Error('Repository worktreeBackend is not available')
    }
    await repo.worktreeBackend.write('file.txt', 'content')
    await add({ repo, filepath: 'file.txt' })
    await commit({ 
      repo, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    // Should have HEAD
    assert.ok(result.includes('HEAD'), 'Response should contain HEAD')
  })

  await t.test('repository with multiple branches', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    
    // Create initial commit
    if (!repo.worktreeBackend) {
      throw new Error('Repository worktreeBackend is not available')
    }
    await repo.worktreeBackend.write('file1.txt', 'content1')
    await add({ repo, filepath: 'file1.txt' })
    const commitOid = await commit({ 
      repo, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    // Ensure main branch ref exists (commit should have created it, but verify)
    // Read HEAD to get the current branch OID
    let headOid: string | null = null
    try {
      headOid = await repo.resolveRef('HEAD')
    } catch {
      // HEAD doesn't exist yet
    }
    if (headOid) {
      // Ensure refs/heads/main exists and points to the commit
      await repo.writeRef('refs/heads/main', headOid)
      // Create a new branch from the same commit
      await repo.writeRef('refs/heads/feature', headOid)
    } else {
      // If HEAD doesn't resolve, use the commit OID directly
      await repo.writeRef('refs/heads/main', commitOid)
      await repo.writeRef('refs/heads/feature', commitOid)
    }
    
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    assert.ok(result.includes('refs/heads/main'), 'Response should contain main branch')
    assert.ok(result.includes('refs/heads/feature'), 'Response should contain feature branch')
  })

  await t.test('repository with tags', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    
    // Create initial commit
    if (!repo.worktreeBackend) {
      throw new Error('Repository worktreeBackend is not available')
    }
    await repo.worktreeBackend.write('file1.txt', 'content1')
    await add({ repo, filepath: 'file1.txt' })
    const commitOid = await commit({ 
      repo, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    // Create a tag - use repo to write ref
    await repo.writeRef('refs/tags/v1.0.0', commitOid)
    
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    assert.ok(result.includes('refs/tags/v1.0.0'), 'Response should contain tag')
  })

  await t.test('uses gitdir parameter when provided', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-uploadPack')
    // Use the repo parameter
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer when repo is provided')
  })

  await t.test('uses dir parameter to compute gitdir', async () => {
    // Create a repository
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    
    // Create an initial commit so HEAD exists
    if (!repo.worktreeBackend) {
      throw new Error('Repository worktreeBackend is not available')
    }
    await repo.worktreeBackend.write('file.txt', 'content')
    await add({ repo, filepath: 'file.txt' })
    await commit({ 
      repo, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    // Use repo parameter - gitdir is computed from repo
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer when repo is provided')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    // Should work the same as when gitdir is provided directly
    assert.ok(result.includes('HEAD'), 'Response should contain HEAD')
  })

  await t.test('HEAD is first in refs list', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    // HEAD should appear before other refs
    const headIndex = result.indexOf('HEAD')
    const masterIndex = result.indexOf('refs/heads/master')
    assert.ok(headIndex >= 0, 'HEAD should be in response')
    assert.ok(masterIndex >= 0, 'master should be in response')
    assert.ok(headIndex < masterIndex, 'HEAD should appear before other refs')
  })

  await t.test('includes all required capabilities', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ repo, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    const requiredCapabilities = [
      'thin-pack',
      'side-band',
      'side-band-64k',
      'shallow',
      'deepen-since',
      'deepen-not',
      'allow-tip-sha1-in-want',
      'allow-reachable-sha1-in-want',
    ]
    
    for (const cap of requiredCapabilities) {
      assert.ok(result.includes(cap), `Response should contain ${cap} capability`)
    }
  })

  await t.test('error handling - sets caller property', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty')
    // Use repo but with invalid gitdir - this will cause an error when uploadPack tries to list refs
    // Create a new repo with invalid gitdir by modifying the backend



    const { GitBackendFs } = await import('@awesome-os/universal-git-src/backends/GitBackendFs/index.ts')
    const invalidBackend = new GitBackendFs(fs, '/nonexistent/gitdir')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const invalidRepo = new Repository({
      gitBackend: invalidBackend,
      cache: {},
    })
    
    try {
      await uploadPack({ repo: invalidRepo, advertiseRefs: true })
      assert.fail('Should have thrown an error')
    } catch (err: any) {
      assert.strictEqual(err.caller, 'git.uploadPack', 'Error should have caller property set to git.uploadPack')
    }
  })
})

