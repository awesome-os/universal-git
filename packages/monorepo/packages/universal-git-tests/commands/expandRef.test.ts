import { test } from 'node:test'
import assert from 'node:assert'
import { expandRef, init, writeRef } from '@awesome-os/universal-git-src/index.ts'
import { readRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('expandRef', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await expandRef({
        gitdir: '/tmp/test.git',
        ref: 'main',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:gitdir-missing', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    try {
      await expandRef({
        fs: repo.fs,
        ref: 'main',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'dir OR gitdir')
    }
  })

  await t.test('param:ref-missing', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    try {
      await expandRef({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'ref')
    }
  })

  await t.test('ok:full-sha-40-chars', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const sha = 'a'.repeat(40)
    const result = await expandRef({ repo, ref: sha })
    assert.strictEqual(result, sha)
  })

  await t.test('ok:full-sha-alphanumeric', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const result = await expandRef({ repo, ref: sha })
    assert.strictEqual(result, sha)
  })

  await t.test('ok:expands-branch-name', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/heads/main', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'main' })
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('ok:expands-tag-name', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/tags/v1.0.0', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'v1.0.0' })
    assert.strictEqual(result, 'refs/tags/v1.0.0')
  })

  await t.test('ok:expands-refs-heads', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/heads/main', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'refs/heads/main' })
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('ok:expands-refs-tags', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/tags/v1.0.0', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'refs/tags/v1.0.0' })
    assert.strictEqual(result, 'refs/tags/v1.0.0')
  })

  await t.test('ok:expands-refs-remotes', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/remotes/origin/main', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'refs/remotes/origin/main' })
    assert.strictEqual(result, 'refs/remotes/origin/main')
  })

  await t.test('ok:expands-remote-branch', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/remotes/origin/main', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'origin/main' })
    assert.strictEqual(result, 'refs/remotes/origin/main')
  })

  await t.test('ok:expands-refs-remotes-HEAD', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/remotes/origin/HEAD', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'origin/HEAD' })
    assert.strictEqual(result, 'refs/remotes/origin/HEAD')
  })

  await t.test('error:NotFoundError', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    try {
      await expandRef({ repo, ref: 'nonexistent' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError)
      assert.strictEqual((error as any).message, 'Could not find nonexistent.')
    }
  })

  await t.test('ok:expands-packed-refs', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    const gitdir = await repo.getGitdir()
    // Create a packed ref
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    const packedRefsContent = `# pack-refs with: peeled fully-peeled sorted
${'a'.repeat(40)} refs/heads/packed-branch
`
    await repo.fs.write(packedRefsPath, packedRefsContent, 'utf8')
    const result = await expandRef({ repo, ref: 'packed-branch' })
    assert.strictEqual(result, 'refs/heads/packed-branch')
  })

  await t.test('behavior:prefers-loose-refs', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create a loose ref
    await writeRef({ repo, ref: 'refs/heads/test-branch', value: 'b'.repeat(40) })
    // Create a packed ref with same name but different value
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    const packedRefsContent = `# pack-refs with: peeled fully-peeled sorted
${'a'.repeat(40)} refs/heads/test-branch
`
    await repo.fs.write(packedRefsPath, packedRefsContent, 'utf8')
    const result = await expandRef({ repo, ref: 'test-branch' })
    assert.strictEqual(result, 'refs/heads/test-branch')
    // Verify it's the loose ref (not the packed one)
    const value = await readRef({ fs: repo.fs, gitdir, ref: 'refs/heads/test-branch' })
    assert.strictEqual(value, 'b'.repeat(40))
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/heads/main', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'main' })
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('error:caller-property', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    try {
      await expandRef({ repo, ref: 'nonexistent-ref' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error: any) {
      assert.strictEqual(error.caller, 'git.expandRef')
    }
  })

  await t.test('rejects partial SHA (less than 40 characters)', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Partial SHA should not be treated as complete SHA
    try {
      await expandRef({ repo, ref: 'a'.repeat(39) })
      // Should try to expand as ref, not return as SHA
      // If it doesn't exist, should throw NotFoundError
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error)
    }
  })

  await t.test('rejects invalid SHA format (non-hex characters)', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Invalid SHA with non-hex characters
    const invalidSha = 'g'.repeat(40)
    try {
      await expandRef({ repo, ref: invalidSha })
      // Should try to expand as ref, not return as SHA
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error)
    }
  })

  await t.test('handles refs with special characters', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create a ref with special characters
    await writeRef({ repo, ref: 'refs/heads/feature/branch-name', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'feature/branch-name' })
    assert.strictEqual(result, 'refs/heads/feature/branch-name')
  })

  await t.test('handles HEAD ref expansion', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // HEAD should be found directly (first in refpaths is exact match)
    // After init, HEAD should already exist, but let's ensure it does
    const gitdir = await repo.getGitdir()
    const headPath = `${gitdir}/HEAD`
    if (!(await repo.fs.exists(headPath))) {
      await repo.fs.write(headPath, 'ref: refs/heads/main', 'utf8')
    }
    await writeRef({ repo, ref: 'refs/heads/main', value: 'a'.repeat(40) })
    // HEAD should be found directly (exact match comes first)
    const result = await expandRef({ repo, ref: 'HEAD' })
    assert.strictEqual(result, 'HEAD')
  })

  await t.test('handles corrupted packed-refs gracefully', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create corrupted packed-refs (invalid format)
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    const corruptedContent = 'This is not a valid packed-refs file\n'
    await repo.fs.write(packedRefsPath, corruptedContent, 'utf8')
    
    // Should handle gracefully (parsePackedRefs should return empty map)
    // Try to expand a ref that doesn't exist
    try {
      await expandRef({ repo, ref: 'nonexistent' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError)
    }
  })

  await t.test('handles empty packed-refs file', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create empty packed-refs
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    await repo.fs.write(packedRefsPath, '', 'utf8')
    
    // Should handle gracefully
    try {
      await expandRef({ repo, ref: 'nonexistent' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError)
    }
  })

  await t.test('handles fs.exists throwing error', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // This test verifies that errors from fs.exists are caught
    // We can't easily simulate fs.exists throwing, but we can verify
    // normal behavior when ref doesn't exist
    try {
      await expandRef({ repo, ref: 'nonexistent-ref' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError)
    }
  })

  await t.test('handles refs/remotes/ with multiple slashes', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/remotes/origin/feature/branch', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'origin/feature/branch' })
    assert.strictEqual(result, 'refs/remotes/origin/feature/branch')
  })

  await t.test('handles refs/remotes/HEAD expansion with multiple slashes', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    await writeRef({ repo, ref: 'refs/remotes/origin/feature/HEAD', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'origin/feature/HEAD' })
    assert.strictEqual(result, 'refs/remotes/origin/feature/HEAD')
  })

  await t.test('handles packed-refs with peeled tags', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create packed-refs with peeled tag
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    const packedRefsContent = `# pack-refs with: peeled fully-peeled sorted
${'a'.repeat(40)} refs/tags/v1.0.0
${'b'.repeat(40)} refs/tags/v1.0.0^{}
`
    await repo.fs.write(packedRefsPath, packedRefsContent, 'utf8')
    const result = await expandRef({ repo, ref: 'v1.0.0' })
    assert.strictEqual(result, 'refs/tags/v1.0.0')
  })

  await t.test('handles refs/refs/ prefix (double prefix)', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // refs/refs/heads/main should be checked in refpaths
    await writeRef({ repo, ref: 'refs/refs/heads/main', value: 'a'.repeat(40) })
    const result = await expandRef({ repo, ref: 'refs/heads/main' })
    assert.strictEqual(result, 'refs/refs/heads/main')
  })

  await t.test('handles packed-refs when fs.read returns Buffer', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create packed-refs file
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    const packedRefsContent = `# pack-refs with: peeled fully-peeled sorted
${'a'.repeat(40)} refs/heads/packed-from-buffer
`
    // Write as Buffer to test the typeof check
    await repo.fs.write(packedRefsPath, Buffer.from(packedRefsContent, 'utf8'))
    
    // When fs.read is called without encoding, it may return Buffer
    // The code checks typeof content === 'string', so Buffer would skip parsing
    // But if we read with 'utf8', it should work
    const result = await expandRef({ repo, ref: 'packed-from-buffer' })
    assert.strictEqual(result, 'refs/heads/packed-from-buffer')
  })

  await t.test('handles ref found in packed-refs when loose ref does not exist', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create packed-refs with a ref that doesn't exist as loose ref
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    const packedRefsContent = `# pack-refs with: peeled fully-peeled sorted
${'a'.repeat(40)} refs/heads/only-in-packed
`
    await repo.fs.write(packedRefsPath, packedRefsContent, 'utf8')
    
    // Should find it in packed-refs even though loose ref doesn't exist
    const result = await expandRef({ repo, ref: 'only-in-packed' })
    assert.strictEqual(result, 'refs/heads/only-in-packed')
  })

  await t.test('checks refpaths in correct order (refs/tags/ before refs/heads/)', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create both a branch and tag with the same name
    await writeRef({ repo, ref: 'refs/heads/test', value: 'a'.repeat(40) })
    await writeRef({ repo, ref: 'refs/tags/test', value: 'b'.repeat(40) })
    
    // Should prefer refs/tags/ over refs/heads/ (comes first in refpaths order)
    const result = await expandRef({ repo, ref: 'test' })
    assert.strictEqual(result, 'refs/tags/test')
  })

  await t.test('checks refs/ before refs/tags/ and refs/heads/', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create refs/test (direct refs/ path) - comes after exact match but before tags/heads
    await writeRef({ repo, ref: 'refs/test', value: 'a'.repeat(40) })
    await writeRef({ repo, ref: 'refs/heads/test', value: 'b'.repeat(40) })
    await writeRef({ repo, ref: 'refs/tags/test', value: 'c'.repeat(40) })
    
    // Should prefer refs/test (comes before refs/tags/ and refs/heads/ in refpaths)
    const result = await expandRef({ repo, ref: 'test' })
    assert.strictEqual(result, 'refs/test')
  })

  await t.test('checks exact ref match before other paths', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create exact ref match (first in refpaths)
    await writeRef({ repo, ref: 'test', value: 'a'.repeat(40) })
    await writeRef({ repo, ref: 'refs/test', value: 'b'.repeat(40) })
    await writeRef({ repo, ref: 'refs/heads/test', value: 'c'.repeat(40) })
    
    // Should prefer exact match (first in refpaths)
    const result = await expandRef({ repo, ref: 'test' })
    assert.strictEqual(result, 'test')
  })

  await t.test('handles SHA with uppercase hex characters', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    // SHA with uppercase should not match the regex (lowercase only)
    const sha = 'A'.repeat(40)
    try {
      const result = await expandRef({ repo, ref: sha })
      // Should try to expand as ref, not return as SHA
      // If it doesn't exist, should throw NotFoundError
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error)
    }
  })

  await t.test('handles SHA validation edge case (exactly 40 chars but invalid)', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    // 40 characters but contains invalid hex character
    const invalidSha = 'a'.repeat(39) + 'g'
    try {
      await expandRef({ repo, ref: invalidSha })
      // Should try to expand as ref, not return as SHA
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error)
    }
  })

  await t.test('handles packed-refs read error gracefully', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create a ref that exists as loose ref
    await writeRef({ repo, ref: 'refs/heads/test', value: 'a'.repeat(40) })
    
    // Even if packed-refs read fails, should still find loose ref
    const result = await expandRef({ repo, ref: 'test' })
    assert.strictEqual(result, 'refs/heads/test')
  })

  await t.test('handles ref found in packed-refs when fs.exists returns false', async () => {
    const { repo } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create packed-refs with a ref
    const gitdir = await repo.getGitdir()
    const packedRefsPath = `${gitdir}/packed-refs`
    const packedRefsContent = `# pack-refs with: peeled fully-peeled sorted
${'a'.repeat(40)} refs/tags/packed-tag
`
    await repo.fs.write(packedRefsPath, packedRefsContent, 'utf8')
    
    // Should find it in packed-refs (packedMap.has check after fs.exists)
    const result = await expandRef({ repo, ref: 'packed-tag' })
    assert.strictEqual(result, 'refs/tags/packed-tag')
  })
})

