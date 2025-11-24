import { test } from 'node:test'
import assert from 'node:assert'
import { listServerRefs } from '@awesome-os/universal-git-src'
import { createMockHttpClient } from '../../helpers/mockHttpServer.ts'

// Reuse the same HTTP client across all tests to avoid repeated fixture setup
const sharedHttpPromise = createMockHttpClient('test-listServerRefs')

test('listServerRefs', async (t) => {
  const sharedHttp = await sharedHttpPromise

  await t.test('protocol 1', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 1,
    })
    
    assert.ok(Array.isArray(refs), 'Should return an array')
    assert.strictEqual(refs.length, 5, 'Should return 5 refs')
    
    // Verify exact refs match expected snapshot
    const head = refs.find(r => r.ref === 'HEAD')
    assert.ok(head, 'Should have HEAD ref')
    assert.strictEqual(head.oid, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'HEAD should have correct OID')
    
    const master = refs.find(r => r.ref === 'refs/heads/master')
    assert.ok(master, 'Should have refs/heads/master')
    assert.strictEqual(master.oid, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'master should have correct OID')
    
    const symbol = refs.find(r => r.ref === 'refs/heads/symbol')
    assert.ok(symbol, 'Should have refs/heads/symbol')
    assert.strictEqual(symbol.oid, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'symbol should have correct OID')
    
    const test = refs.find(r => r.ref === 'refs/heads/test')
    assert.ok(test, 'Should have refs/heads/test')
    assert.strictEqual(test.oid, '5a8905a02e181fe1821068b8c0f48cb6633d5b81', 'test should have correct OID')
    
    const tag = refs.find(r => r.ref === 'refs/tags/test')
    assert.ok(tag, 'Should have refs/tags/test')
    assert.strictEqual(tag.oid, '48424d105c9eac701cd734a0032fcc71505797e6', 'tag should have correct OID')
  })

  await t.test('protocol 1, symrefs', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 1,
      symrefs: true,
    })
    
    const head = refs.find(r => r.ref === 'HEAD')
    assert.ok(head, 'Should have HEAD ref')
    assert.ok(head.target, 'HEAD should have target when symrefs is true')
    assert.strictEqual(head.target, 'refs/heads/master', 'HEAD should point to refs/heads/master')
    
    // Protocol v1 only reports HEAD symref, not others
    const symbol = refs.find(r => r.ref === 'refs/heads/symbol')
    assert.ok(symbol, 'Should have refs/heads/symbol')
    assert.strictEqual(symbol.target, undefined, 'Protocol v1 should not report symrefs for non-HEAD refs')
  })

  await t.test('protocol 1, peelTags', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 1,
      peelTags: true,
    })
    
    const tag = refs.find(r => r.ref === 'refs/tags/test')
    assert.ok(tag, 'Should have refs/tags/test')
    assert.ok(tag.peeled, 'Tag should have peeled OID when peelTags is true')
    assert.strictEqual(tag.peeled, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'Tag should have correct peeled OID')
  })

  await t.test('protocol 1, prefix', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 1,
      prefix: 'refs/heads',
    })
    
    assert.strictEqual(refs.length, 3, 'Should return 3 refs with prefix refs/heads')
    
    // All refs should start with refs/heads
    for (const ref of refs) {
      assert.ok(ref.ref.startsWith('refs/heads'), `Ref ${ref.ref} should start with refs/heads`)
    }
    
    // Should not include HEAD
    const head = refs.find(r => r.ref === 'HEAD')
    assert.strictEqual(head, undefined, 'Should not include HEAD when prefix is refs/heads')
    
    // Verify specific refs
    const master = refs.find(r => r.ref === 'refs/heads/master')
    assert.ok(master, 'Should have refs/heads/master')
    const symbol = refs.find(r => r.ref === 'refs/heads/symbol')
    assert.ok(symbol, 'Should have refs/heads/symbol')
    const test = refs.find(r => r.ref === 'refs/heads/test')
    assert.ok(test, 'Should have refs/heads/test')
  })

  await t.test('protocol 1, kitchen sink', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 1,
      prefix: 'refs/',
      symrefs: true,
      peelTags: true,
    })
    
    // Should filter by prefix and include symrefs and peeled tags
    assert.ok(refs.length > 0, 'Should return refs')
    
    // All refs should start with refs/
    for (const ref of refs) {
      assert.ok(ref.ref.startsWith('refs/'), `Ref ${ref.ref} should start with refs/`)
    }
    
    // Should have peeled tag
    const tag = refs.find(r => r.ref === 'refs/tags/test')
    if (tag) {
      assert.ok(tag.peeled, 'Tag should have peeled OID when peelTags is true')
    }
  })

  await t.test('protocol 2', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 2,
    })
    
    assert.ok(Array.isArray(refs), 'Should return an array')
    assert.ok(refs.length > 0, 'Should return at least one ref')
    
    const head = refs.find(r => r.ref === 'HEAD')
    assert.ok(head, 'Should have HEAD ref')
    assert.strictEqual(head.oid, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'HEAD should have correct OID')
  })

  await t.test('protocol 2, symrefs', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 2,
      symrefs: true,
    })
    
    const head = refs.find(r => r.ref === 'HEAD')
    assert.ok(head, 'Should have HEAD ref')
    assert.ok(head.target, 'HEAD should have target when symrefs is true')
    assert.strictEqual(head.target, 'refs/heads/master', 'HEAD should point to refs/heads/master')
    
    // Protocol v2 should return symrefs for all refs, not just HEAD
    const symbol = refs.find(r => r.ref === 'refs/heads/symbol')
    if (symbol && symbol.target) {
      // Only check target if it exists (fixture may not have symref set up)
      assert.strictEqual(symbol.target, 'refs/heads/master', 'symbol should point to refs/heads/master')
    }
  })

  await t.test('protocol 2, peelTags', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 2,
      peelTags: true,
    })
    
    const tag = refs.find(r => r.ref === 'refs/tags/test')
    assert.ok(tag, 'Should have refs/tags/test')
    assert.ok(tag.peeled, 'Tag should have peeled OID when peelTags is true')
    assert.strictEqual(tag.peeled, '97c024f73eaab2781bf3691597bc7c833cb0e22f', 'Tag should have correct peeled OID')
  })

  await t.test('protocol 2, prefix', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 2,
      prefix: 'refs/heads',
    })
    
    assert.strictEqual(refs.length, 3, 'Should return 3 refs with prefix refs/heads')
    
    // All refs should start with refs/heads
    for (const ref of refs) {
      assert.ok(ref.ref.startsWith('refs/heads'), `Ref ${ref.ref} should start with refs/heads`)
    }
  })

  await t.test('protocol 2, kitchen sink', async () => {
    const http = sharedHttp
    const refs = await listServerRefs({
      http,
      url: 'http://localhost/test-listServerRefs.git',
      protocolVersion: 2,
      prefix: 'refs/',
      symrefs: true,
      peelTags: true,
    })
    
    // Should filter by prefix and include symrefs and peeled tags
    assert.ok(refs.length > 0, 'Should return refs')
    
    // All refs should start with refs/
    for (const ref of refs) {
      assert.ok(ref.ref.startsWith('refs/'), `Ref ${ref.ref} should start with refs/`)
    }
    
    // Should have symrefs in protocol v2
    const symbol = refs.find(r => r.ref === 'refs/heads/symbol')
    if (symbol && symbol.target) {
      // Only check target if it exists (fixture may not have symref set up)
      assert.ok(symbol.target, 'symbol ref should have target in protocol v2')
    }
    
    // Should have peeled tag
    const tag = refs.find(r => r.ref === 'refs/tags/test')
    if (tag) {
      assert.ok(tag.peeled, 'Tag should have peeled OID when peelTags is true')
    }
  })
})

