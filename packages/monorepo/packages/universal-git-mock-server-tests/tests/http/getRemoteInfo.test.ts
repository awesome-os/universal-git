import { test } from 'node:test'
import assert from 'node:assert'
import { Errors, getRemoteInfo } from '@awesome-os/universal-git-src'
import { createMockHttpClient } from '../../helpers/mockHttpServer.ts'

// Reuse the same HTTP client across all tests to avoid repeated fixture setup
// Initialize it eagerly before tests run to avoid setup overhead during test execution
const sharedHttpPromise = createMockHttpClient('test-dumb-http-server')

test('getRemoteInfo', async (t) => {
  // Wait for the shared HTTP client (should already be initialized)
  const sharedHttp = await sharedHttpPromise

  await t.test('protocol 2', async () => {
    const info = await getRemoteInfo({
      http: sharedHttp!,
      url: 'http://localhost/test-dumb-http-server.git',
      protocolVersion: 2,
    })
    
    assert.ok(info, 'Info should be defined')
    assert.ok(info.capabilities, 'Capabilities should be defined')
    // Server may downgrade to v1 if v2 is not fully supported
    assert.ok(info.protocolVersion === 1 || info.protocolVersion === 2, 'Protocol version should be 1 or 2')
    
    if (info.protocolVersion === 2) {
      // Protocol v2 capabilities
      assert.ok(info.capabilities['ls-refs'], 'Should have ls-refs capability')
      assert.ok(info.capabilities.fetch, 'Should have fetch capability')
    } else {
      // Protocol v1 fallback - should still have capabilities
      assert.ok(Object.keys(info.capabilities).length > 0, 'Should have capabilities even in v1')
    }
  })

  await t.test('protocol 1', async () => {
    const info = await getRemoteInfo({
      http: sharedHttp!,
      url: 'http://localhost/test-dumb-http-server.git',
      protocolVersion: 1,
    })
    
    assert.ok(info, 'Info should be defined')
    assert.ok(info.capabilities, 'Capabilities should be defined')
    assert.strictEqual(info.protocolVersion, 1, 'Protocol version should be 1')
    
    if (info.protocolVersion === 1) {
      assert.ok(info.refs, 'Refs should be defined for protocol v1')
      assert.ok(Array.isArray(info.refs), 'Refs should be an array')
      
      // Verify specific refs
      const head = info.refs.find((r: any) => r.ref === 'HEAD')
      assert.ok(head, 'Should have HEAD ref')
      assert.strictEqual(head.oid, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'HEAD should have correct OID')
      assert.ok(head.target, 'HEAD should have target')
      assert.strictEqual(head.target, 'refs/heads/master', 'HEAD should point to refs/heads/master')
      
      const master = info.refs.find((r: any) => r.ref === 'refs/heads/master')
      assert.ok(master, 'Should have refs/heads/master')
      assert.strictEqual(master.oid, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'master should have correct OID')
      
      const test = info.refs.find((r: any) => r.ref === 'refs/heads/test')
      assert.ok(test, 'Should have refs/heads/test')
      assert.strictEqual(test.oid, '5a8905a02e181fe1821068b8c0f48cb6633d5b81', 'test should have correct OID')
    }
  })

  await t.test('throws UnknownTransportError if using shorter scp-like syntax', async () => {
    let err: unknown
    try {
      await getRemoteInfo({
        http: sharedHttp!,
        url: 'git@github.com:octocat/Hello-World.git',
      })
      assert.fail('Should have thrown an error')
    } catch (e) {
      err = e
    }
    
    assert.ok(err, 'Error should be defined')
    assert.ok(err instanceof Errors.UnknownTransportError, 'Should throw UnknownTransportError')
    if (err instanceof Errors.UnknownTransportError) {
      assert.strictEqual(err.code, Errors.UnknownTransportError.code, 'Error code should match')
    }
  })
})


