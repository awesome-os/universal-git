/**
 * Tests for push operation over git:// protocol
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { setConfig, push, resolveRef } from '@awesome-os/universal-git-src'
import { createMockDaemonClient } from '../../helpers/mockGitDaemon.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('push over git:// protocol', async (t) => {
  await t.test('push to mock daemon server', async () => {
    const { fs, gitdir } = await makeFixture('test-push')
    const { daemon, url, tcp } = await createMockDaemonClient('test-push-server')
    
    try {
      await setConfig({
        fs,
        gitdir,
        path: 'remote.karma.url',
        value: url,
      })
      await setConfig({
        fs,
        gitdir,
        path: 'branch.master.merge',
        value: 'refs/heads/master',
      })
      
      // Test push
      const res = await push({
        fs,
        tcp,
        gitdir,
        remote: 'karma',
        ref: 'refs/heads/master',
        remoteRef: 'refs/heads/master',
      })
      
      assert.ok(res, 'Result should be truthy')
      assert.strictEqual(res.ok, true, 'Push should be successful')
      assert.ok(res.refs['refs/heads/master'], 'Should have ref status')
      assert.strictEqual(res.refs['refs/heads/master'].ok, true, 'Ref update should be successful')
      
      // Verify remote ref is updated
      const remoteRef = await resolveRef({ fs, gitdir, ref: 'refs/remotes/karma/master' })
      const localRef = await resolveRef({ fs, gitdir, ref: 'refs/heads/master' })
      assert.strictEqual(remoteRef, localRef, 'Remote ref should match local ref')
    } finally {
      await daemon.stop()
    }
  })

  await t.test('push empty', async () => {
    const { fs, gitdir } = await makeFixture('test-push-empty')
    const { daemon, url, tcp } = await createMockDaemonClient('test-push-server')
    
    try {
      await setConfig({
        fs,
        gitdir,
        path: 'remote.karma.url',
        value: url,
      })
      
      const res = await push({
        fs,
        tcp,
        gitdir,
        remote: 'karma',
        ref: 'refs/heads/master',
        remoteRef: 'refs/heads/master',
      })
      
      assert.ok(res, 'Result should be truthy')
      assert.strictEqual(res.ok, true, 'Push should be successful')
    } finally {
      await daemon.stop()
    }
  })
})

