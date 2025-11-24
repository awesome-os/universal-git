import { test } from 'node:test'
import assert from 'node:assert'
import { applyDelta } from '@awesome-os/universal-git-src/utils/applyDelta.ts'
import { InternalError } from '@awesome-os/universal-git-src/errors/InternalError.ts'

// Helper to encode variable-length integer (little-endian)
function encodeVarInt(value: number): number[] {
  const bytes: number[] = []
  do {
    let byte = value & 0b01111111
    value >>>= 7
    if (value !== 0) byte |= 0b10000000
    bytes.push(byte)
  } while (value !== 0)
  return bytes
}

// Helper to encode compact LE (for copy operations)
// Returns just the bytes, without flags
function encodeCompactLE(value: number, numBytes: number): number[] {
  const bytes: number[] = []
  for (let i = 0; i < numBytes; i++) {
    bytes.push(value & 0xFF)
    value >>>= 8
  }
  return bytes
}

// Helper to create a copy operation
// readCompactLE reads bytes based on flags in the op byte
// Bits 0-3: which offset bytes to read (bit 0 = byte 0, bit 1 = byte 1, etc.)
// Bits 4-6: which size bytes to read (bit 4 = byte 0, bit 5 = byte 1, etc.)
function createCopyOp(offset: number, size: number): number[] {
  const COPY = 0b10000000
  
  // Determine how many bytes we need for offset and size
  let offsetBytes = 0
  let sizeBytes = 0
  let temp = offset
  while (temp > 0 && offsetBytes < 4) {
    offsetBytes++
    temp >>>= 8
  }
  temp = size
  while (temp > 0 && sizeBytes < 3) {
    sizeBytes++
    temp >>>= 8
  }
  // At least 1 byte each
  if (offsetBytes === 0) offsetBytes = 1
  if (sizeBytes === 0) sizeBytes = 1
  
  // Create flags: set bits for bytes we want to read
  // Offset flags: bits 0-3, set bits 0 to offsetBytes-1
  let offsetFlags = 0
  for (let i = 0; i < offsetBytes; i++) {
    offsetFlags |= (1 << i)
  }
  
  // Size flags: bits 4-6, set bits 4 to 4+sizeBytes-1
  let sizeFlags = 0
  for (let i = 0; i < sizeBytes; i++) {
    sizeFlags |= (1 << (4 + i))
  }
  
  // Op byte: 0x80 (COPY) | offset flags | size flags
  const opByte = COPY | offsetFlags | sizeFlags
  
  return [
    opByte,
    ...encodeCompactLE(offset, offsetBytes),
    ...encodeCompactLE(size, sizeBytes),
  ]
}

