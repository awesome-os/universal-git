/**
 * Tests for getRemoteInfo operation over git:// protocol
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { getRemoteInfo } from '@awesome-os/universal-git-src'
import { createMockDaemonClient } from '../../helpers/mockGitDaemon.ts'

// TODO: getRemoteInfo currently only supports HTTP protocol, not daemon protocol
// These tests are skipped until daemon protocol support is added to getRemoteInfo
test.skip('getRemoteInfo over git:// protocol', async (t) => {
  await t.test('getRemoteInfo from mock daemon server', async () => {
    const { daemon, url, tcp } = await createMockDaemonClient('test-listServerRefs')
    
    try {
      const info = await getRemoteInfo({
        tcp,
        url,
        protocolVersion: 1,
      })
      
      assert.ok(info, 'Info should not be null')
      assert.ok(info.capabilities, 'Capabilities should not be null')
      assert.ok(Array.isArray(info.refs), 'Refs should be an array')
      assert.ok(info.refs.length > 0, 'Should have at least one ref')
    } finally {
      await daemon.stop()
    }
  })

  await t.test('getRemoteInfo with protocol version 2', async () => {
    const { daemon, url, tcp } = await createMockDaemonClient('test-listServerRefs')
    
    try {
      const info = await getRemoteInfo({
        tcp,
        url,
        protocolVersion: 2,
      })
      
      assert.ok(info, 'Info should not be null')
      assert.ok(info.capabilities, 'Capabilities should not be null')
      assert.ok(Array.isArray(info.refs), 'Refs should be an array')
    } finally {
      await daemon.stop()
    }
  })
})


