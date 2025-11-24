/**
 * Tests for listServerRefs operation over git:// protocol
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { listServerRefs } from '@awesome-os/universal-git-src'
import { createMockDaemonClient } from '../../helpers/mockGitDaemon.ts'

// TODO: listServerRefs currently only supports HTTP protocol, not daemon protocol
// These tests are skipped until daemon protocol support is added to listServerRefs
test.skip('listServerRefs over git:// protocol', async (t) => {
  await t.test('listServerRefs from mock daemon server', async () => {
    const { daemon, url, tcp } = await createMockDaemonClient('test-listServerRefs')
    
    try {
      const refs = await listServerRefs({
        tcp,
        url,
      })
      
      assert.ok(Array.isArray(refs), 'Should return an array')
      assert.ok(refs.length > 0, 'Should have at least one ref')
      
      // Verify ref structure
      const ref = refs[0]
      assert.ok(ref.ref, 'Ref should have ref property')
      assert.ok(ref.oid, 'Ref should have oid property')
    } finally {
      await daemon.stop()
    }
  })

  await t.test('listServerRefs with prefix', async () => {
    const { daemon, url, tcp } = await createMockDaemonClient('test-listServerRefs')
    
    try {
      const refs = await listServerRefs({
        tcp,
        url,
        prefix: 'refs/heads/',
      })
      
      assert.ok(Array.isArray(refs), 'Should return an array')
      // All refs should start with the prefix
      for (const ref of refs) {
        assert.ok(ref.ref.startsWith('refs/heads/'), `Ref ${ref.ref} should start with prefix`)
      }
    } finally {
      await daemon.stop()
    }
  })
})