test('applyDelta', async (t) => {
  await t.test('ok:simple-copy-operation', () => {
    const base = Buffer.from('Hello, World!')
    const copyOp = createCopyOp(0, 13)
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(13), // target size
      ...copyOp,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello, World!')
    assert.strictEqual(result.length, 13)
  })

  await t.test('ok:simple-insert-operation', () => {
    const base = Buffer.from('')
    // Delta: source size (0), target size (5), insert op (5 bytes)
    const delta = Buffer.from([
      0x00, // source size: 0
      0x05, // target size: 5
      0x05, // insert op: 5 bytes
      ...Buffer.from('Hello'), // inserted data
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello')
    assert.strictEqual(result.length, 5)
  })

  await t.test('ok:copy-with-offset', () => {
    const base = Buffer.from('Hello, World!')
    // Copy from offset 7, size 6: base[7:13] = ", Worl"
    const copyOp = createCopyOp(7, 6)
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(6), // target size
      ...copyOp,
    ])
    
    const result = applyDelta(delta, base)
    const expected = base.slice(7, 7 + 6).toString('utf8')
    assert.strictEqual(result.toString('utf8'), expected)
    assert.strictEqual(result.length, 6)
  })

  await t.test('ok:insert-after-copy', () => {
    const base = Buffer.from('Hello')
    const copyOp = createCopyOp(0, 5)
    const insertData = Buffer.from(' World!')
    const delta = Buffer.from([
      ...encodeVarInt(5), // source size
      ...encodeVarInt(12), // target size
      ...copyOp,
      insertData.length, // insert op: length byte
      ...insertData, // inserted data
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello World!')
    assert.strictEqual(result.length, 12)
  })

  await t.test('ok:multiple-copy-operations', () => {
    const base = Buffer.from('Hello, World!')
    const copyOp1 = createCopyOp(0, 5)
    const copyOp2 = createCopyOp(5, 8)
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(13), // target size
      ...copyOp1,
      ...copyOp2,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello, World!')
    assert.strictEqual(result.length, 13)
  })

  await t.test('behavior:single-copy-optimization', () => {
    const base = Buffer.from('Hello')
    const copyOp = createCopyOp(0, 5)
    const delta = Buffer.from([
      ...encodeVarInt(5), // source size
      ...encodeVarInt(5), // target size
      ...copyOp,
    ])
    
    const result = applyDelta(delta, base)
    // Should use optimization path (return raw buffer)
    assert.strictEqual(result.toString('utf8'), 'Hello')
    assert.strictEqual(result.length, 5)
  })

  await t.test('error:source-size-mismatch', () => {
    const base = Buffer.from('Hello')
    const delta = Buffer.from([
      ...encodeVarInt(10), // source size (wrong)
      ...encodeVarInt(5), // target size
      0x05, // insert op
      ...Buffer.from('Hello'),
    ])
    
    assert.throws(
      () => applyDelta(delta, base),
      (error: any) => {
        return error instanceof InternalError && 
               error.message.includes('expected source buffer to be')
      }
    )
  })

  await t.test('error:target-size-mismatch', () => {
    const base = Buffer.from('Hello')
    // Create invalid delta that produces wrong target size
    const copyOp = createCopyOp(0, 3) // Only copy 3 bytes
    const delta = Buffer.from([
      ...encodeVarInt(5), // source size
      ...encodeVarInt(5), // target size (expects 5, but will get 3)
      ...copyOp,
    ])
    
    // This should throw because target size doesn't match
    assert.throws(
      () => applyDelta(delta, base),
      (error: any) => {
        return error instanceof InternalError && 
               error.message.includes('expected target buffer to be')
      }
    )
  })

  await t.test('ok:handles-large-varint-encoding', () => {
    const base = Buffer.alloc(1000)
    base.fill('A')
    const copyOp = createCopyOp(0, 1000)
    const delta = Buffer.from([
      ...encodeVarInt(1000), // source size (multi-byte varint)
      ...encodeVarInt(1000), // target size (multi-byte varint)
      ...copyOp,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.length, 1000)
  })

  await t.test('behavior:copy-size-0-optimization', () => {
    const base = Buffer.alloc(0x10000)
    base.fill('A')
    // Size 0 means 0x10000
    const copyOp = createCopyOp(0, 0)
    const delta = Buffer.from([
      ...encodeVarInt(0x10000), // source size
      ...encodeVarInt(0x10000), // target size
      ...copyOp,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.length, 0x10000)
  })

  await t.test('ok:multiple-insert-operations', () => {
    const base = Buffer.from('')
    const delta = Buffer.from([
      0x00, // source size: 0
      0x0A, // target size: 10
      0x05, // insert op: 5 bytes
      ...Buffer.from('Hello'),
      0x05, // insert op: 5 bytes
      ...Buffer.from('World'),
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'HelloWorld')
    assert.strictEqual(result.length, 10)
  })

  await t.test('ok:complex-sequence-copy-insert-copy', () => {
    const base = Buffer.from('Hello, World!')
    const copyOp1 = createCopyOp(0, 5) // "Hello"
    const insertData = Buffer.from(' ')
    const copyOp2 = createCopyOp(7, 6) // "World!"
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(12), // target size
      ...copyOp1,
      insertData.length, // insert op
      ...insertData,
      ...copyOp2,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello World!')
    assert.strictEqual(result.length, 12)
  })
})

