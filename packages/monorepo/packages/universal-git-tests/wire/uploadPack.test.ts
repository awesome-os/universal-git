import { test } from 'node:test'
import assert from 'node:assert'
import { uploadPack } from '@awesome-os/universal-git-src/commands/uploadPack.ts'
import { collect } from '@awesome-os/universal-git-src/utils/collect.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, commit, add } from '@awesome-os/universal-git-src/index.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('uploadPack', async (t) => {
  await t.test('advertiseRefs: true', async () => {
    const { fs, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    
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
    const { fs, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ fs, gitdir, advertiseRefs: false })
    
    assert.strictEqual(res, undefined, 'uploadPack should return undefined when advertiseRefs is false')
  })

  await t.test('advertiseRefs: default (false)', async () => {
    const { fs, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ fs, gitdir })
    
    assert.strictEqual(res, undefined, 'uploadPack should return undefined by default')
  })

  await t.test('empty repository', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    const gitdir = join(dir, '.git')
    
    // Create an initial commit so HEAD exists
    await fs.write(join(dir, 'file.txt'), 'content')
    await add({ fs, dir, filepath: 'file.txt' })
    await commit({ 
      fs, 
      dir, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    // Should have HEAD
    assert.ok(result.includes('HEAD'), 'Response should contain HEAD')
  })

  await t.test('repository with multiple branches', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    const gitdir = join(dir, '.git')
    
    // Create initial commit
    await fs.write(join(dir, 'file1.txt'), 'content1')
    await add({ fs, dir, filepath: 'file1.txt' })
    await commit({ 
      fs, 
      dir, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    // Create a new branch
    await fs.write(join(gitdir, 'refs', 'heads', 'feature'), (await fs.read(join(gitdir, 'refs', 'heads', 'main'))).toString().trim() + '\n')
    
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    assert.ok(result.includes('refs/heads/main'), 'Response should contain main branch')
    assert.ok(result.includes('refs/heads/feature'), 'Response should contain feature branch')
  })

  await t.test('repository with tags', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    const gitdir = join(dir, '.git')
    
    // Create initial commit
    await fs.write(join(dir, 'file1.txt'), 'content1')
    await add({ fs, dir, filepath: 'file1.txt' })
    const commitOid = await commit({ 
      fs, 
      dir, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    // Create a tag
    await fs.write(join(gitdir, 'refs', 'tags', 'v1.0.0'), commitOid + '\n')
    
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    assert.ok(result.includes('refs/tags/v1.0.0'), 'Response should contain tag')
  })

  await t.test('uses gitdir parameter when provided', async () => {
    const { fs, gitdir } = await makeFixture('test-uploadPack')
    // Use the gitdir parameter directly
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer when gitdir is provided')
  })

  await t.test('uses dir parameter to compute gitdir', async () => {
    // Create a repository with both dir and gitdir
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Create an initial commit so HEAD exists
    await fs.write(join(dir, 'file.txt'), 'content')
    await add({ fs, dir, filepath: 'file.txt' })
    await commit({ 
      fs, 
      dir, 
      message: 'Initial commit', 
      author: { name: 'Test', email: 'test@example.com' } 
    })
    
    // Use dir parameter - gitdir should be computed as join(dir, '.git')
    const res = await uploadPack({ fs, dir, advertiseRefs: true })
    
    assert.ok(res, 'uploadPack should return a buffer when dir is provided')
    const buffer = Buffer.from(await collect(res!))
    const result = buffer.toString('utf8')
    
    // Should work the same as when gitdir is provided directly
    assert.ok(result.includes('HEAD'), 'Response should contain HEAD')
  })

  await t.test('HEAD is first in refs list', async () => {
    const { fs, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    
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
    const { fs, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    
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
    const { fs } = await makeFixture('test-empty')
    // Use invalid gitdir to trigger error
    const invalidGitdir = '/nonexistent/gitdir'
    
    try {
      await uploadPack({ fs, gitdir: invalidGitdir, advertiseRefs: true })
      assert.fail('Should have thrown an error')
    } catch (err: any) {
      assert.strictEqual(err.caller, 'git.uploadPack', 'Error should have caller property set to git.uploadPack')
    }
  })
})

