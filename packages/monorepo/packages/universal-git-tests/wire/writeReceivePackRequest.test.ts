import { test } from 'node:test'
import assert from 'node:assert'
import { writeReceivePackRequest } from '@awesome-os/universal-git-src/wire/writeReceivePackRequest.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

// Helper to decode pkt-line buffer to string
function decodePktLine(buffer: UniversalBuffer): string {
  const lengthHex = buffer.toString('utf8', 0, 4)
  const length = parseInt(lengthHex, 16)
  if (length === 0) return '' // flush packet
  return buffer.toString('utf8', 4, length)
}

test('writeReceivePackRequest', async (t) => {
  await t.test('write request with single ref triplet', async () => {
    const triplets = [{
      oldoid: 'a'.repeat(40),
      oid: 'b'.repeat(40),
      fullRef: 'refs/heads/main',
    }]

    const result = await writeReceivePackRequest({ triplets })

    assert.strictEqual(result.length, 2) // One triplet + flush
    const firstLine = decodePktLine(result[0])
    assert.ok(firstLine.includes('a'.repeat(40)))
    assert.ok(firstLine.includes('b'.repeat(40)))
    assert.ok(firstLine.includes('refs/heads/main'))
    assert.deepStrictEqual(result[result.length - 1], GitPktLine.flush())
  })

  await t.test('write request with capabilities on first line', async () => {
    const triplets = [{
      oldoid: 'c'.repeat(40),
      oid: 'd'.repeat(40),
      fullRef: 'refs/heads/develop',
    }]
    const capabilities = ['report-status', 'side-band-64k']

    const result = await writeReceivePackRequest({ triplets, capabilities })

    assert.strictEqual(result.length, 2)
    const firstLine = decodePktLine(result[0])
    assert.ok(firstLine.includes('report-status'))
    assert.ok(firstLine.includes('side-band-64k'))
    assert.ok(firstLine.includes('refs/heads/develop'))
  })

  await t.test('write request with multiple ref triplets', async () => {
    const triplets = [
      {
        oldoid: 'e'.repeat(40),
        oid: 'f'.repeat(40),
        fullRef: 'refs/heads/main',
      },
      {
        oldoid: 'g'.repeat(40),
        oid: 'h'.repeat(40),
        fullRef: 'refs/tags/v1.0.0',
      },
    ]

    const result = await writeReceivePackRequest({ triplets })

    assert.strictEqual(result.length, 3) // Two triplets + flush
    const firstLine = decodePktLine(result[0])
    const secondLine = decodePktLine(result[1])
    
    assert.ok(firstLine.includes('refs/heads/main'))
    assert.ok(secondLine.includes('refs/tags/v1.0.0'))
    assert.deepStrictEqual(result[result.length - 1], GitPktLine.flush())
  })

  await t.test('write request with capabilities only on first triplet', async () => {
    const triplets = [
      {
        oldoid: 'i'.repeat(40),
        oid: 'j'.repeat(40),
        fullRef: 'refs/heads/main',
      },
      {
        oldoid: 'k'.repeat(40),
        oid: 'l'.repeat(40),
        fullRef: 'refs/heads/develop',
      },
    ]
    const capabilities = ['report-status']

    const result = await writeReceivePackRequest({ triplets, capabilities })

    assert.strictEqual(result.length, 3)
    const firstLine = decodePktLine(result[0])
    const secondLine = decodePktLine(result[1])
    
    // Capabilities should only be on first line
    assert.ok(firstLine.includes('report-status'))
    assert.ok(!secondLine.includes('report-status'))
  })

  await t.test('write request with empty triplets', async () => {
    const result = await writeReceivePackRequest({ triplets: [] })

    assert.strictEqual(result.length, 1) // Only flush
    assert.deepStrictEqual(result[0], GitPktLine.flush())
  })

  await t.test('write request with no parameters', async () => {
    const result = await writeReceivePackRequest({})

    assert.strictEqual(result.length, 1) // Only flush
    assert.deepStrictEqual(result[0], GitPktLine.flush())
  })

  await t.test('write request with zero OID (new ref)', async () => {
    const triplets = [{
      oldoid: '0'.repeat(40),
      oid: 'm'.repeat(40),
      fullRef: 'refs/heads/new-branch',
    }]

    const result = await writeReceivePackRequest({ triplets })

    assert.strictEqual(result.length, 2)
    const firstLine = decodePktLine(result[0])
    assert.ok(firstLine.includes('0'.repeat(40)))
    assert.ok(firstLine.includes('m'.repeat(40)))
    assert.ok(firstLine.includes('refs/heads/new-branch'))
  })

  await t.test('write request with delete ref (zero new OID)', async () => {
    const triplets = [{
      oldoid: 'n'.repeat(40),
      oid: '0'.repeat(40),
      fullRef: 'refs/heads/delete-me',
    }]

    const result = await writeReceivePackRequest({ triplets })

    assert.strictEqual(result.length, 2)
    const firstLine = decodePktLine(result[0])
    assert.ok(firstLine.includes('n'.repeat(40)))
    assert.ok(firstLine.includes('0'.repeat(40)))
    assert.ok(firstLine.includes('refs/heads/delete-me'))
  })
})

