import { test } from 'node:test'
import assert from 'node:assert'
import { applyDelta } from '@awesome-os/universal-git-src/utils/applyDelta.ts'

// Helper to encode varint (little-endian)
function encodeVarInt(n: number): number[] {
  const bytes: number[] = []
  do {
    let byte = n & 0x7F
    n >>>= 7
    if (n > 0) byte |= 0x80
    bytes.push(byte)
  } while (n > 0)
  return bytes
}

// Helper to encode compact LE (for offset/size in copy operations)
function encodeCompactLE(value: number, numBytes: number): number[] {
  const bytes: number[] = []
  for (let i = 0; i < numBytes; i++) {
    bytes.push(value & 0xFF)
    value >>>= 8
  }
  return bytes
}

// Helper to create a copy operation delta
// readCompactLE reads bytes based on flags in the op byte
// Bits 0-3: which offset bytes to read (bit 0 = byte 0, bit 1 = byte 1, etc.)
// Bits 4-6: which size bytes to read (bit 4 = byte 0, bit 5 = byte 1, etc.)
function createCopyOp(offset: number, size: number): { opByte: number; offsetBytes: number[]; sizeBytes: number[] } {
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
  const opByte = 0x80 | offsetFlags | sizeFlags
  
  return {
    opByte,
    offsetBytes: encodeCompactLE(offset, offsetBytes),
    sizeBytes: encodeCompactLE(size, sizeBytes),
  }
}

test('DeltaResolver', async (t) => {
  await t.test('applyDelta - simple copy operation', () => {
    const base = Buffer.from('Hello, World!')
    const copyOp = createCopyOp(0, 13)
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(13), // target size
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello, World!')
    assert.strictEqual(result.length, 13)
  })

  await t.test('applyDelta - simple insert operation', () => {
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

  await t.test('applyDelta - copy with offset', () => {
    const base = Buffer.from('Hello, World!')
    // Copy from offset 7, size 6: base[7:13] = ", Worl" (6 bytes)
    const copyOp = createCopyOp(7, 6)
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(6), // target size
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
    ])
    
    const result = applyDelta(delta, base)
    const expected = base.slice(7, 7 + 6).toString('utf8')
    assert.strictEqual(result.toString('utf8'), expected)
    assert.strictEqual(result.length, 6)
  })

  await t.test('applyDelta - insert after copy', () => {
    const base = Buffer.from('Hello')
    const copyOp = createCopyOp(0, 5)
    const insertData = Buffer.from(' World!')
    const delta = Buffer.from([
      ...encodeVarInt(5), // source size
      ...encodeVarInt(12), // target size
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
      insertData.length, // insert op: length byte
      ...insertData, // inserted data
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello World!')
    assert.strictEqual(result.length, 12)
  })

  await t.test('applyDelta - multiple copy operations', () => {
    const base = Buffer.from('Hello, World!')
    const copyOp1 = createCopyOp(0, 5)
    const copyOp2 = createCopyOp(5, 8)
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(13), // target size
      copyOp1.opByte,
      ...copyOp1.offsetBytes,
      ...copyOp1.sizeBytes,
      copyOp2.opByte,
      ...copyOp2.offsetBytes,
      ...copyOp2.sizeBytes,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello, World!')
    assert.strictEqual(result.length, 13)
  })

  await t.test('applyDelta - handles Uint8Array input', () => {
    const base = Buffer.from([72, 101, 108, 108, 111]) // "Hello" (convert Uint8Array to Buffer)
    const copyOp = createCopyOp(0, 5)
    const delta = Buffer.from([
      ...encodeVarInt(5), // source size
      ...encodeVarInt(5), // target size
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello')
    assert.strictEqual(result.length, 5)
  })

  await t.test('applyDelta - throws error on size mismatch (source)', () => {
    const base = Buffer.from('Hello')
    const copyOp = createCopyOp(0, 5)
    const delta = Buffer.from([
      ...encodeVarInt(10), // source size: 10 (but base is 5)
      ...encodeVarInt(5), // target size: 5
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
    ])
    
    assert.throws(() => {
      applyDelta(delta, base)
    }, /expected source buffer to be 10 bytes but the provided buffer was 5 bytes/)
  })

  await t.test('applyDelta - handles large copy size (0x10000 optimization)', () => {
    const base = Buffer.alloc(0x10000, 'A')
    // Size 0 in copy op means 0x10000
    const copyOp = createCopyOp(0, 0) // size 0 means 0x10000
    const delta = Buffer.from([
      ...encodeVarInt(0x10000), // source size
      ...encodeVarInt(0x10000), // target size
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes, // size 0 will trigger 0x10000 optimization
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.length, 0x10000)
    assert.strictEqual(result[0], 0x41) // 'A'
    assert.strictEqual(result[0xFFFF], 0x41) // 'A'
  })

  await t.test('applyDelta - complex operation: copy + insert + copy', () => {
    const base = Buffer.from('Hello, World!')
    const copyOp1 = createCopyOp(0, 5) // "Hello"
    const insertData = Buffer.from(' Beautiful')
    const copyOp2 = createCopyOp(5, 8) // ", World!"
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(23), // target size: 5 + 10 + 8 = 23
      copyOp1.opByte,
      ...copyOp1.offsetBytes,
      ...copyOp1.sizeBytes,
      insertData.length, // insert op
      ...insertData,
      copyOp2.opByte,
      ...copyOp2.offsetBytes,
      ...copyOp2.sizeBytes,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello Beautiful, World!')
    assert.strictEqual(result.length, 23)
  })

  await t.test('applyDelta - handles empty base with insert', () => {
    const base = Buffer.from('')
    const delta = Buffer.from([
      0x00, // source size: 0
      0x0B, // target size: 11
      0x0B, // insert op: 11 bytes
      ...Buffer.from('Hello World'), // inserted data
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello World')
    assert.strictEqual(result.length, 11)
  })

  await t.test('applyDelta - handles varint encoding for large sizes', () => {
    const base = Buffer.alloc(128, 'A')
    const copyOp = createCopyOp(0, 5)
    const delta = Buffer.from([
      ...encodeVarInt(128), // source size: 128 (varint)
      ...encodeVarInt(5), // target size: 5
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.length, 5)
    assert.strictEqual(result.toString('utf8'), 'AAAAA')
  })

  await t.test('applyDelta - single operation optimization path', () => {
    const base = Buffer.from('Hello, World!')
    const copyOp = createCopyOp(0, 13)
    const delta = Buffer.from([
      ...encodeVarInt(13), // source size
      ...encodeVarInt(13), // target size
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
    ])
    
    const result = applyDelta(delta, base)
    assert.strictEqual(result.toString('utf8'), 'Hello, World!')
    // This should use the optimization path (firstOp.byteLength === targetSize)
  })

  await t.test('applyDelta - throws error on target size mismatch', () => {
    const base = Buffer.from('Hello')
    // Create a delta that writes less than the target size
    const copyOp = createCopyOp(0, 3) // Only copy 3 bytes
    const badDelta = Buffer.from([
      ...encodeVarInt(5), // source size
      ...encodeVarInt(10), // target size: 10 (but we only write 3)
      copyOp.opByte,
      ...copyOp.offsetBytes,
      ...copyOp.sizeBytes,
      // Missing operations - only 3 bytes written, but target is 10
    ])
    
    assert.throws(() => {
      applyDelta(badDelta, base)
    }, /expected target buffer to be 10 bytes but the resulting buffer was 3 bytes/)
  })
})


