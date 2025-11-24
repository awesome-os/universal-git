import { test } from 'node:test'
import assert from 'node:assert'
import { parseRefsAdResponse } from '@awesome-os/universal-git-src/wire/parseRefsAdResponse.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'
import { Errors } from '@awesome-os/universal-git-src/index.ts'

import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

// Use UniversalBuffer.createStream instead of local helper
const createStream = UniversalBuffer.createStream

test('parseRefsAdResponse', async (t) => {
  await t.test('ok:parse-protocol-v1-basic-response-with-one-ref', async () => {
    // Setup: Standard protocol v1 response
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123 refs/heads/main\x00capability1 capability2'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.get('refs/heads/main'), 'abc123')
      assert.ok(result.capabilities.has('capability1'))
      assert.ok(result.capabilities.has('capability2'))
    }
  })

  await t.test('ok:parse-protocol-v1-multiple-refs', async () => {
    // Setup: Multiple refs
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123 refs/heads/main\x00capability1'),
      GitPktLine.encode('def456 refs/heads/develop'),
      GitPktLine.encode('ghi789 refs/tags/v1.0.0'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.get('refs/heads/main'), 'abc123')
      assert.strictEqual(result.refs.get('refs/heads/develop'), 'def456')
      assert.strictEqual(result.refs.get('refs/tags/v1.0.0'), 'ghi789')
      assert.strictEqual(result.refs.size, 3)
    }
  })

  await t.test('ok:parse-protocol-v1-empty-repo-zero-refs', async () => {
    // Setup: Brand new repo with zero refs
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.flush(), // End of stream immediately
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.size, 0)
      assert.strictEqual(result.capabilities.size, 0)
    }
  })

  await t.test('ok:parse-protocol-v1-with-symrefs', async () => {
    // Setup: Response with symref capability
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123 refs/heads/main\x00symref=HEAD:refs/heads/main capability1'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.get('refs/heads/main'), 'abc123')
      assert.strictEqual(result.symrefs.get('HEAD'), 'refs/heads/main')
      assert.ok(result.capabilities.has('symref=HEAD:refs/heads/main'))
    }
  })

  await t.test('ok:parse-protocol-v1-no-refs-capability-git-2-41-0-plus', async () => {
    // Setup: Response with no-refs capability (empty repo indicator)
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('0000000000000000000000000000000000000000 capabilities^{}\x00capability1'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.size, 0)
      assert.ok(result.capabilities.has('capability1'))
    }
  })

  await t.test('ok:parse-protocol-v1-skip-flush-packets', async () => {
    // Setup: Response with flush packets that should be skipped
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.flush(), // Should be skipped
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.flush(), // Should be skipped
      GitPktLine.encode('abc123 refs/heads/main\x00capability1'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.get('refs/heads/main'), 'abc123')
    }
  })

  await t.test('ok:parse-protocol-v1-service-line-with-trailing-LF', async () => {
    // Setup: Service line with trailing LF (should be ignored)
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}\n`),
      GitPktLine.encode('abc123 refs/heads/main\x00capability1'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.get('refs/heads/main'), 'abc123')
    }
  })

  await t.test('ok:parse-protocol-v1-multiple-symrefs', async () => {
    // Setup: Multiple symrefs
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123 refs/heads/main\x00symref=HEAD:refs/heads/main symref=refs/heads/master:refs/heads/main'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.symrefs.get('HEAD'), 'refs/heads/main')
      assert.strictEqual(result.symrefs.get('refs/heads/master'), 'refs/heads/main')
    }
  })

  await t.test('ok:parse-protocol-v1-empty-capabilities', async () => {
    // Setup: Response with no capabilities
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123 refs/heads/main\x00'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.strictEqual(result.refs.get('refs/heads/main'), 'abc123')
      assert.strictEqual(result.capabilities.size, 0)
    }
  })

  await t.test('error:parse-protocol-v1-invalid-service-line-throws-error', async () => {
    // Setup: Wrong service name
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode('# service=git-receive-pack'), // Wrong service
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    let error: unknown = null
    try {
      await parseRefsAdResponse(stream, { service })
    } catch (err) {
      error = err
    }

    // Assert
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.ParseError)
  })

  await t.test('error:parse-protocol-v1-empty-server-response-throws-error', async () => {
    // Setup: Empty stream (no data)
    const service = 'git-upload-pack'
    const response: Buffer[] = [] // Empty
    const stream = createStream(response)

    // Test
    let error: unknown = null
    try {
      await parseRefsAdResponse(stream, { service })
    } catch (err) {
      error = err
    }

    // Assert
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.EmptyServerResponseError)
  })

  await t.test('ok:parse-protocol-v2-detected-in-first-line', async () => {
    // Setup: Protocol v2 response (version 2 in first line)
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode('version 2'),
      GitPktLine.encode('capability1=value1'),
      GitPktLine.encode('capability2'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 2)
    if (result.protocolVersion === 2) {
      assert.strictEqual(result.capabilities2['capability1'], 'value1')
      assert.strictEqual(result.capabilities2['capability2'], true)
    }
  })

  await t.test('ok:parse-protocol-v2-detected-in-second-line', async () => {
    // Setup: Protocol v2 response (version 2 in second line)
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('version 2'),
      GitPktLine.encode('capability1=value1'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 2)
    if (result.protocolVersion === 2) {
      assert.strictEqual(result.capabilities2['capability1'], 'value1')
    }
  })

  await t.test('ok:parse-protocol-v1-capabilities-with-empty-strings-filtered', async () => {
    // Setup: Capabilities line with empty strings (should be filtered)
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123 refs/heads/main\x00cap1  cap2  '), // Multiple spaces
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseRefsAdResponse(stream, { service })

    // Assert
    assert.strictEqual(result.protocolVersion, 1)
    if (result.protocolVersion === 1) {
      assert.ok(result.capabilities.has('cap1'))
      assert.ok(result.capabilities.has('cap2'))
      // Empty strings should not be added
      assert.strictEqual(result.capabilities.size, 2)
    }
  })

  await t.test('error:parse-protocol-v1-malformed-ref-line-without-space-throws-error', async () => {
    // Setup: Ref line without space separator (malformed)
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123refs/heads/main'), // Missing space
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    let error: unknown = null
    try {
      await parseRefsAdResponse(stream, { service })
    } catch (err) {
      error = err
    }

    // Assert
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.ParseError)
  })

  await t.test('error:parse-protocol-v1-malformed-ref-line-with-multiple-spaces-but-no-null-byte-throws-error', async () => {
    // Setup: Ref line with multiple spaces but no null byte separator for capabilities
    const service = 'git-upload-pack'
    const response = [
      GitPktLine.encode(`# service=${service}`),
      GitPktLine.encode('abc123 refs/heads/main extra'), // Multiple spaces, no null byte
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    let error: unknown = null
    try {
      await parseRefsAdResponse(stream, { service })
    } catch (err) {
      error = err
    }

    // Assert
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.ParseError)
  })
})

