import { test } from 'node:test'
import assert from 'node:assert'
import { fetch, push, setConfig } from '@awesome-os/universal-git-src'
import { createMockHttpClient } from '../../helpers/mockHttpServer.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

/**
 * TODO: Refactor this test to support both real providers and MockHttpServer
 * 
 * The test should:
 * 1. Read API keys/credentials from a .env file in the project root
 * 2. If API keys are provided in the .env file, use real provider URLs (from fixture config)
 *    and real HTTP client to test against actual hosting providers
 * 3. If no API keys are provided, fall back to MockHttpServer (current behavior)
 *    to ensure tests don't break when credentials are not available
 * 
 * This will allow:
 * - CI/CD to run tests without credentials (using MockHttpServer)
 * - Developers with credentials to test against real providers
 * - Both scenarios to be tested without code duplication
 */

// Reuse the same HTTP client across all tests to avoid repeated fixture setup
const sharedHttpPromise = createMockHttpClient('test-hosting-providers')

test('hosting providers', async (t) => {
  // Note: These tests use MockHttpServer instead of real hosting providers
  // They verify that fetch/push operations work correctly with authentication
  // The fixture has remotes configured for awscc, azure, bitbucket, github, gitlab
  // We update their URLs to use localhost with MockHttpServer
  
  const sharedHttp = await sharedHttpPromise

  await t.test('AWS CodeCommit - fetch', async () => {
    const { fs, gitdir } = await makeFixture('test-hosting-providers')
    const http = sharedHttp
    
    // Update remote URL to use MockHttpServer
    await setConfig({
      fs,
      gitdir,
      path: 'remote.awscc.url',
      value: 'http://localhost/test-hosting-providers.git',
    })
    
    const username = 'tester-at-260687965765'
    const password = 'test-password'
    
    // Test
    const res = await fetch({
      fs,
      http,
      gitdir,
      remote: 'awscc',
      ref: 'master',
      onAuth: () => ({ username, password }),
    })
    
    assert.ok(res, 'Result should be truthy')
    assert.strictEqual(res.defaultBranch, 'refs/heads/master', 'defaultBranch should match')
    assert.strictEqual(res.fetchHead, 'c03e131196f43a78888415924bcdcbf3090f3316', 'fetchHead should match')
  })

  await t.test('AWS CodeCommit - push', async () => {
    const { fs, gitdir } = await makeFixture('test-hosting-providers')
    const http = sharedHttp
    
    // Update remote URL to use MockHttpServer
    await setConfig({
      fs,
      gitdir,
      path: 'remote.awscc.url',
      value: 'http://localhost/test-hosting-providers.git',
    })
    await setConfig({
      fs,
      gitdir,
      path: 'branch.master.merge',
      value: 'refs/heads/master',
    })
    
    const username = 'tester-at-260687965765'
    const password = 'test-password'
    
    // Test
    const res = await push({
      fs,
      http,
      gitdir,
      remote: 'awscc',
      ref: 'master',
      force: true,
      onAuth: () => ({ username, password }),
    })
    
    assert.ok(res, 'Result should be truthy')
    assert.strictEqual(res.ok, true, 'Push should be successful')
    assert.ok(res.refs['refs/heads/master'], 'Should have ref status')
    assert.strictEqual(res.refs['refs/heads/master'].ok, true, 'Ref update should be successful')
  })

  await t.test('Azure DevOps - fetch', async () => {
    const { fs, gitdir } = await makeFixture('test-hosting-providers')
    const http = sharedHttp
    
    // Update remote URL to use MockHttpServer
    await setConfig({
      fs,
      gitdir,
      path: 'remote.azure.url',
      value: 'http://localhost/test-hosting-providers.git',
    })
    
    const username = 'isomorphicgittestpush'
    const password = 'test-password'
    
    // Test
    const res = await fetch({
      fs,
      http,
      gitdir,
      remote: 'azure',
      ref: 'master',
      onAuth: () => ({ username, password }),
    })
    
    assert.ok(res, 'Result should be truthy')
    assert.strictEqual(res.defaultBranch, 'refs/heads/master', 'defaultBranch should match')
    assert.strictEqual(res.fetchHead, 'c03e131196f43a78888415924bcdcbf3090f3316', 'fetchHead should match')
  })

  await t.test('Bitbucket - fetch', async () => {
    const { fs, gitdir } = await makeFixture('test-hosting-providers')
    const http = sharedHttp
    
    // Update remote URL to use MockHttpServer
    await setConfig({
      fs,
      gitdir,
      path: 'remote.bitbucket.url',
      value: 'http://localhost/test-hosting-providers.git',
    })
    
    const username = 'isomorphic-git'
    const password = 'test-password'
    
    // Test
    const res = await fetch({
      fs,
      http,
      gitdir,
      remote: 'bitbucket',
      ref: 'master',
      onAuth: () => ({ username, password }),
    })
    
    assert.ok(res, 'Result should be truthy')
    assert.strictEqual(res.defaultBranch, 'refs/heads/master', 'defaultBranch should match')
    assert.strictEqual(res.fetchHead, 'c03e131196f43a78888415924bcdcbf3090f3316', 'fetchHead should match')
  })

  await t.test('Bitbucket - push', async () => {
    const { fs, gitdir } = await makeFixture('test-hosting-providers')
    const http = sharedHttp
    
    // Update remote URL to use MockHttpServer
    await setConfig({
      fs,
      gitdir,
      path: 'remote.bitbucket.url',
      value: 'http://localhost/test-hosting-providers.git',
    })
    await setConfig({
      fs,
      gitdir,
      path: 'branch.master.merge',
      value: 'refs/heads/master',
    })
    
    const username = 'isomorphic-git'
    const password = 'test-password'
    
    // Test
    const res = await push({
      fs,
      http,
      gitdir,
      remote: 'bitbucket',
      ref: 'master',
      force: true,
      onAuth: () => ({ username, password }),
    })
    
    assert.ok(res, 'Result should be truthy')
    assert.strictEqual(res.ok, true, 'Push should be successful')
    assert.ok(res.refs['refs/heads/master'], 'Should have ref status')
    assert.strictEqual(res.refs['refs/heads/master'].ok, true, 'Ref update should be successful')
  })

  await t.test('GitHub - fetch', async () => {
    const { fs, gitdir } = await makeFixture('test-hosting-providers')
    const http = sharedHttp
    
    // Update remote URL to use MockHttpServer
    await setConfig({
      fs,
      gitdir,
      path: 'remote.github.url',
      value: 'http://localhost/test-hosting-providers.git',
    })
    
    const username = 'isomorphic-git-test-push'
    const password = 'test-password'
    
    // Test
    const res = await fetch({
      fs,
      http,
      gitdir,
      remote: 'github',
      ref: 'master',
      onAuth: () => ({ username, password }),
    })
    
    assert.ok(res, 'Result should be truthy')
    assert.ok(res.defaultBranch, 'Should have defaultBranch')
    assert.strictEqual(res.fetchHead, 'c03e131196f43a78888415924bcdcbf3090f3316', 'fetchHead should match')
  })

  await t.test('GitHub - push', async () => {
    const { fs, gitdir } = await makeFixture('test-hosting-providers')
    const http = sharedHttp
    
    // Update remote URL to use MockHttpServer
    await setConfig({
      fs,
      gitdir,
      path: 'remote.github.url',
      value: 'http://localhost/test-hosting-providers.git',
    })
    await setConfig({
      fs,
      gitdir,
      path: 'branch.master.merge',
      value: 'refs/heads/master',
    })
    
    const username = 'isomorphic-git-test-push'
    const password = 'test-password'
    
    // Test
    const res = await push({
      fs,
      http,
      gitdir,
      remote: 'github',
      ref: 'master',
      force: true,
      onAuth: () => ({ username, password }),
    })
    
    assert.ok(res, 'Result should be truthy')
    assert.strictEqual(res.ok, true, 'Push should be successful')
    assert.ok(res.refs['refs/heads/master'], 'Should have ref status')
    assert.strictEqual(res.refs['refs/heads/master'].ok, true, 'Ref update should be successful')
  })
})

