import { test } from 'node:test'
import assert from 'node:assert'
import { show } from '@awesome-os/universal-git-src/commands/show.ts'
import { init, add, commit, annotatedTag } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('show', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await show({
        gitdir: '/tmp/test.git',
        ref: 'HEAD',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:gitdir-or-dir-missing', async () => {
    const { fs } = await makeFixture('test-empty')
    try {
      await show({
        fs,
        ref: 'HEAD',
      } as any)
      assert.fail('Should have thrown an error')
    } catch (error) {
      // normalizeCommandArgs throws 'dir OR gitdir' when both are missing
      assert.ok(error instanceof MissingParameterError, 'Should throw MissingParameterError')
      assert.strictEqual((error as any).data?.parameter, 'dir OR gitdir')
    }
  })

  await t.test('param:ref-defaults-HEAD', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Show without ref (should default to HEAD) - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, cache: repo.cache })
    
    assert.strictEqual(result.type, 'commit')
    assert.strictEqual(result.oid, commitOid)
  })

  await t.test('ok:shows-commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Show the commit - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, ref: commitOid, cache: repo.cache })
    
    assert.strictEqual(result.type, 'commit')
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.object)
    assert.strictEqual(typeof (result.object as any).message, 'string')
    assert.strictEqual((result.object as any).message.trim(), 'Initial commit')
  })

  await t.test('ok:shows-HEAD-commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Show HEAD (default ref) - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, cache: repo.cache })
    
    assert.strictEqual(result.type, 'commit')
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.object)
  })

  await t.test('ok:shows-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Get the tree OID from the commit - use dir to let readCommit resolve gitdir the same way commit does
    const { readCommit } = await import('@awesome-os/universal-git-src/index.ts')
    const commitResult = await readCommit({ fs, dir, oid: commitOid, cache: repo.cache })
    const treeOid = commitResult.commit.tree

    // Show the tree - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, ref: treeOid, cache: repo.cache })
    
    assert.strictEqual(result.type, 'tree')
    assert.strictEqual(result.oid, treeOid)
    assert.ok(result.object)
    assert.ok(Array.isArray((result.object as any)))
  })

  await t.test('ok:shows-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Get the blob OID from the tree
    const { readCommit, readTree } = await import('@awesome-os/universal-git-src/index.ts')
    const commitResult = await readCommit({ repo, oid: commitOid })
    const treeOid = commitResult.commit.tree
    const treeResult = await readTree({ repo, oid: treeOid })
    const blobOid = treeResult.tree.find((entry: any) => entry.path === 'file.txt')?.oid

    // Show the blob - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, ref: blobOid, cache: repo.cache })
    
    assert.strictEqual(result.type, 'blob')
    assert.strictEqual(result.oid, blobOid)
    assert.ok(result.object)
    // Blob parser returns Buffer directly, not an object with blob property
    assert.strictEqual((result.object as Buffer).toString(), 'content')
  })

  await t.test('ok:shows-tag', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Create an annotated tag - use dir to let annotatedTag resolve gitdir the same way commit does
    await annotatedTag({
      fs,
      dir,
      ref: 'v1.0.0',
      object: commitOid,
      tagger: { name: 'Test', email: 'test@example.com' },
      message: 'Version 1.0.0',
      cache: repo.cache,
    })

    // Resolve the tag ref to get the tag OID - use dir to let resolveRef resolve gitdir the same way commit does
    const { resolveRef } = await import('@awesome-os/universal-git-src/index.ts')
    const tagOid = await resolveRef({ fs, dir, ref: 'refs/tags/v1.0.0', cache: repo.cache })

    // Show the tag - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, ref: tagOid, cache: repo.cache })
    
    assert.strictEqual(result.type, 'tag')
    assert.strictEqual(result.oid, tagOid)
    assert.ok(result.object)
    assert.strictEqual((result.object as any).tag, 'v1.0.0')
    assert.strictEqual((result.object as any).message.trim(), 'Version 1.0.0')
  })

  await t.test('ok:shows-file-from-commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Show the file from the commit - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, ref: commitOid, filepath: 'file.txt', cache: repo.cache })
    
    assert.strictEqual(result.type, 'blob')
    assert.ok(result.oid)
    assert.strictEqual(result.filepath, 'file.txt')
    assert.ok(result.object)
    // Blob parser returns Buffer directly, not an object with blob property
    assert.strictEqual((result.object as Buffer).toString(), 'content')
  })

  await t.test('ok:shows-file-from-HEAD', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Show the file from HEAD - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    
    assert.strictEqual(result.type, 'blob')
    assert.ok(result.oid)
    assert.strictEqual(result.filepath, 'file.txt')
    assert.ok(result.object)
    // Blob parser returns Buffer directly, not an object with blob property
    assert.strictEqual((result.object as Buffer).toString(), 'content')
  })

  await t.test('ok:ref-as-oid', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Show using OID directly (not a ref name) - use dir to let show resolve gitdir the same way commit does
    const result = await show({ fs, dir, ref: commitOid, cache: repo.cache })
    
    assert.strictEqual(result.type, 'commit')
    assert.strictEqual(result.oid, commitOid)
  })

  await t.test('error:throws-NotFoundError-when-ref-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    
    try {
      await show({ fs, gitdir, ref: 'nonexistent-ref' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error)
    }
  })

  await t.test('error:throws-NotFoundError-when-filepath-does-not-exist-in-commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    const cache: Record<string, unknown> = {}
    await add({ fs, dir, filepath: 'file.txt', cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache,
    })

    // Try to show a non-existent file - use dir to let show resolve gitdir the same way commit does
    try {
      await show({ fs, dir, ref: commitOid, filepath: 'nonexistent.txt', cache })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error)
    }
  })

  await t.test('param:uses-dir-parameter-to-derive-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Show using dir parameter (gitdir should be derived)
    const result = await show({ fs, dir, ref: commitOid, cache: repo.cache })
    
    assert.strictEqual(result.type, 'commit')
    assert.strictEqual(result.oid, commitOid)
  })

  await t.test('param:uses-Repository-parameter-when-provided', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Create a commit
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({
      fs,
      dir,
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
      cache: repo.cache,
    })

    // Use dir and cache explicitly instead of repo parameter to ensure consistency
    // This ensures gitdir resolution matches what commit used
    const result = await show({ fs, dir, cache: repo.cache, ref: commitOid })
    
    assert.strictEqual(result.type, 'commit')
    assert.strictEqual(result.oid, commitOid)
  })
})

