import { test } from 'node:test'
import assert from 'node:assert'
import { writeUploadPackRequest } from '@awesome-os/universal-git-src/wire/writeUploadPackRequest.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

// Helper to decode pkt-line buffer to string
function decodePktLine(buffer: UniversalBuffer): string {
  const lengthHex = buffer.toString('utf8', 0, 4)
  const length = parseInt(lengthHex, 16)
  if (length === 0) return '' // flush packet
  return buffer.toString('utf8', 4, length)
}

test('writeUploadPackRequest', async (t) => {
  await t.test('write request with single want', async () => {
    const wants = ['a'.repeat(40)]

    const result = writeUploadPackRequest({ wants })

    assert.strictEqual(result.length, 3) // want + flush + done
    const wantLine = decodePktLine(result[0])
    assert.ok(wantLine.includes('want'))
    assert.ok(wantLine.includes('a'.repeat(40)))
    assert.deepStrictEqual(result[result.length - 2], GitPktLine.flush())
    const doneLine = decodePktLine(result[result.length - 1])
    assert.ok(doneLine.includes('done'))
  })

  await t.test('write request with capabilities on first want', async () => {
    const wants = ['b'.repeat(40)]
    const capabilities = ['multi_ack', 'side-band-64k']

    const result = writeUploadPackRequest({ wants, capabilities })

    assert.strictEqual(result.length, 3)
    const wantLine = decodePktLine(result[0])
    assert.ok(wantLine.includes('multi_ack'))
    assert.ok(wantLine.includes('side-band-64k'))
  })

  await t.test('write request with multiple wants', async () => {
    const wants = ['c'.repeat(40), 'd'.repeat(40), 'e'.repeat(40)]

    const result = writeUploadPackRequest({ wants })

    assert.strictEqual(result.length, 5) // 3 wants + flush + done
    const firstWant = decodePktLine(result[0])
    const secondWant = decodePktLine(result[1])
    const thirdWant = decodePktLine(result[2])
    
    assert.ok(firstWant.includes('c'.repeat(40)))
    assert.ok(secondWant.includes('d'.repeat(40)))
    assert.ok(thirdWant.includes('e'.repeat(40)))
  })

  await t.test('write request with duplicate wants (should be deduplicated)', async () => {
    const oid = 'f'.repeat(40)
    const wants = [oid, oid, oid]

    const result = writeUploadPackRequest({ wants })

    // Should only have one want after deduplication
    const wantLines = result.slice(0, -2).map(buf => decodePktLine(buf))
    const uniqueWants = new Set(wantLines.filter(line => line.includes('want')))
    assert.strictEqual(uniqueWants.size, 1)
  })

  await t.test('write request with haves', async () => {
    const wants = ['g'.repeat(40)]
    const haves = ['h'.repeat(40), 'i'.repeat(40)]

    const result = writeUploadPackRequest({ wants, haves })

    // Should have: want, flush, have, have, done
    assert.strictEqual(result.length, 5)
    const have1 = decodePktLine(result[2])
    const have2 = decodePktLine(result[3])
    
    assert.ok(have1.includes('have'))
    assert.ok(have1.includes('h'.repeat(40)))
    assert.ok(have2.includes('have'))
    assert.ok(have2.includes('i'.repeat(40)))
  })

  await t.test('write request with shallows', async () => {
    const wants = ['j'.repeat(40)]
    const shallows = ['k'.repeat(40), 'l'.repeat(40)]

    const result = writeUploadPackRequest({ wants, shallows })

    // Should have: want, shallow, shallow, flush, done
    assert.strictEqual(result.length, 5)
    const shallow1 = decodePktLine(result[1])
    const shallow2 = decodePktLine(result[2])
    
    assert.ok(shallow1.includes('shallow'))
    assert.ok(shallow1.includes('k'.repeat(40)))
    assert.ok(shallow2.includes('shallow'))
    assert.ok(shallow2.includes('l'.repeat(40)))
  })

  await t.test('write request with depth', async () => {
    const wants = ['m'.repeat(40)]
    const depth = 10

    const result = writeUploadPackRequest({ wants, depth })

    const deepenLine = decodePktLine(result[1])
    assert.ok(deepenLine.includes('deepen'))
    assert.ok(deepenLine.includes('10'))
  })

  await t.test('write request with since date', async () => {
    const wants = ['n'.repeat(40)]
    const since = new Date('2023-01-01T00:00:00Z')

    const result = writeUploadPackRequest({ wants, since })

    const deepenSinceLine = decodePktLine(result[1])
    assert.ok(deepenSinceLine.includes('deepen-since'))
    const timestamp = Math.floor(since.valueOf() / 1000)
    assert.ok(deepenSinceLine.includes(timestamp.toString()))
  })

  await t.test('write request with exclude refs', async () => {
    const wants = ['o'.repeat(40)]
    const exclude = ['p'.repeat(40), 'q'.repeat(40)]

    const result = writeUploadPackRequest({ wants, exclude })

    const exclude1 = decodePktLine(result[1])
    const exclude2 = decodePktLine(result[2])
    
    assert.ok(exclude1.includes('deepen-not'))
    assert.ok(exclude1.includes('p'.repeat(40)))
    assert.ok(exclude2.includes('deepen-not'))
    assert.ok(exclude2.includes('q'.repeat(40)))
  })

  await t.test('write request with all parameters', async () => {
    const wants = ['r'.repeat(40)]
    const haves = ['s'.repeat(40)]
    const shallows = ['t'.repeat(40)]
    const depth = 5
    const since = new Date('2023-06-01T00:00:00Z')
    const exclude = ['u'.repeat(40)]
    const capabilities = ['multi_ack']

    const result = writeUploadPackRequest({
      wants,
      haves,
      shallows,
      depth,
      since,
      exclude,
      capabilities,
    })

    // Should have: want (with caps), shallow, deepen, deepen-since, deepen-not, flush, have, done
    assert.ok(result.length >= 8)
    
    const wantLine = decodePktLine(result[0])
    assert.ok(wantLine.includes('want'))
    assert.ok(wantLine.includes('multi_ack'))
    
    const shallowLine = decodePktLine(result[1])
    assert.ok(shallowLine.includes('shallow'))
    
    const deepenLine = decodePktLine(result[2])
    assert.ok(deepenLine.includes('deepen'))
    
    const deepenSinceLine = decodePktLine(result[3])
    assert.ok(deepenSinceLine.includes('deepen-since'))
    
    const deepenNotLine = decodePktLine(result[4])
    assert.ok(deepenNotLine.includes('deepen-not'))
  })

  await t.test('write request with null depth (should be ignored)', async () => {
    const wants = ['v'.repeat(40)]
    const depth = null

    const result = writeUploadPackRequest({ wants, depth })

    // Should not have deepen line
    const lines = result.slice(0, -2).map(buf => decodePktLine(buf))
    const hasDeepen = lines.some(line => line.includes('deepen') && !line.includes('deepen-since') && !line.includes('deepen-not'))
    assert.strictEqual(hasDeepen, false)
  })

  await t.test('write request with null since (should be ignored)', async () => {
    const wants = ['w'.repeat(40)]
    const since = null

    const result = writeUploadPackRequest({ wants, since })

    // Should not have deepen-since line
    const lines = result.slice(0, -2).map(buf => decodePktLine(buf))
    const hasDeepenSince = lines.some(line => line.includes('deepen-since'))
    assert.strictEqual(hasDeepenSince, false)
  })

  await t.test('write request with empty parameters', async () => {
    const result = writeUploadPackRequest({})

    // Should have flush and done
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result[0], GitPktLine.flush())
    const doneLine = decodePktLine(result[1])
    assert.ok(doneLine.includes('done'))
  })

  await t.test('write request with zero depth (edge case)', async () => {
    const wants = ['x'.repeat(40)]
    const depth = 0

    const result = writeUploadPackRequest({ wants, depth })

    const deepenLine = decodePktLine(result[1])
    assert.ok(deepenLine.includes('deepen'))
    assert.ok(deepenLine.includes('0'))
  })
})

