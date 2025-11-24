import { test } from 'node:test'
import assert from 'node:assert'
import { BufferCursor } from '@awesome-os/universal-git-src/utils/BufferCursor.ts'

test('BufferCursor', async (t) => {
  await t.test('ok:constructor-initializes', () => {
    const buffer = Buffer.from('hello world')
    const cursor = new BufferCursor(buffer)
    
    assert.strictEqual(cursor.tell(), 0)
    assert.strictEqual(cursor.eof(), false)
  })

  await t.test('ok:tell-returns-position', () => {
    const buffer = Buffer.from('hello')
    const cursor = new BufferCursor(buffer)
    
    assert.strictEqual(cursor.tell(), 0)
    cursor.seek(3)
    assert.strictEqual(cursor.tell(), 3)
  })

  await t.test('ok:seek-sets-position', () => {
    const buffer = Buffer.from('hello world')
    const cursor = new BufferCursor(buffer)
    
    cursor.seek(6)
    assert.strictEqual(cursor.tell(), 6)
    assert.strictEqual(cursor.eof(), false)
  })

  await t.test('ok:eof-returns-true-at-end', () => {
    const buffer = Buffer.from('hello')
    const cursor = new BufferCursor(buffer)
    
    assert.strictEqual(cursor.eof(), false)
    cursor.seek(buffer.length)
    assert.strictEqual(cursor.eof(), true)
    cursor.seek(buffer.length + 10)
    assert.strictEqual(cursor.eof(), true)
  })

  await t.test('ok:slice-reads-advances-position', () => {
    const buffer = Buffer.from('hello world')
    const cursor = new BufferCursor(buffer)
    
    const slice1 = cursor.slice(5)
    assert.deepStrictEqual(slice1, Buffer.from('hello'))
    assert.strictEqual(cursor.tell(), 5)
    
    const slice2 = cursor.slice(6)
    assert.deepStrictEqual(slice2, Buffer.from(' world'))
    assert.strictEqual(cursor.tell(), 11)
  })

  await t.test('ok:toString-reads-advances-position', () => {
    const buffer = Buffer.from('hello world')
    const cursor = new BufferCursor(buffer)
    
    const str1 = cursor.toString('utf8', 5)
    assert.strictEqual(str1, 'hello')
    assert.strictEqual(cursor.tell(), 5)
    
    const str2 = cursor.toString('utf8', 6)
    assert.strictEqual(str2, ' world')
    assert.strictEqual(cursor.tell(), 11)
  })

  await t.test('ok:write-writes-advances-position', () => {
    const buffer = Buffer.alloc(20)
    const cursor = new BufferCursor(buffer)
    
    const written = cursor.write('hello', 5, 'utf8')
    assert.strictEqual(written, 5)
    assert.strictEqual(cursor.tell(), 5)
    assert.strictEqual(buffer.toString('utf8', 0, 5), 'hello')
  })

  await t.test('ok:copy-copies-advances-position', () => {
    const dest = Buffer.alloc(10)
    const source = Buffer.from('hello')
    const cursor = new BufferCursor(dest)
    
    const copied = cursor.copy(source)
    assert.strictEqual(copied, 5)
    assert.strictEqual(cursor.tell(), 5)
    assert.deepStrictEqual(dest.slice(0, 5), source)
  })

  await t.test('ok:copy-start-end-parameters', () => {
    const dest = Buffer.alloc(10)
    const source = Buffer.from('hello world')
    const cursor = new BufferCursor(dest)
    
    const copied = cursor.copy(source, 0, 5)
    assert.strictEqual(copied, 5)
    assert.strictEqual(cursor.tell(), 5)
    assert.deepStrictEqual(dest.slice(0, 5), Buffer.from('hello'))
  })

  await t.test('ok:readUInt8-reads-advances', () => {
    const buffer = Buffer.from([0x01, 0x02, 0xFF])
    const cursor = new BufferCursor(buffer)
    
    assert.strictEqual(cursor.readUInt8(), 0x01)
    assert.strictEqual(cursor.tell(), 1)
    assert.strictEqual(cursor.readUInt8(), 0x02)
    assert.strictEqual(cursor.tell(), 2)
    assert.strictEqual(cursor.readUInt8(), 0xFF)
    assert.strictEqual(cursor.tell(), 3)
  })

  await t.test('ok:writeUInt8-writes-advances', () => {
    const buffer = Buffer.alloc(3)
    const cursor = new BufferCursor(buffer)
    
    cursor.writeUInt8(0x01)
    assert.strictEqual(cursor.tell(), 1)
    assert.strictEqual(buffer[0], 0x01)
    
    cursor.writeUInt8(0xFF)
    assert.strictEqual(cursor.tell(), 2)
    assert.strictEqual(buffer[1], 0xFF)
  })

  await t.test('ok:readUInt16BE-reads-advances', () => {
    const buffer = Buffer.from([0x12, 0x34, 0x56, 0x78])
    const cursor = new BufferCursor(buffer)
    
    assert.strictEqual(cursor.readUInt16BE(), 0x1234)
    assert.strictEqual(cursor.tell(), 2)
    assert.strictEqual(cursor.readUInt16BE(), 0x5678)
    assert.strictEqual(cursor.tell(), 4)
  })

  await t.test('ok:writeUInt16BE-writes-advances', () => {
    const buffer = Buffer.alloc(4)
    const cursor = new BufferCursor(buffer)
    
    cursor.writeUInt16BE(0x1234)
    assert.strictEqual(cursor.tell(), 2)
    assert.strictEqual(buffer[0], 0x12)
    assert.strictEqual(buffer[1], 0x34)
    
    cursor.writeUInt16BE(0x5678)
    assert.strictEqual(cursor.tell(), 4)
    assert.strictEqual(buffer[2], 0x56)
    assert.strictEqual(buffer[3], 0x78)
  })

  await t.test('ok:readUInt32BE-reads-advances', () => {
    const buffer = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0])
    const cursor = new BufferCursor(buffer)
    
    assert.strictEqual(cursor.readUInt32BE(), 0x12345678)
    assert.strictEqual(cursor.tell(), 4)
    assert.strictEqual(cursor.readUInt32BE(), 0x9ABCDEF0)
    assert.strictEqual(cursor.tell(), 8)
  })

  await t.test('ok:writeUInt32BE-writes-advances', () => {
    const buffer = Buffer.alloc(8)
    const cursor = new BufferCursor(buffer)
    
    cursor.writeUInt32BE(0x12345678)
    assert.strictEqual(cursor.tell(), 4)
    assert.strictEqual(buffer[0], 0x12)
    assert.strictEqual(buffer[1], 0x34)
    assert.strictEqual(buffer[2], 0x56)
    assert.strictEqual(buffer[3], 0x78)
    
    cursor.writeUInt32BE(0x9ABCDEF0)
    assert.strictEqual(cursor.tell(), 8)
    assert.strictEqual(buffer[4], 0x9A)
    assert.strictEqual(buffer[5], 0xBC)
    assert.strictEqual(buffer[6], 0xDE)
    assert.strictEqual(buffer[7], 0xF0)
  })

  await t.test('ok:multiple-operations-sequence', () => {
    const buffer = Buffer.alloc(20)
    const cursor = new BufferCursor(buffer)
    
    cursor.writeUInt8(0x01)
    cursor.writeUInt16BE(0x0203)
    cursor.writeUInt32BE(0x04050607)
    cursor.write('hello', 5, 'utf8')
    
    assert.strictEqual(cursor.tell(), 12)
    
    cursor.seek(0)
    assert.strictEqual(cursor.readUInt8(), 0x01)
    assert.strictEqual(cursor.readUInt16BE(), 0x0203)
    assert.strictEqual(cursor.readUInt32BE(), 0x04050607)
    assert.strictEqual(cursor.toString('utf8', 5), 'hello')
  })

  await t.test('edge:slice-at-end-returns-empty', () => {
    const buffer = Buffer.from('hello')
    const cursor = new BufferCursor(buffer)
    cursor.seek(5)
    
    const slice = cursor.slice(0)
    assert.strictEqual(slice.length, 0)
    assert.strictEqual(cursor.tell(), 5)
  })

  await t.test('edge:slice-beyond-buffer-length', () => {
    const buffer = Buffer.from('hello')
    const cursor = new BufferCursor(buffer)
    
    const slice = cursor.slice(10)
    assert.strictEqual(slice.length, 5, 'Slice should return available bytes')
    // BufferCursor increments _start by the requested amount, not the actual slice length
    assert.strictEqual(cursor.tell(), 10, 'tell() reflects the requested slice amount, not actual bytes')
  })
})

