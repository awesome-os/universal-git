import { test } from 'node:test'
import assert from 'node:assert'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'
import { fromValue } from '@awesome-os/universal-git-src/utils/fromValue.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('GitPktLine', async (t) => {
  await t.test('encode string to pkt-line', async () => {
    const encoded = GitPktLine.encode('hello\n')
    const hex = encoded.toString('hex')
    // Length is 4 (length field) + 6 (hello\n) = 10 = 0x000a
    // The hex representation of UTF-8 bytes for '000a' is '30303061'
    assert.ok(hex.startsWith('30303061'))
    assert.ok(encoded.toString('utf8').includes('hello'))
  })

  await t.test('encode Buffer to pkt-line', async () => {
    const buffer = UniversalBuffer.from('test', 'utf8')
    const encoded = GitPktLine.encode(buffer)
    const hex = encoded.toString('hex')
    // Length is 4 (length field) + 4 (test) = 8 = 0x0008
    // The hex representation of UTF-8 bytes for '0008' is '30303038'
    assert.ok(hex.startsWith('30303038'))
  })

  await t.test('flush returns flush packet', async () => {
    const flush = GitPktLine.flush()
    assert.strictEqual(flush.toString('utf8'), '0000')
  })

  await t.test('delim returns delimiter packet', async () => {
    const delim = GitPktLine.delim()
    assert.strictEqual(delim.toString('utf8'), '0001')
  })

  await t.test('streamReader reads pkt-lines', async () => {
    const data = UniversalBuffer.concat([
      GitPktLine.encode('hello'),
      GitPktLine.flush(),
    ])
    
    const stream = fromValue(new Uint8Array(data)) as AsyncIterableIterator<Uint8Array>
    const read = GitPktLine.streamReader(stream)
    
    const first = await read()
    assert.ok(UniversalBuffer.isBuffer(first))
    assert.strictEqual(first?.toString('utf8'), 'hello')
    
    const second = await read()
    assert.strictEqual(second, null) // flush packet
  })

  await t.test('streamReader handles end of stream', async () => {
    const data = GitPktLine.encode('test')
    const stream = fromValue(new Uint8Array(data)) as AsyncIterableIterator<Uint8Array>
    const read = GitPktLine.streamReader(stream)
    
    const first = await read()
    assert.ok(UniversalBuffer.isBuffer(first))
    
    const second = await read()
    assert.strictEqual(second, true) // end of stream
  })
})

