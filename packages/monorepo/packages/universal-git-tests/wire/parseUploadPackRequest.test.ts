import { test } from 'node:test'
import assert from 'node:assert'
import { parseUploadPackRequest } from '@awesome-os/universal-git-src/wire/parseUploadPackRequest.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'

// Helper function to create an async iterable from an array of buffers
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
const createStream = UniversalBuffer.createStream

test('parseUploadPackRequest', async (t) => {
  await t.test('ok:parse-request-with-multiple-wants-and-capabilities', async () => {
    const req = [
      Buffer.from(`008awant fb74ea1a9b6a9601df18c38d3de751c51f064bf7 multi_ack_detailed no-done side-band-64k thin-pack ofs-delta agent=git/2.10.1.windows.1
0032want 5faa96fe725306e060386975a70e4b6eacb576ed
0032want 9ea43b479f5fedc679e3eb37803275d727bf51b7
0032want c1751a5447a7b025e5bca507af483dde7b0b956f
0032want d85135a47c42c9c906e20c08def2fbceac4c2a4f
0032want 18f4b62440abf61285fbfdcbfd990ab8434ff35c
0032want e5c144897b64a44bd1164a0db60738452c9eaf87
00000009done
`),
    ]
    const stream = createStream(req)
    const result = await parseUploadPackRequest(stream)
    
    assert.deepStrictEqual([...result.capabilities], [
      'multi_ack_detailed',
      'no-done',
      'side-band-64k',
      'thin-pack',
      'ofs-delta',
      'agent=git/2.10.1.windows.1',
    ])
    assert.deepStrictEqual([...result.wants], [
      'fb74ea1a9b6a9601df18c38d3de751c51f064bf7',
      '5faa96fe725306e060386975a70e4b6eacb576ed',
      '9ea43b479f5fedc679e3eb37803275d727bf51b7',
      'c1751a5447a7b025e5bca507af483dde7b0b956f',
      'd85135a47c42c9c906e20c08def2fbceac4c2a4f',
      '18f4b62440abf61285fbfdcbfd990ab8434ff35c',
      'e5c144897b64a44bd1164a0db60738452c9eaf87',
    ])
    assert.strictEqual(result.done, true)
  })

  await t.test('ok:parse-request-with-have-command-without-value', async () => {
    // Test: "have" command without a value (malformed but should not crash)
    const req = [
      GitPktLine.encode('want abc123'),
      GitPktLine.encode('have'), // Missing value
      GitPktLine.encode('done'),
      GitPktLine.flush(),
    ]
    const stream = createStream(req)
    const result = await parseUploadPackRequest(stream)
    
    assert.strictEqual(result.wants.length, 1)
    assert.strictEqual(result.haves.length, 0) // Should not add empty value
    assert.strictEqual(result.done, true)
  })

  await t.test('ok:parse-request-with-shallow-command-without-value', async () => {
    // Test: "shallow" command without a value
    const req = [
      GitPktLine.encode('want abc123'),
      GitPktLine.encode('shallow'), // Missing value
      GitPktLine.encode('done'),
      GitPktLine.flush(),
    ]
    const stream = createStream(req)
    const result = await parseUploadPackRequest(stream)
    
    assert.strictEqual(result.wants.length, 1)
    assert.strictEqual(result.shallows.length, 0) // Should not add empty value
    assert.strictEqual(result.done, true)
  })

  await t.test('ok:parse-request-with-deepen-command-without-value', async () => {
    // Test: "deepen" command without a value
    const req = [
      GitPktLine.encode('want abc123'),
      GitPktLine.encode('deepen'), // Missing value
      GitPktLine.encode('done'),
      GitPktLine.flush(),
    ]
    const stream = createStream(req)
    const result = await parseUploadPackRequest(stream)
    
    assert.strictEqual(result.wants.length, 1)
    assert.strictEqual(result.depth, undefined) // Should not set depth without value
    assert.strictEqual(result.done, true)
  })

  await t.test('ok:parse-request-with-deepen-since-command-without-value', async () => {
    // Test: "deepen-since" command without a value
    const req = [
      GitPktLine.encode('want abc123'),
      GitPktLine.encode('deepen-since'), // Missing value
      GitPktLine.encode('done'),
      GitPktLine.flush(),
    ]
    const stream = createStream(req)
    const result = await parseUploadPackRequest(stream)
    
    assert.strictEqual(result.wants.length, 1)
    assert.strictEqual(result.since, undefined) // Should not set since without value
    assert.strictEqual(result.done, true)
  })

  await t.test('ok:parse-request-with-deepen-not-command-without-value', async () => {
    // Test: "deepen-not" command without a value
    const req = [
      GitPktLine.encode('want abc123'),
      GitPktLine.encode('deepen-not'), // Missing value
      GitPktLine.encode('done'),
      GitPktLine.flush(),
    ]
    const stream = createStream(req)
    const result = await parseUploadPackRequest(stream)
    
    assert.strictEqual(result.wants.length, 1)
    assert.strictEqual(result.exclude.length, 0) // Should not add empty value
    assert.strictEqual(result.done, true)
  })

  await t.test('ok:parse-request-with-deepen-relative-command', async () => {
    // Test: "deepen-relative" command (doesn't need a value)
    const req = [
      GitPktLine.encode('want abc123'),
      GitPktLine.encode('deepen-relative'),
      GitPktLine.encode('done'),
      GitPktLine.flush(),
    ]
    const stream = createStream(req)
    const result = await parseUploadPackRequest(stream)
    
    assert.strictEqual(result.wants.length, 1)
    assert.strictEqual(result.relative, true) // Should set relative flag
    assert.strictEqual(result.done, true)
  })
})

