/**
 * Tests for clone operation over git:// protocol
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { clone } from '@awesome-os/universal-git-src'
import { createMockDaemonClient } from '../../helpers/mockGitDaemon.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('clone over git:// protocol', async (t) => {
  await t.test('clone from mock daemon server', async () => {
    const { fs: sourceFs, gitdir: sourceGitdir } = await makeFixture('test-clone')
    const { fs, dir } = await makeFixture('test-clone-client')
    const { daemon, url, tcp } = await createMockDaemonClient('test-clone')
    
    try {
      // Test clone
      await clone({
        fs,
        tcp,
        dir,
        url,
      })
      
      assert.ok(await fs.exists(dir), 'Directory should exist')
      assert.ok(await fs.exists(`${dir}/.git`), 'Git directory should exist')
      assert.ok(await fs.exists(`${dir}/.git/HEAD`), 'HEAD should exist')
    } finally {
      await daemon.stop()
    }
  })

  await t.test('clone with single branch', async () => {
    const { fs, dir } = await makeFixture('test-clone-single')
    const { daemon, url, tcp } = await createMockDaemonClient('test-clone')
    
    try {
      await clone({
        fs,
        tcp,
        dir,
        url,
        singleBranch: true,
        ref: 'master',
      })
      
      assert.ok(await fs.exists(dir), 'Directory should exist')
      // Verify only master branch was cloned
      const refs = await fs.readdir(`${dir}/.git/refs/heads`)
      assert.ok(refs !== null, 'refs should not be null')
      assert.strictEqual(refs!.length, 1, 'Should have only one branch')
      assert.ok(refs!.includes('master'), 'Should have master branch')
    } finally {
      await daemon.stop()
    }
  })

  await t.test('clone with depth', async () => {
    const { fs, dir } = await makeFixture('test-clone-depth')
    const { daemon, url, tcp } = await createMockDaemonClient('test-clone')
    
    try {
      await clone({
        fs,
        tcp,
        dir,
        url,
        depth: 1,
      })
      
      assert.ok(await fs.exists(dir), 'Directory should exist')
      assert.ok(await fs.exists(`${dir}/.git/shallow`), 'Should have shallow file')
    } finally {
      await daemon.stop()
    }
  })
})

