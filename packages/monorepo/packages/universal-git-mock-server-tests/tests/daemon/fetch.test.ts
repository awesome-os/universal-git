/**
 * Tests for fetch operation over git:// protocol
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { setConfig, fetch } from '@awesome-os/universal-git-src'
import { createMockDaemonClient } from '../../helpers/mockGitDaemon.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('fetch over git:// protocol', async (t) => {
  await t.test('fetch from mock daemon server', async () => {
    const { fs, gitdir } = await makeFixture('test-fetch-server')
    const { daemon, url, tcp } = await createMockDaemonClient('test-fetch-server')
    
    try {
      await setConfig({
        fs,
        gitdir,
        path: 'remote.origin.url',
        value: url,
      })
      
      // Test fetch
      await fetch({
        fs,
        tcp,
        gitdir,
        singleBranch: true,
        remote: 'origin',
        ref: 'master',
      })
      
      assert.ok(await fs.exists(`${gitdir}/refs/remotes/origin/master`), 'Should have remote ref')
      assert.strictEqual(await fs.exists(`${gitdir}/refs/remotes/origin/test`), false, 'Should not have other branches when singleBranch is true')
    } finally {
      await daemon.stop()
    }
  })

  await t.test('fetch empty repository', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const { daemon, url, tcp } = await createMockDaemonClient('test-empty')
    
    try {
      await fetch({
        fs,
        tcp,
        dir,
        gitdir,
        depth: 1,
        url,
      })
      
      assert.ok(await fs.exists(dir), 'Directory should exist')
      assert.ok(await fs.exists(`${gitdir}/HEAD`), 'HEAD should exist')
      const headContent = await fs.read(`${gitdir}/HEAD`)
      const head = headContent ? (typeof headContent === 'string' ? headContent : headContent.toString('utf8')).trim() : ''
      assert.strictEqual(head, 'ref: refs/heads/master', 'HEAD should point to master')
    } finally {
      await daemon.stop()
    }
  })

  await t.test('fetch --prune', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-fetch-client')
    const { daemon, url, tcp } = await createMockDaemonClient('test-fetch-server')
    
    try {
      await setConfig({
        fs,
        gitdir,
        path: 'remote.origin.url',
        value: url,
      })
      
      // Verify test-prune ref exists before pruning
      assert.ok(await fs.exists(`${gitdir}/refs/remotes/origin/test-prune`), 'test-prune should exist before prune')
      
      const { pruned } = await fetch({
        fs,
        tcp,
        dir,
        gitdir,
        depth: 1,
        prune: true,
      })
      
      assert.ok(pruned, 'Should return pruned refs')
      assert.ok(Array.isArray(pruned), 'Pruned should be an array')
      assert.ok(pruned.length > 0, 'Should have pruned at least one ref')
      assert.strictEqual(await fs.exists(`${gitdir}/refs/remotes/origin/test-prune`), false, 'test-prune should be removed after prune')
    } finally {
      await daemon.stop()
    }
  })
})

