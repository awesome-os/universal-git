import { test } from 'node:test'
import assert from 'node:assert'
import { parseReceivePackResponse } from '@awesome-os/universal-git-src/wire/parseReceivePackResponse.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'

// Helper function to create an async iterable from an array of buffers
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
const createStream = UniversalBuffer.createStream

test('parseReceivePackResponse', async (t) => {
  await t.test('ok:parse-successful-push-response-unpack-ok', async () => {
    // Setup: Create a response with "unpack ok" and successful ref updates
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode('ok refs/heads/main'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].error, undefined)
  })

  await t.test('ok:parse-successful-push-response-multiple-refs', async () => {
    // Setup: Multiple refs updated successfully
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode('ok refs/heads/main'),
      GitPktLine.encode('ok refs/heads/develop'),
      GitPktLine.encode('ok refs/tags/v1.0.0'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].ok, true)
    assert.strictEqual(result.refs['refs/heads/develop'].ok, true)
    assert.strictEqual(result.refs['refs/tags/v1.0.0'].ok, true)
  })

  await t.test('error:parse-failed-unpack-response', async () => {
    // Setup: Unpack failed with error message
    const response = [
      GitPktLine.encode('unpack error: missing object'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, false)
  })

  await t.test('error:parse-ref-rejection-ng-status', async () => {
    // Setup: Unpack ok but ref update rejected
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode('ng refs/heads/main branch is protected'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true) // unpack succeeded
    assert.strictEqual(result.refs['refs/heads/main'].ok, false)
    assert.strictEqual(result.refs['refs/heads/main'].error, 'branch is protected')
  })

  await t.test('ok:parse-mixed-success-and-failure', async () => {
    // Setup: One ref succeeds, one fails
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode('ok refs/heads/main'),
      GitPktLine.encode('ng refs/heads/protected permission denied'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].ok, true)
    assert.strictEqual(result.refs['refs/heads/protected'].ok, false)
    assert.strictEqual(result.refs['refs/heads/protected'].error, 'permission denied')
  })

  await t.test('error:parse-response-with-error-message-in-ref', async () => {
    // Setup: Ref update with detailed error message
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode('ng refs/heads/main non-fast-forward'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].ok, false)
    assert.strictEqual(result.refs['refs/heads/main'].error, 'non-fast-forward')
  })

  await t.test('edge:parse-response-with-empty-error-message', async () => {
    // Setup: Ref update failed but no error message provided
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode('ng refs/heads/main'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].ok, false)
    assert.strictEqual(result.refs['refs/heads/main'].error, undefined)
  })

  await t.test('ok:parse-response-with-empty-lines', async () => {
    // Setup: Response with empty lines (should be skipped)
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode(''),
      GitPktLine.encode('ok refs/heads/main'),
      GitPktLine.encode(''),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].ok, true)
  })

  await t.test('error:parse-response-without-unpack-line-throws-error', async () => {
    // Setup: Missing unpack line
    const response = [
      GitPktLine.encode('ok refs/heads/main'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    let error: unknown = null
    try {
      await parseReceivePackResponse(stream)
    } catch (err) {
      error = err
    }

    // Assert
    assert.notStrictEqual(error, null)
    // Should throw ParseError
    assert.ok(error instanceof Error)
  })

  await t.test('error:parse-response-with-invalid-unpack-line-throws-error', async () => {
    // Setup: Invalid unpack line (doesn't start with "unpack ")
    const response = [
      GitPktLine.encode('invalid line'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    let error: unknown = null
    try {
      await parseReceivePackResponse(stream)
    } catch (err) {
      error = err
    }

    // Assert
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Error)
  })

  await t.test('ok:parse-response-with-long-error-message', async () => {
    // Setup: Ref update with long error message
    const longError = 'This is a very long error message that describes in detail what went wrong with the push operation and why it was rejected by the server'
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode(`ng refs/heads/main ${longError}`),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.refs['refs/heads/main'].ok, false)
    assert.strictEqual(result.refs['refs/heads/main'].error, longError)
  })

  await t.test('edge:parse-response-with-ref-name-containing-spaces', async () => {
    // Setup: Ref name with spaces (edge case)
    const response = [
      GitPktLine.encode('unpack ok'),
      GitPktLine.encode('ok refs/heads/main branch'),
      GitPktLine.flush(),
    ]
    const stream = createStream(response)

    // Test
    const result = await parseReceivePackResponse(stream)

    // Assert
    assert.strictEqual(result.ok, true)
    // The ref name should be "refs/heads/main" and error should be "branch"
    assert.strictEqual(result.refs['refs/heads/main'].ok, true)
    // If there's a space, the part after space is treated as error message
    assert.strictEqual(result.refs['refs/heads/main'].error, 'branch')
  })
})

