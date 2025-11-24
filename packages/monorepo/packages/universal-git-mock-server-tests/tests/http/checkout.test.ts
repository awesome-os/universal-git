import { test } from 'node:test'
import assert from 'node:assert'
import { fetch as gitFetch, checkout, getConfig, clone } from '@awesome-os/universal-git-src'
import { createMockHttpClient } from '../../helpers/mockHttpServer.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
// join is not exported as subpath, use package import
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'

test('checkout with HTTP', async (t) => {
  await t.test('should setup the remote tracking branch by default', async () => {
    // Get the bare repository fixture (this is the "remote" server)
    const { fs: serverFs, gitdir: serverGitdir } = await makeFixture('test-fetch-server')
    const http = await createMockHttpClient('test-fetch-server')

    // Clone the bare repository into a non-bare repository (simulating a real-world workflow)
    // Use HTTP clone instead of file:// to properly handle bare repositories
    const clonedDir = await mkdtemp(join(tmpdir(), 'test-checkout-clone-'))
    const clonedGitdir = join(clonedDir, '.git')
    
    await clone({
      fs: serverFs,
      http,
      dir: clonedDir,
      gitdir: clonedGitdir,
      url: 'http://localhost/test-fetch-server.git',
      noCheckout: true, // Don't checkout anything yet
    })

    // fetch `test` branch so `refs/remotes/origin/test` exists but `refs/heads/test` does not
    const fetchResult = await gitFetch({
      fs: serverFs,
      dir: clonedDir,
      gitdir: clonedGitdir,
      http,
      singleBranch: true,
      remote: 'origin',
      ref: 'test',
    })
    
    // Verify fetch succeeded
    assert.ok(fetchResult, 'Fetch should succeed')
    assert.ok(fetchResult.fetchHead, 'Fetch should have fetchHead')

    await checkout({
      fs: serverFs,
      dir: clonedDir,
      gitdir: clonedGitdir,
      ref: 'test',
    })

    const [merge, remote] = await Promise.all([
      getConfig({
        fs: serverFs,
        dir: clonedDir,
        gitdir: clonedGitdir,
        path: 'branch.test.merge',
      }),
      getConfig({
        fs: serverFs,
        dir: clonedDir,
        gitdir: clonedGitdir,
        path: 'branch.test.remote',
      }),
    ])

    assert.ok(merge, 'merge config should be set')
    assert.ok(String(merge).includes('refs/heads/test'), 'merge should contain refs/heads/test')
    assert.ok(remote, 'remote config should be set')
    assert.ok(String(remote).includes('origin'), 'remote should contain origin')
  })

  await t.test('should setup the remote tracking branch with `track: true`', async () => {
    // Get the bare repository fixture (this is the "remote" server)
    const { fs: serverFs, gitdir: serverGitdir } = await makeFixture('test-fetch-server')
    const http = await createMockHttpClient('test-fetch-server')

    // Clone the bare repository into a non-bare repository (simulating a real-world workflow)
    // Use HTTP clone instead of file:// to properly handle bare repositories
    const clonedDir = await mkdtemp(join(tmpdir(), 'test-checkout-clone-'))
    const clonedGitdir = join(clonedDir, '.git')
    
    await clone({
      fs: serverFs,
      http,
      dir: clonedDir,
      gitdir: clonedGitdir,
      url: 'http://localhost/test-fetch-server.git',
      noCheckout: true, // Don't checkout anything yet
    })

    // fetch `test` branch so `refs/remotes/origin/test` exists but `refs/heads/test` does not
    await gitFetch({
      fs: serverFs,
      dir: clonedDir,
      gitdir: clonedGitdir,
      http,
      singleBranch: true,
      remote: 'origin',
      ref: 'test',
    })

    // checking the test branch with `track: true` should setup the remote tracking branch
    await checkout({
      fs: serverFs,
      dir: clonedDir,
      gitdir: clonedGitdir,
      ref: 'test',
      track: true,
    })

    const [merge, remote] = await Promise.all([
      getConfig({
        fs: serverFs,
        dir: clonedDir,
        gitdir: clonedGitdir,
        path: 'branch.test.merge',
      }),
      getConfig({
        fs: serverFs,
        dir: clonedDir,
        gitdir: clonedGitdir,
        path: 'branch.test.remote',
      }),
    ])

    assert.ok(merge, 'merge config should be set')
    assert.ok(String(merge).includes('refs/heads/test'), 'merge should contain refs/heads/test')
    assert.ok(remote, 'remote config should be set')
    assert.ok(String(remote).includes('origin'), 'remote should contain origin')
  })

  await t.test('should not setup the remote tracking branch with `track: false`', async () => {
    // Get the bare repository fixture (this is the "remote" server)
    const { fs: serverFs, gitdir: serverGitdir } = await makeFixture('test-fetch-server')
    const http = await createMockHttpClient('test-fetch-server')

    // Clone the bare repository into a non-bare repository (simulating a real-world workflow)
    // Use HTTP clone instead of file:// to properly handle bare repositories
    const clonedDir = await mkdtemp(join(tmpdir(), 'test-checkout-clone-'))
    const clonedGitdir = join(clonedDir, '.git')
    
    await clone({
      fs: serverFs,
      http,
      dir: clonedDir,
      gitdir: clonedGitdir,
      url: 'http://localhost/test-fetch-server.git',
      noCheckout: true, // Don't checkout anything yet
    })

    // fetch `test` branch so `refs/remotes/origin/test` exists but `refs/heads/test` does not
    await gitFetch({
      fs: serverFs,
      dir: clonedDir,
      gitdir: clonedGitdir,
      http,
      singleBranch: true,
      remote: 'origin',
      ref: 'test',
    })

    // checking the test branch with `track: false` should not setup the remote tracking branch
    await checkout({
      fs: serverFs,
      dir: clonedDir,
      gitdir: clonedGitdir,
      ref: 'test',
      track: false,
    })

    const [merge, remote] = await Promise.all([
      getConfig({
        fs: serverFs,
        dir: clonedDir,
        gitdir: clonedGitdir,
        path: 'branch.test.merge',
      }),
      getConfig({
        fs: serverFs,
        dir: clonedDir,
        gitdir: clonedGitdir,
        path: 'branch.test.remote',
      }),
    ])

    assert.strictEqual(merge, undefined, 'merge config should not be set')
    assert.strictEqual(remote, undefined, 'remote config should not be set')
  })
})

