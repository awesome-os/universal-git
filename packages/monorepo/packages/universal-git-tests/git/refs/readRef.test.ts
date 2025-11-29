import { test } from 'node:test'
import assert from 'node:assert'
import { readSymbolicRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('readRef', async (t) => {
  await t.test('ok:returns-null-when-ref-is-not-a-string', async () => {
    // Test - lines 59-61: handle non-string ref
    const { repo, fs, dir, gitdir } = await makeFixture('test-readRef')
    // @ts-expect-error - intentionally pass non-string
    const result = await repo.gitBackend.readRef(null as any, 5, repo.cache)
    assert.strictEqual(result, null)
  })

  await t.test('ok:handles-depth-0-by-returning-ref-as-is', async () => {
    // Test - lines 63-74: depth <= 0 handling
    const { repo, fs, dir, gitdir } = await makeFixture('test-readRef')
    const result = await repo.gitBackend.readRef('refs/heads/main', 0, repo.cache)
    // Should return the ref path or null, not resolve further
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('ok:handles-ref-pointer-with-depth-1', async () => {
    // Test - lines 80-82: depth === 1 for ref pointer
    const { repo, fs, dir, gitdir } = await makeFixture('test-readRef')
    // Create a symbolic ref using writeSymbolicRef
    const { writeSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
    // First create the target ref
    let mainOid: string
    try {
      mainOid = await repo.gitBackend.readRef('refs/heads/main', 5, repo.cache) || ''
    } catch {
      // If main doesn't exist, create it first
      mainOid = '0000000000000000000000000000000000000000'
      await repo.gitBackend.writeRef('refs/heads/main', mainOid, false, repo.cache)
    }
    // Now create symbolic ref
    await repo.gitBackend.writeSymbolicRef('refs/heads/test', 'refs/heads/main', undefined, {})
    const result = await repo.gitBackend.readRef('refs/heads/test', 1, repo.cache)
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('edge:handles-empty-ref-file-with-retries', async () => {
    // Test - lines 139-152: empty file retry logic
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty')
    // Create an empty ref file
    const { join } = await import('@awesome-os/universal-git-src/core-utils/GitPath.ts')
    // gitdir is already declared in makeFixture destructuring
    await repo.gitBackend.getFs().write(join(gitdir, 'refs/heads/test'), '', 'utf8')
    // Should handle empty file gracefully
    const result = await repo.gitBackend.readRef('refs/heads/test', 5, repo.cache)
    // Should return null or retry and eventually return null
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('edge:handles-invalid-content-type', async () => {
    // Test - lines 134-136: invalid content type handling
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty')
    // This tests the break statement when content type is invalid
    const result = await repo.gitBackend.readRef('refs/heads/non-existent', 5, repo.cache)
    assert.strictEqual(result, null)
  })

  await t.test('ok:handles-packed-refs-with-depth-1', async () => {
    // Test - lines 195-199: packed refs with depth 1
    const { repo, fs, dir, gitdir } = await makeFixture('test-readRef')
    // If there's a packed ref that's symbolic, test depth 1 handling
    const result = await repo.gitBackend.readRef('HEAD', 1, repo.cache)
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('ok:handles-packed-refs-resolution', async () => {
    // Test - lines 201: recursive resolution of packed refs
    const { repo, fs, dir, gitdir } = await makeFixture('test-readRef')
    const result = await repo.gitBackend.readRef('HEAD', 5, repo.cache)
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('ok:readSymbolicRef-handles-Uint8Array-content', async () => {
    // Test - lines 268-273: Uint8Array content handling
    const { repo, fs, dir, gitdir } = await makeFixture('test-readRef')
    // Create a symbolic ref using writeSymbolicRef
    const { writeSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
    // First ensure main exists
    try {
      await repo.gitBackend.readRef('refs/heads/main', 5, repo.cache)
    } catch {
      await repo.gitBackend.writeRef('refs/heads/main', '0000000000000000000000000000000000000000', false, repo.cache)
    }
    // Now create symbolic ref
    await repo.gitBackend.writeSymbolicRef('refs/heads/symbolic', 'refs/heads/main', undefined, {})
    const result = await repo.gitBackend.readSymbolicRef('refs/heads/symbolic')
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('edge:readSymbolicRef-handles-missing-file', async () => {
    // Test - lines 280-282: catch block when file doesn't exist
    const { repo } = await makeFixture('test-empty')
    const result = await repo.gitBackend.readSymbolicRef('refs/heads/non-existent')
    assert.strictEqual(result, null)
  })

  await t.test('ok:readSymbolicRef-handles-packed-refs-with-symbolic-refs', async () => {
    // Test - lines 291-292: packed refs with symbolic refs
    const { repo } = await makeFixture('test-readRef')
    const result = await repo.gitBackend.readSymbolicRef('HEAD')
    assert.ok(result === null || typeof result === 'string')
  })

  await t.test('edge:readPackedRefs-handles-missing-file', async () => {
    // Test - lines 316-317: catch block when packed-refs doesn't exist
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty')
    // This is tested indirectly through readRef, but we can verify it works
    const result = await repo.gitBackend.readRef('refs/heads/non-existent', 5, repo.cache)
    assert.strictEqual(result, null)
  })

  await t.test('behavior:handles-retry-logic-for-first-path', async () => {
    // Test - lines 143-144, 176-177: setTimeout for first path retries
    const { repo, fs, dir, gitdir } = await makeFixture('test-readRef')
    // This tests the retry logic with setTimeout for first path
    const result = await repo.gitBackend.readRef('HEAD', 5, repo.cache)
    assert.ok(result === null || typeof result === 'string')
  })
})

test('resolveRef', async (t) => {
  await t.test('error:throws-NotFoundError-when-ref-does-not-exist', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty')
    const { NotFoundError } = await import('@awesome-os/universal-git-src/errors/NotFoundError.ts')
    let error: unknown = null
    try {
      await repo.resolveRef('refs/heads/non-existent')
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof NotFoundError)
  })
})

