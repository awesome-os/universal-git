import { test } from 'node:test'
import assert from 'node:assert'
import { GitRemoteHTTPDumb } from '@awesome-os/universal-git-src/git/remote/GitRemoteHTTPDumb.ts'

test('GitRemoteHTTPDumb', async (t) => {
  await t.test('capabilities returns discover and connect', async () => {
    const caps = await GitRemoteHTTPDumb.capabilities()
    assert.ok(Array.isArray(caps))
    assert.ok(caps.includes('discover'))
    assert.ok(caps.includes('connect'))
  })

  await t.test('corsProxify formats URL correctly', () => {
    const proxy = 'https://cors-proxy.example.com'
    const url = 'http://example.com/repo.git'
    
    // Access private method for testing
    const proxified = (GitRemoteHTTPDumb as any).corsProxify(proxy, url)
    
    assert.ok(proxified.includes(proxy))
    // corsProxify strips the protocol, so check for the domain and path
    assert.ok(proxified.includes('example.com/repo.git'))
  })

  await t.test('corsProxify handles URLs with query parameters', () => {
    const proxy = 'https://cors-proxy.example.com'
    const url = 'http://example.com/repo.git?param=value'
    
    // Access private method for testing
    const proxified = (GitRemoteHTTPDumb as any).corsProxify(proxy, url)
    
    assert.ok(proxified.includes(proxy))
    // corsProxify strips the protocol, so check for the domain and path
    assert.ok(proxified.includes('example.com/repo.git'))
    assert.ok(proxified.includes('param=value'))
  })

  await t.test('corsProxify handles URLs with fragments', () => {
    const proxy = 'https://cors-proxy.example.com'
    const url = 'http://example.com/repo.git#fragment'
    
    // Access private method for testing
    const proxified = (GitRemoteHTTPDumb as any).corsProxify(proxy, url)
    
    assert.ok(proxified.includes(proxy))
    // corsProxify strips the protocol, so check for the domain and path
    assert.ok(proxified.includes('example.com/repo.git'))
  })
})

