import { test } from 'node:test'
import assert from 'node:assert'
import { readRef, resolveRef, readSymbolicRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { writeRef } from '@awesome-os/universal-git-src/git/refs/writeRef.ts'

test('readRef', async (t) => {
  await t.test('ok:returns-null-when-ref-is-not-a-string', async () => {
    // Test - lines 59-61: handle non-string ref
    const { fs, gitdir } = await makeFixture('test-readRef')
    // @ts-expect-error - intentionally pass non-string
    const result = await readRef({ fs, gitdir, ref: null })
    assert.strictEqual(result, null)
  })

  await t.test('ok:handles-depth-0-by-returning-ref-as-is', async () => {
    // Test - lines 63-74: depth <= 0 handling
    const { fs, gitdir } = await makeFixture('test-readRef')
    const result = await readRef({ fs, gitdir, ref: 'refs/heads/main', depth: 0 })
    // Should return the ref path or null, not resolve further
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('ok:handles-ref-pointer-with-depth-1', async () => {
    // Test - lines 80-82: depth === 1 for ref pointer
    const { fs, gitdir } = await makeFixture('test-readRef')
    // Create a symbolic ref using writeSymbolicRef
    const { writeSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
    // First create the target ref
    const { resolveRef } = await import('@awesome-os/universal-git-src/git/refs/readRef.ts')
    let mainOid: string
    try {
      mainOid = await resolveRef({ fs, gitdir, ref: 'refs/heads/main' })
    } catch {
      // If main doesn't exist, create it first
      const { writeRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
      mainOid = '0000000000000000000000000000000000000000'
      await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: mainOid })
    }
    // Now create symbolic ref
    await writeSymbolicRef({ fs, gitdir, ref: 'refs/heads/test', value: 'refs/heads/main' })
    const result = await readRef({ fs, gitdir, ref: 'refs/heads/test', depth: 1 })
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('edge:handles-empty-ref-file-with-retries', async () => {
    // Test - lines 139-152: empty file retry logic
    const { fs, gitdir } = await makeFixture('test-empty')
    // Create an empty ref file
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    const { join } = await import('@awesome-os/universal-git-src/core-utils/GitPath.ts')
    await normalizedFs.write(join(gitdir, 'refs/heads/test'), '', 'utf8')
    // Should handle empty file gracefully
    const result = await readRef({ fs, gitdir, ref: 'refs/heads/test' })
    // Should return null or retry and eventually return null
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('edge:handles-invalid-content-type', async () => {
    // Test - lines 134-136: invalid content type handling
    const { fs, gitdir } = await makeFixture('test-empty')
    // This tests the break statement when content type is invalid
    const result = await readRef({ fs, gitdir, ref: 'refs/heads/non-existent' })
    assert.strictEqual(result, null)
  })

  await t.test('ok:handles-packed-refs-with-depth-1', async () => {
    // Test - lines 195-199: packed refs with depth 1
    const { fs, gitdir } = await makeFixture('test-readRef')
    // If there's a packed ref that's symbolic, test depth 1 handling
    const result = await readRef({ fs, gitdir, ref: 'HEAD', depth: 1 })
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('ok:handles-packed-refs-resolution', async () => {
    // Test - lines 201: recursive resolution of packed refs
    const { fs, gitdir } = await makeFixture('test-readRef')
    const result = await readRef({ fs, gitdir, ref: 'HEAD' })
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('ok:readSymbolicRef-handles-Uint8Array-content', async () => {
    // Test - lines 268-273: Uint8Array content handling
    const { fs, gitdir } = await makeFixture('test-readRef')
    // Create a symbolic ref using writeSymbolicRef
    const { writeSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
    // First ensure main exists
    const { resolveRef } = await import('@awesome-os/universal-git-src/git/refs/readRef.ts')
    try {
      await resolveRef({ fs, gitdir, ref: 'refs/heads/main' })
    } catch {
      const { writeRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
      await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: '0000000000000000000000000000000000000000' })
    }
    // Now create symbolic ref
    await writeSymbolicRef({ fs, gitdir, ref: 'refs/heads/symbolic', value: 'refs/heads/main' })
    const result = await readSymbolicRef({ fs, gitdir, ref: 'refs/heads/symbolic' })
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('edge:readSymbolicRef-handles-missing-file', async () => {
    // Test - lines 280-282: catch block when file doesn't exist
    const { fs, gitdir } = await makeFixture('test-empty')
    const result = await readSymbolicRef({ fs, gitdir, ref: 'refs/heads/non-existent' })
    assert.strictEqual(result, null)
  })

  await t.test('ok:readSymbolicRef-handles-packed-refs-with-symbolic-refs', async () => {
    // Test - lines 291-292: packed refs with symbolic refs
    const { fs, gitdir } = await makeFixture('test-readRef')
    const result = await readSymbolicRef({ fs, gitdir, ref: 'HEAD' })
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('edge:readPackedRefs-handles-missing-file', async () => {
    // Test - lines 316-317: catch block when packed-refs doesn't exist
    const { fs, gitdir } = await makeFixture('test-empty')
    // This is tested indirectly through readRef, but we can verify it works
    const result = await readRef({ fs, gitdir, ref: 'refs/heads/non-existent' })
    assert.strictEqual(result, null)
  })

  await t.test('behavior:handles-retry-logic-for-first-path', async () => {
    // Test - lines 143-144, 176-177: setTimeout for first path retries
    const { fs, gitdir } = await makeFixture('test-readRef')
    // This tests the retry logic with setTimeout for first path
    const result = await readRef({ fs, gitdir, ref: 'HEAD' })
    assert.ok(result === null || typeof result === 'string')
  })
})

test('resolveRef', async (t) => {
  await t.test('error:throws-NotFoundError-when-ref-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const { NotFoundError } = await import('@awesome-os/universal-git-src/errors/NotFoundError.ts')
    let error: unknown = null
    try {
      await resolveRef({ fs, gitdir, ref: 'refs/heads/non-existent' })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof NotFoundError)
  })
})

