/**
 * Tests for pull operation over git:// protocol
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { setConfig, pull } from '@awesome-os/universal-git-src'
import { createMockDaemonClient } from '../../helpers/mockGitDaemon.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('pull over git:// protocol', async (t) => {
  await t.test('pull from mock daemon server', async () => {
    const { fs, gitdir } = await makeFixture('test-pull-client')
    const { daemon, url, tcp } = await createMockDaemonClient('test-pull-server')
    
    try {
      await setConfig({
        fs,
        gitdir,
        path: 'remote.origin.url',
        value: url,
      })
      await setConfig({
        fs,
        gitdir,
        path: 'branch.master.remote',
        value: 'origin',
      })
      await setConfig({
        fs,
        gitdir,
        path: 'branch.master.merge',
        value: 'refs/heads/master',
      })
      
      // Test pull
      await pull({
        fs,
        tcp,
        gitdir,
        ref: 'master',
      })
      
      // Verify that remote refs were updated
      assert.ok(await fs.exists(`${gitdir}/refs/remotes/origin/master`), 'Should have remote ref')
    } finally {
      await daemon.stop()
    }
  })
})

