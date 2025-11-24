import { test } from 'node:test'
import assert from 'node:assert'
import { clone, checkout, listFiles, commit, submodule, resolveRef } from '@awesome-os/universal-git-src'
import { createMockHttpClient } from '../../helpers/mockHttpServer.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('submodule support', async (t) => {
  await t.test('submodules are still staged after fresh clone', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Test
    const files = await listFiles({ fs, gitdir })
    assert.ok(files.includes('test.empty'), 'Should contain test.empty submodule')
  })

  await t.test('submodules are still staged after making a commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
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
      message: 'test commit',
    })
    
    const files = await listFiles({ fs, gitdir })
    assert.ok(files.includes('test.empty'), 'Should contain test.empty submodule after commit')
  })

  await t.test('submodules are staged when switching to a branch that has them', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      ref: 'no-modules',
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Test: Use checkout to switch to master branch (creates local branch if needed)
    // Then use worktree to check master branch
    // Note: worktree requires the ref to exist, so we use checkout first to create the local branch
    await checkout({ fs, dir, gitdir, ref: 'master' })
    
    const files = await listFiles({ fs, gitdir })
    assert.ok(files.includes('test.empty'), 'Should contain test.empty when switching to master branch')
  })

  await t.test("submodules are unstaged when switching to a branch that doesn't have them", async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Test: Use checkout to switch to no-modules branch
    // Note: The clone was done with ref: 'no-modules', so this branch should already exist
    await checkout({ fs, dir, gitdir, ref: 'no-modules' })
    
    const files = await listFiles({ fs, gitdir })
    assert.strictEqual(files.includes('test.empty'), false, 'Should not contain test.empty when switching to no-modules branch')
  })

  await t.test('submodule update clones and checks out the correct commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    // Register both the parent repo and the submodule repo fixtures
    // Use test-clone as a fallback for test.empty submodule (it's a simple empty repo)
    const http = await createMockHttpClient('test-submodules', ['test-clone'])
    
    // First clone the parent repository
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Get the submodule commit OID from HEAD tree
    const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    const { readObject } = await import('@awesome-os/universal-git-src/git/objects/readObject.ts')
    const { parse: parseCommit } = await import('@awesome-os/universal-git-src/core-utils/parsers/Commit.ts')
    const { resolveFilepath } = await import('@awesome-os/universal-git-src/utils/resolveFilepath.ts')
    const { object: commitObject } = await readObject({ fs, cache: {}, gitdir, oid: headOid })
    const commit = parseCommit(commitObject as Buffer)
    const expectedCommitOid = await resolveFilepath({ fs, cache: {}, gitdir, oid: commit.tree, filepath: 'test.empty' })
    
    // Update the submodule
    const result = await submodule({
      fs,
      dir,
      gitdir,
      http,
      update: true,
      name: 'test.empty',
    }) as { updated: string; commitOid: string }
    
    // Verify result
    assert.strictEqual(result.updated, 'test.empty', 'Should return updated submodule name')
    assert.strictEqual(result.commitOid, expectedCommitOid, 'Should return the correct commit OID')
    
    // Verify submodule directory exists
    const { join } = await import('@awesome-os/universal-git-src/utils/join.ts')
    const submoduleDir = join(dir, 'test.empty')
    const submoduleExists = await fs.exists(submoduleDir)
    assert.ok(submoduleExists, 'Submodule directory should exist')
    
    // Verify .git file exists and points to the correct gitdir
    const gitFile = join(submoduleDir, '.git')
    const gitFileContent = await fs.read(gitFile, 'utf8')
    assert.ok(gitFileContent !== null, 'gitFileContent should not be null')
    const gitFileContentStr = typeof gitFileContent === 'string' ? gitFileContent : gitFileContent.toString('utf8')
    assert.ok(gitFileContentStr.includes('gitdir:'), '.git file should contain gitdir:')
    
    // Verify submodule is at the correct commit (detached HEAD)
    const submoduleGitdir = gitFileContentStr.replace('gitdir:', '').trim()
    const submoduleHead = await resolveRef({ fs, gitdir: submoduleGitdir, ref: 'HEAD' })
    assert.strictEqual(submoduleHead, expectedCommitOid, 'Submodule should be at the correct commit')
  })

  await t.test('submodule init copies URL from .gitmodules to .git/config', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules', ['test-clone'])
    
    // First clone the parent repository to get .gitmodules
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Get submodule info from .gitmodules
    const { getSubmoduleByName } = await import('@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts')
    const submoduleInfo = await getSubmoduleByName({ fs, dir, name: 'test.empty' })
    assert.ok(submoduleInfo, 'Submodule should exist in .gitmodules')
    
    // Initialize the submodule
    await submodule({
      fs,
      dir,
      gitdir,
      init: true,
      name: 'test.empty',
    })
    
    // Verify URL was copied to .git/config
    const { getConfig } = await import('@awesome-os/universal-git-src')
    const configUrl = await getConfig({ fs, gitdir, path: 'submodule.test.empty.url' })
    assert.strictEqual(configUrl, submoduleInfo!.url, 'Submodule URL should be in .git/config')
  })

  await t.test('submodule status detects if submodule is at correct commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules', ['test-clone'])
    
    // First clone the parent repository
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Check status before update (should be uninitialized)
    const statusBefore = await submodule({
      fs,
      dir,
      gitdir,
      status: true,
      name: 'test.empty',
    }) as { name: string; path: string; url: string; expectedOid: string; actualOid: string | null; status: string }
    
    assert.strictEqual(statusBefore.status, 'uninitialized', 'Submodule should be uninitialized before update')
    assert.ok(statusBefore.expectedOid, 'Expected OID should be present')
    assert.strictEqual(statusBefore.actualOid, null, 'Actual OID should be null for uninitialized submodule')
    
    // Update the submodule
    await submodule({
      fs,
      dir,
      gitdir,
      http,
      update: true,
      name: 'test.empty',
    })
    
    // Check status after update (should be match)
    const statusAfter = await submodule({
      fs,
      dir,
      gitdir,
      status: true,
      name: 'test.empty',
    }) as { name: string; path: string; url: string; expectedOid: string; actualOid: string | null; status: string }
    
    assert.strictEqual(statusAfter.status, 'match', 'Submodule should be at correct commit after update')
    assert.strictEqual(statusAfter.expectedOid, statusAfter.actualOid, 'Expected and actual OIDs should match')
    assert.ok(statusAfter.actualOid, 'Actual OID should be present')
  })

  await t.test('submodule status lists all submodules when no name provided', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules', ['test-clone'])
    
    // First clone the parent repository
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Check status for all submodules
    const statuses = await submodule({
      fs,
      dir,
      gitdir,
      status: true,
    }) as Array<{ name: string; path: string; url: string; expectedOid: string; actualOid: string | null; status: string }>
    
    assert.ok(Array.isArray(statuses), 'Should return an array')
    assert.ok(statuses.length > 0, 'Should return at least one submodule status')
    
    const testEmptyStatus = statuses.find(s => s.name === 'test.empty')
    assert.ok(testEmptyStatus, 'Should include test.empty submodule')
    assert.strictEqual(testEmptyStatus!.status, 'uninitialized', 'Submodule should be uninitialized')
  })

  await t.test('submodule sync updates URLs from .gitmodules to .git/config', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules', ['test-clone'])
    
    // First clone the parent repository
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Get submodule info from .gitmodules
    const { getSubmoduleByName } = await import('@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts')
    const submoduleInfo = await getSubmoduleByName({ fs, dir, name: 'test.empty' })
    assert.ok(submoduleInfo, 'Submodule should exist in .gitmodules')
    
    // Manually change the URL in .git/config to something different
    const { setConfig } = await import('@awesome-os/universal-git-src')
    await setConfig({ fs, gitdir, path: 'submodule.test.empty.url', value: 'http://example.com/wrong-url.git' })
    
    // Verify URL was changed
    const { getConfig } = await import('@awesome-os/universal-git-src')
    let configUrl = await getConfig({ fs, gitdir, path: 'submodule.test.empty.url' })
    assert.strictEqual(configUrl, 'http://example.com/wrong-url.git', 'URL should be changed in config')
    
    // Sync the submodule URL
    const result = await submodule({
      fs,
      dir,
      gitdir,
      sync: true,
      name: 'test.empty',
    }) as { name: string; url: string }
    
    // Verify result
    assert.strictEqual(result.name, 'test.empty', 'Should return submodule name')
    assert.strictEqual(result.url, submoduleInfo!.url, 'Should return URL from .gitmodules')
    
    // Verify URL was synced back to .git/config
    configUrl = await getConfig({ fs, gitdir, path: 'submodule.test.empty.url' })
    assert.strictEqual(configUrl, submoduleInfo!.url, 'URL should be synced from .gitmodules to .git/config')
  })

  await t.test('submodule sync updates all submodules when no name provided', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-submodules')
    const http = await createMockHttpClient('test-submodules', ['test-clone'])
    
    // First clone the parent repository
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: 'http://localhost/test-submodules.git',
      noCheckout: false,
    })
    
    // Sync all submodules
    const results = await submodule({
      fs,
      dir,
      gitdir,
      sync: true,
    }) as Array<{ name: string; url: string }>
    
    // Verify results
    assert.ok(Array.isArray(results), 'Should return an array')
    assert.ok(results.length > 0, 'Should return at least one submodule')
    
    const testEmptyResult = results.find(r => r.name === 'test.empty')
    assert.ok(testEmptyResult, 'Should include test.empty submodule')
    assert.ok(testEmptyResult!.url, 'Should include URL')
    
    // Verify URL was synced to .git/config
    const { getConfig } = await import('@awesome-os/universal-git-src')
    const configUrl = await getConfig({ fs, gitdir, path: 'submodule.test.empty.url' })
    assert.strictEqual(configUrl, testEmptyResult!.url, 'URL should be synced to .git/config')
  })
})

