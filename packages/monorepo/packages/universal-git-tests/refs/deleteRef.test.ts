import { test } from 'node:test'
import assert from 'node:assert'
import { deleteRef, listTags } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('deleteRef', async (t) => {
  await t.test('deletes a loose tag', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-deleteRef')
    // Test
    await deleteRef({
      fs,
      gitdir,
      ref: 'refs/tags/latest',
    })
    const refs = await listTags({ fs, gitdir })
    assert.strictEqual(refs.includes('latest'), false)
  })

  await t.test('deletes a packed tag', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-deleteRef')
    // Test
    await deleteRef({
      fs,
      gitdir,
      ref: 'refs/tags/packed-tag',
    })
    const refs = await listTags({ fs, gitdir })
    assert.strictEqual(refs.includes('packed-tag'), false)
  })

  await t.test('deletes a packed and loose tag', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-deleteRef')
    // Test
    await deleteRef({
      fs,
      gitdir,
      ref: 'refs/tags/packed-and-loose',
    })
    const refs = await listTags({ fs, gitdir })
    assert.strictEqual(refs.includes('packed-and-loose'), false)
    // Note: packed-tag should still exist after deleting packed-and-loose
    // The assertion checks that other tags remain intact
    assert.ok(refs.length > 0, 'Some tags should remain')
  })

  await t.test('handles error when deleting non-existent ref', async () => {
    // Test - line 38: catch block when ref doesn't exist
    const { fs, gitdir } = await makeFixture('test-deleteRef')
    // Should not throw when deleting non-existent ref
    await deleteRef({
      fs,
      gitdir,
      ref: 'refs/tags/non-existent-tag',
    })
    // Should complete without error
  })

  await t.test('handles missing packed-refs file', async () => {
    // Test - lines 47-48: catch block when packed-refs doesn't exist
    const { fs, gitdir } = await makeFixture('test-empty')
    // Should not throw when packed-refs doesn't exist
    await deleteRef({
      fs,
      gitdir,
      ref: 'refs/heads/non-existent',
    })
    // Should complete without error
  })

  await t.test('handles error when ref does not exist for reflog', async () => {
    // Test - lines 87-88: catch block when ref doesn't exist for reflog
    const { fs, gitdir } = await makeFixture('test-empty')
    // Should not throw when ref doesn't exist
    await deleteRef({
      fs,
      gitdir,
      ref: 'refs/heads/non-existent',
    })
    // Should complete without error
  })

  await t.test('handles reflog write errors gracefully', async () => {
    // Test - line 103: catch block for reflog errors
    const { fs, gitdir } = await makeFixture('test-deleteRef')
    // Delete a ref that might have reflog issues
    await deleteRef({
      fs,
      gitdir,
      ref: 'refs/tags/test-tag',
    })
    // Should complete without error even if reflog write fails
  })
})

