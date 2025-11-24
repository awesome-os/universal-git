import { test } from 'node:test'
import assert from 'node:assert'
import { parseUploadPackResponse } from '@awesome-os/universal-git-src/wire/parseUploadPackResponse.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'
import { InvalidOidError } from '@awesome-os/universal-git-src/errors/InvalidOidError.ts'

// Helper function to create an async iterable from an array of buffers
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
const createStream = UniversalBuffer.createStream

test('parseUploadPackResponse', async (t) => {
  await t.test('ok:parse-ACK-response', async () => {
    const oid = 'a'.repeat(40)
    const response = [
      GitPktLine.encode(`ACK ${oid}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.acks[0].oid, oid)
    assert.strictEqual(result.acks[0].status, undefined)
    assert.strictEqual(result.nak, false)
    assert.strictEqual(result.shallows.length, 0)
    assert.strictEqual(result.unshallows.length, 0)
  })

  await t.test('ok:parse-ACK-with-status', async () => {
    const oid = 'b'.repeat(40)
    const response = [
      GitPktLine.encode(`ACK ${oid} common\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.acks[0].oid, oid)
    assert.strictEqual(result.acks[0].status, 'common')
    assert.strictEqual(result.nak, false)
  })

  await t.test('ok:parse-multiple-ACKs', async () => {
    const oid1 = 'c'.repeat(40)
    const oid2 = 'd'.repeat(40)
    const response = [
      GitPktLine.encode(`ACK ${oid1} common\n`),
      GitPktLine.encode(`ACK ${oid2}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.acks.length, 2)
    assert.strictEqual(result.acks[0].oid, oid1)
    assert.strictEqual(result.acks[0].status, 'common')
    assert.strictEqual(result.acks[1].oid, oid2)
    assert.strictEqual(result.acks[1].status, undefined)
  })

  await t.test('ok:parse-NAK-response', async () => {
    const response = [
      GitPktLine.encode('NAK\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.nak, true)
    assert.strictEqual(result.acks.length, 0)
  })

  await t.test('ok:parse-shallow-response', async () => {
    const oid = 'e'.repeat(40)
    const response = [
      GitPktLine.encode(`shallow ${oid}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.shallows.length, 1)
    assert.strictEqual(result.shallows[0], oid)
    assert.strictEqual(result.unshallows.length, 0)
  })

  await t.test('ok:parse-multiple-shallows', async () => {
    const oid1 = 'f'.repeat(40)
    const oid2 = '1'.repeat(40)
    const response = [
      GitPktLine.encode(`shallow ${oid1}\n`),
      GitPktLine.encode(`shallow ${oid2}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.shallows.length, 2)
    assert.strictEqual(result.shallows[0], oid1)
    assert.strictEqual(result.shallows[1], oid2)
  })

  await t.test('ok:parse-unshallow-response', async () => {
    const oid = '2'.repeat(40)
    const response = [
      GitPktLine.encode(`unshallow ${oid}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.unshallows.length, 1)
    assert.strictEqual(result.unshallows[0], oid)
    assert.strictEqual(result.shallows.length, 0)
  })

  await t.test('ok:parse-mixed-shallow-and-unshallow', async () => {
    const shallowOid = '3'.repeat(40)
    const unshallowOid = '4'.repeat(40)
    const response = [
      GitPktLine.encode(`shallow ${shallowOid}\n`),
      GitPktLine.encode(`unshallow ${unshallowOid}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.shallows.length, 1)
    assert.strictEqual(result.shallows[0], shallowOid)
    assert.strictEqual(result.unshallows.length, 1)
    assert.strictEqual(result.unshallows[0], unshallowOid)
  })

  await t.test('error:parse-shallow-with-invalid-OID-length-throws-error', async () => {
    const invalidOid = 'short'
    const response = [
      GitPktLine.encode(`shallow ${invalidOid}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    let error: unknown = null
    try {
      await parseUploadPackResponse(stream)
    } catch (err) {
      error = err
    }

    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InvalidOidError)
  })

  await t.test('error:parse-unshallow-with-invalid-OID-length-throws-error', async () => {
    const invalidOid = 'also-too-short'
    const response = [
      GitPktLine.encode(`unshallow ${invalidOid}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    let error: unknown = null
    try {
      await parseUploadPackResponse(stream)
    } catch (err) {
      error = err
    }

    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InvalidOidError)
  })

  await t.test('ok:parse-ACK-followed-by-NAK-ACK-resolves-first', async () => {
    const oid = '5'.repeat(40)
    const response = [
      GitPktLine.encode(`ACK ${oid}\n`),
      GitPktLine.encode('NAK\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    // ACK without status sets done=true immediately, so NAK is never processed
    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.nak, false) // NAK never processed because done=true from ACK
  })

  await t.test('ok:parse-unknown-line-defaults-to-NAK', async () => {
    const response = [
      GitPktLine.encode('unknown line\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.nak, true)
    assert.strictEqual(result.acks.length, 0)
  })

  await t.test('ok:parse-empty-response-flush-only', async () => {
    const response = [
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    // Empty response (just flush) resolves in finally with initial values
    assert.strictEqual(result.nak, false) // Initial value, no NAK seen
    assert.strictEqual(result.acks.length, 0)
  })

  await t.test('ok:parse-ACK-with-done-status', async () => {
    const oid = '6'.repeat(40)
    const response = [
      GitPktLine.encode(`ACK ${oid}\n`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream)

    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.acks[0].oid, oid)
    // When status is undefined, done should be true
  })

  // Protocol v2 tests
  await t.test('ok:parse-protocol-v2-shallow-with-section-marker', async () => {
    const oid = 'a'.repeat(40)
    const response = [
      GitPktLine.encode('shallow-info\n'),
      GitPktLine.encode(`${oid}\n`),
      GitPktLine.encode('\n'), // End section
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    assert.strictEqual(result.shallows.length, 1)
    assert.strictEqual(result.shallows[0], oid)
  })

  await t.test('ok:parse-protocol-v2-unshallow-with-section-marker', async () => {
    const oid = 'b'.repeat(40)
    const response = [
      GitPktLine.encode('unshallow-info\n'),
      GitPktLine.encode(`${oid}\n`),
      GitPktLine.encode('\n'), // End section
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    assert.strictEqual(result.unshallows.length, 1)
    assert.strictEqual(result.unshallows[0], oid)
  })

  await t.test('ok:parse-protocol-v2-shallow-with-prefix-format', async () => {
    const oid = 'c'.repeat(40)
    const response = [
      GitPktLine.encode(`shallow ${oid}\n`),
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    assert.strictEqual(result.shallows.length, 1)
    assert.strictEqual(result.shallows[0], oid)
  })

  await t.test('ok:parse-protocol-v2-ack', async () => {
    const oid = 'd'.repeat(40)
    const response = [
      GitPktLine.encode(`ack ${oid}\n`),
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.acks[0].oid, oid)
    assert.strictEqual(result.acks[0].status, undefined)
  })

  await t.test('ok:parse-protocol-v2-ack-with-status', async () => {
    const oid = 'e'.repeat(40)
    const response = [
      GitPktLine.encode(`ack ${oid} common\n`),
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.acks[0].oid, oid)
    assert.strictEqual(result.acks[0].status, 'common')
  })

  await t.test('ok:parse-protocol-v2-nak', async () => {
    const response = [
      GitPktLine.encode('nak\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    assert.strictEqual(result.nak, true)
    assert.strictEqual(result.acks.length, 0)
  })

  await t.test('ok:parse-protocol-v2-packfile-marker', async () => {
    const oid = 'f'.repeat(40)
    const response = [
      GitPktLine.encode(`ack ${oid}\n`),
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    // Should not throw, packfile marker is handled
    assert.ok(result)
    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.acks[0].oid, oid)
  })

  await t.test('ok:parse-protocol-v2-unknown-line-is-skipped', async () => {
    const oid = '1'.repeat(40)
    const response = [
      GitPktLine.encode('unknown-section\n'),
      GitPktLine.encode(`ack ${oid}\n`),
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    // Unknown line should be skipped, ack should still be parsed
    assert.strictEqual(result.acks.length, 1)
    assert.strictEqual(result.acks[0].oid, oid)
  })

  await t.test('error:parse-protocol-v2-shallow-with-invalid-OID-format', async () => {
    const invalidOid = 'g'.repeat(40) // Invalid hex
    const response = [
      GitPktLine.encode(`shallow ${invalidOid}\n`),
      GitPktLine.encode('packfile\n'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    const result = await parseUploadPackResponse(stream, 2)

    // Invalid OID should be skipped in v2 (no error thrown)
    assert.strictEqual(result.shallows.length, 0)
  })
})

