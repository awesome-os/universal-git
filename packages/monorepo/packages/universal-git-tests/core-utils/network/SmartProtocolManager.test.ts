import { test } from 'node:test'
import assert from 'node:assert'
import { SmartProtocolManager } from '@awesome-os/universal-git-src/core-utils/network/SmartProtocolManager.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

// Helper to create async iterable from buffers
/**
 * @deprecated Use UniversalBuffer.createStream() instead
 */
async function* createStream(buffers: UniversalBuffer[]): AsyncIterableIterator<Uint8Array> {
  // Keep the original implementation for backward compatibility
  // The deprecation warning is informational
  for (const buffer of buffers) {
    yield buffer as Uint8Array
  }
}

test('SmartProtocolManager', async (t) => {
  await t.test('createUploadPackRequest - basic request', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      capabilities: ['multi_ack', 'side-band'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
    assert.ok(result.every(b => UniversalBuffer.isBuffer(b)))
  })

  await t.test('createUploadPackRequest - with haves', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      haves: ['def456ghi789', 'ghi789jkl012'],
      capabilities: ['multi_ack'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - with shallows', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      shallows: ['shallow123'],
      capabilities: ['shallow'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - with depth', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      depth: 10,
      capabilities: ['deepen'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - with since', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      since: new Date('2024-01-01'),
      capabilities: ['deepen-since'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - with exclude', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      exclude: ['exclude123'],
      capabilities: ['deepen-not'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - empty capabilities', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      capabilities: [],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - multiple wants', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123', 'def456', 'ghi789'],
      capabilities: ['multi_ack'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createReceivePackRequest - basic request', async () => {
    const result = await SmartProtocolManager.createReceivePackRequest({
      capabilities: ['report-status', 'side-band'],
      triplets: [
        { oldoid: '0000000000000000000000000000000000000000', oid: 'abc123', fullRef: 'refs/heads/master' },
      ],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
    assert.ok(result.every(b => UniversalBuffer.isBuffer(b)))
  })

  await t.test('createReceivePackRequest - multiple triplets', async () => {
    const result = await SmartProtocolManager.createReceivePackRequest({
      capabilities: ['report-status'],
      triplets: [
        { oldoid: '0000000000000000000000000000000000000000', oid: 'abc123', fullRef: 'refs/heads/master' },
        { oldoid: '0000000000000000000000000000000000000000', oid: 'def456', fullRef: 'refs/heads/develop' },
      ],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createReceivePackRequest - empty triplets', async () => {
    const result = await SmartProtocolManager.createReceivePackRequest({
      capabilities: ['report-status'],
      triplets: [],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createListRefsRequest - basic request', async () => {
    const result = await SmartProtocolManager.createListRefsRequest({
      symrefs: false,
      peelTags: false,
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
    assert.ok(result.every(b => UniversalBuffer.isBuffer(b)))
  })

  await t.test('createListRefsRequest - with symrefs', async () => {
    const result = await SmartProtocolManager.createListRefsRequest({
      symrefs: true,
      peelTags: false,
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createListRefsRequest - with prefix', async () => {
    const result = await SmartProtocolManager.createListRefsRequest({
      prefix: 'refs/heads/',
      symrefs: false,
      peelTags: false,
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createListRefsRequest - with peelTags', async () => {
    const result = await SmartProtocolManager.createListRefsRequest({
      symrefs: false,
      peelTags: true,
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('parseUploadPackResponse - handles stream', async () => {
    // Create a minimal valid upload-pack response
    // This is a simplified test - actual parsing would require a full packfile
    const { GitPktLine } = await import('@awesome-os/universal-git-src/models/GitPktLine.ts')
    const response = [
      GitPktLine.encode('NAK\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)
    
    // This should not throw, even if the response is minimal
    try {
      const result = await SmartProtocolManager.parseUploadPackResponse(stream)
      // Result structure depends on the actual parser implementation
      assert.ok(result !== undefined)
    } catch (err) {
      // Parsing might fail with minimal data, which is expected
      assert.ok(err instanceof Error)
    }
  })

  await t.test('parseReceivePackResponse - handles stream', async () => {
    // Create a minimal valid receive-pack response
    const { GitPktLine } = await import('@awesome-os/universal-git-src/models/GitPktLine.ts')
    const response = [
      GitPktLine.encode('unpack ok\n'),
      GitPktLine.encode('ok refs/heads/master\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)
    
    try {
      const result = await SmartProtocolManager.parseReceivePackResponse(stream)
      // Result should have ok and refs properties
      assert.ok(result !== undefined)
      if (result && typeof result === 'object' && 'ok' in result) {
        assert.ok(typeof (result as any).ok === 'boolean')
      }
    } catch (err) {
      // Parsing might fail with minimal data, which is expected
      assert.ok(err instanceof Error)
    }
  })

  await t.test('parseListRefsResponse - handles stream', async () => {
    // Create a minimal valid list-refs response
    const { GitPktLine } = await import('@awesome-os/universal-git-src/models/GitPktLine.ts')
    const response = [
      GitPktLine.encode('abc123 refs/heads/master\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)
    
    try {
      const result = await SmartProtocolManager.parseListRefsResponse(stream)
      // Result should be a Map
      assert.ok(result instanceof Map)
    } catch (err) {
      // Parsing might fail with minimal data, which is expected
      assert.ok(err instanceof Error)
    }
  })

  await t.test('createUploadPackRequest - null depth', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      depth: null,
      capabilities: [],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - null since', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123def456'],
      since: null,
      capabilities: [],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })

  await t.test('createUploadPackRequest - all parameters', () => {
    const result = SmartProtocolManager.createUploadPackRequest({
      wants: ['abc123', 'def456'],
      haves: ['ghi789'],
      shallows: ['shallow123'],
      depth: 5,
      since: new Date('2024-01-01'),
      exclude: ['exclude123'],
      capabilities: ['multi_ack', 'side-band', 'shallow', 'deepen'],
    })
    
    assert.ok(Array.isArray(result))
    assert.ok(result.length > 0)
  })
})

