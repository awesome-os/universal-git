import { test } from 'node:test'
import assert from 'node:assert'
import { GitMultiPackIndex } from '@awesome-os/universal-git-src/models/GitMultiPackIndex.ts'
import { InternalError } from '@awesome-os/universal-git-src/errors/InternalError.ts'

test('GitMultiPackIndex', async (t) => {
  await t.test('constructor creates empty instance', () => {
    // Test - lines 33-38, 41: constructor
    const midx = new GitMultiPackIndex()
    assert.ok(midx instanceof GitMultiPackIndex)
    assert.strictEqual(midx.getVersion(), 0)
    assert.strictEqual(midx.getObjectCount(), 0)
    assert.deepStrictEqual(midx.getPackfileNames(), [])
  })

  await t.test('fromBuffer throws error for invalid magic', () => {
    // Test - lines 47-54: invalid magic
    const invalidBuffer = Buffer.from('INVALID_MAGIC')
    let error: unknown = null
    try {
      GitMultiPackIndex.fromBuffer(invalidBuffer)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('Invalid MIDX magic'))
  })

  await t.test('fromBuffer throws error for unsupported version', () => {
    // Test - lines 56-59: unsupported version
    const buffer = Buffer.alloc(12)
    buffer.write('MIDX', 0, 'ascii')
    buffer.writeUInt8(2, 4) // Version 2 (unsupported)
    buffer.writeUInt8(1, 5) // Object ID version
    buffer.writeUInt8(0, 6) // Chunk count
    buffer.writeUInt8(0, 7) // Base MIDX
    
    let error: unknown = null
    try {
      GitMultiPackIndex.fromBuffer(buffer)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('Unsupported MIDX version'))
  })

  await t.test('fromBuffer throws error for unsupported object ID version', () => {
    // Test - lines 61-64: unsupported object ID version
    const buffer = Buffer.alloc(12)
    buffer.write('MIDX', 0, 'ascii')
    buffer.writeUInt8(1, 4) // Version 1
    buffer.writeUInt8(3, 5) // Object ID version 3 (unsupported)
    buffer.writeUInt8(0, 6) // Chunk count
    buffer.writeUInt8(0, 7) // Base MIDX
    
    let error: unknown = null
    try {
      GitMultiPackIndex.fromBuffer(buffer)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('Unsupported object ID version'))
  })

  await t.test('fromBuffer throws error for base MIDX', () => {
    // Test - lines 67-70: base MIDX not supported
    const buffer = Buffer.alloc(12)
    buffer.write('MIDX', 0, 'ascii')
    buffer.writeUInt8(1, 4) // Version 1
    buffer.writeUInt8(1, 5) // Object ID version
    buffer.writeUInt8(0, 6) // Chunk count
    buffer.writeUInt8(1, 7) // Base MIDX (not 0)
    
    let error: unknown = null
    try {
      GitMultiPackIndex.fromBuffer(buffer)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('Base MIDX not yet supported'))
  })

  await t.test('fromBuffer throws error for missing required chunks', () => {
    // Test - lines 88-90: missing required chunks
    const buffer = Buffer.alloc(20)
    buffer.write('MIDX', 0, 'ascii')
    buffer.writeUInt8(1, 4) // Version 1
    buffer.writeUInt8(1, 5) // Object ID version
    buffer.writeUInt8(0, 6) // Chunk count (no chunks)
    buffer.writeUInt8(0, 7) // Base MIDX
    
    let error: unknown = null
    try {
      GitMultiPackIndex.fromBuffer(buffer)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('Missing required MIDX chunks'))
  })

  await t.test('lookup returns null when OID not found', () => {
    // Test - lines 209-250: lookup method
    const midx = new GitMultiPackIndex()
    const result = midx.lookup('0000000000000000000000000000000000000000')
    assert.strictEqual(result, null)
  })

  await t.test('getPackfileName returns null for invalid index', () => {
    // Test - lines 256-260: getPackfileName
    const midx = new GitMultiPackIndex()
    assert.strictEqual(midx.getPackfileName(-1), null)
    assert.strictEqual(midx.getPackfileName(0), null)
    assert.strictEqual(midx.getPackfileName(100), null)
  })

  await t.test('getPackfileNames returns empty array', () => {
    // Test - lines 266-267: getPackfileNames
    const midx = new GitMultiPackIndex()
    const names = midx.getPackfileNames()
    assert.ok(Array.isArray(names))
    assert.strictEqual(names.length, 0)
  })

  await t.test('getObjectCount returns zero', () => {
    // Test - lines 273-274: getObjectCount
    const midx = new GitMultiPackIndex()
    assert.strictEqual(midx.getObjectCount(), 0)
  })

  await t.test('getVersion returns zero', () => {
    // Test - lines 280-281: getVersion
    const midx = new GitMultiPackIndex()
    assert.strictEqual(midx.getVersion(), 0)
  })
})






