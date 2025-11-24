import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, add, commit, checkout } from '@awesome-os/universal-git-src/index.ts'
import {
  shouldTrackWithLFS,
  smudgeFilter,
  cleanFilter,
  applySmudgeFilter,
  applyCleanFilter,
} from '@awesome-os/universal-git-src/git/lfs/filter.ts'
import { parsePointer, generatePointer } from '@awesome-os/universal-git-src/git/lfs/pointer.ts'
import { FilesystemBackend } from '@awesome-os/universal-git-src/backends/FilesystemBackend.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

test('LFS Filter', async (t) => {
  await t.test('ok:shouldTrackWithLFS-returns-true-for-filter-lfs-attribute', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    // Create .gitattributes with filter=lfs
    await fs.write(`${dir}/.gitattributes`, '*.psd filter=lfs\n', 'utf8')
    await fs.write(`${dir}/test.psd`, 'test content\n', 'utf8')

    const shouldTrack = await shouldTrackWithLFS({ fs, dir, filepath: 'test.psd' })
    assert.strictEqual(shouldTrack, true)
  })

  await t.test('ok:shouldTrackWithLFS-returns-false-for-non-LFS-files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/test.txt`, 'test content\n', 'utf8')

    const shouldTrack = await shouldTrackWithLFS({ fs, dir, filepath: 'test.txt' })
    assert.strictEqual(shouldTrack, false)
  })

  await t.test('ok:shouldTrackWithLFS-returns-true-for-diff-lfs-attribute', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/.gitattributes`, '*.zip diff=lfs\n', 'utf8')
    await fs.write(`${dir}/test.zip`, 'test content\n', 'utf8')

    const shouldTrack = await shouldTrackWithLFS({ fs, dir, filepath: 'test.zip' })
    assert.strictEqual(shouldTrack, true)
  })

  await t.test('ok:shouldTrackWithLFS-returns-true-for-merge-lfs-attribute', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/.gitattributes`, '*.bin merge=lfs\n', 'utf8')
    await fs.write(`${dir}/test.bin`, 'test content\n', 'utf8')

    const shouldTrack = await shouldTrackWithLFS({ fs, dir, filepath: 'test.bin' })
    assert.strictEqual(shouldTrack, true)
  })

  await t.test('ok:smudgeFilter-converts-pointer-to-actual-file-content', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    // Create actual file content
    const actualContent = Buffer.from('Large file content for LFS\n', 'utf8')
    
    // Generate pointer and store actual file
    const pointerText = await generatePointer(actualContent)
    const pointer = parsePointer(pointerText)
    
    // Store actual file in LFS storage
    const { getLFSObjectPath } = await import('@awesome-os/universal-git-src/git/lfs/pointer.ts')
    const objectPath = getLFSObjectPath(pointer.oid)
    await backend.writeLFSFile(objectPath, actualContent)

    // Test smudge filter
    const pointerBuffer = Buffer.from(pointerText, 'utf8')
    const result = await smudgeFilter(pointerBuffer, backend)

    assert.strictEqual(result.toString('utf8'), actualContent.toString('utf8'))
    assert.strictEqual(result.length, actualContent.length)
  })

  await t.test('error:smudgeFilter-throws-error-if-LFS-object-not-found', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    const pointerText = `version https://git-lfs.github.com/spec/v1
oid sha256:nonexistent123456789012345678901234567890123456789012345678901234567890
size 100
`
    const pointerBuffer = Buffer.from(pointerText, 'utf8')

    await assert.rejects(
      () => smudgeFilter(pointerBuffer, backend),
      /LFS object not found/
    )
  })

  await t.test('error:smudgeFilter-throws-error-on-size-mismatch', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    // Create actual file with different size than pointer says
    const actualContent = Buffer.from('content', 'utf8')
    const pointerText = `version https://git-lfs.github.com/spec/v1
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 1000
`
    const pointer = parsePointer(pointerText)
    
    // Store actual file in LFS storage
    const { getLFSObjectPath } = await import('@awesome-os/universal-git-src/git/lfs/pointer.ts')
    const objectPath = getLFSObjectPath(pointer.oid)
    await backend.writeLFSFile(objectPath, actualContent)

    const pointerBuffer = Buffer.from(pointerText, 'utf8')

    await assert.rejects(
      () => smudgeFilter(pointerBuffer, backend),
      /LFS object size mismatch/
    )
  })

  await t.test('ok:cleanFilter-converts-actual-file-to-pointer', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    const fileContent = Buffer.from('Large file content for LFS\n', 'utf8')

    // Test clean filter
    const pointerBuffer = await cleanFilter(fileContent, backend)

    // Verify it's a valid pointer
    const pointer = parsePointer(pointerBuffer)
    assert.strictEqual(pointer.size, fileContent.length)
    assert.ok(pointer.oid.startsWith('sha256:'))

    // Verify actual file was stored in LFS
    const { getLFSObjectPath } = await import('@awesome-os/universal-git-src/git/lfs/pointer.ts')
    const objectPath = getLFSObjectPath(pointer.oid)
    const storedContent = await backend.readLFSFile(objectPath)
    assert.ok(storedContent)
    assert.strictEqual(storedContent!.toString('utf8'), fileContent.toString('utf8'))
  })

  await t.test('ok:applySmudgeFilter-returns-original-content-if-not-a-pointer', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    const blobContent = Buffer.from('Regular file content\n', 'utf8')

    const result = await applySmudgeFilter({
      fs,
      dir,
      gitdir: await repo.getGitdir(),
      filepath: 'test.txt',
      blobContent,
      backend,
    })

    assert.strictEqual(result.toString('utf8'), blobContent.toString('utf8'))
  })

  await t.test('ok:applySmudgeFilter-applies-filter-for-LFS-tracked-files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    // Create .gitattributes
    await fs.write(`${dir}/.gitattributes`, '*.psd filter=lfs\n', 'utf8')

    // Create actual file content
    const actualContent = Buffer.from('Large file content\n', 'utf8')
    const pointerText = await generatePointer(actualContent)
    const pointer = parsePointer(pointerText)
    
    // Store actual file in LFS storage
    const { getLFSObjectPath } = await import('@awesome-os/universal-git-src/git/lfs/pointer.ts')
    const objectPath = getLFSObjectPath(pointer.oid)
    await backend.writeLFSFile(objectPath, actualContent)

    const pointerBuffer = Buffer.from(pointerText, 'utf8')

    const result = await applySmudgeFilter({
      fs,
      dir,
      gitdir: await repo.getGitdir(),
      filepath: 'test.psd',
      blobContent: pointerBuffer,
      backend,
    })

    assert.strictEqual(result.toString('utf8'), actualContent.toString('utf8'))
  })

  await t.test('ok:applySmudgeFilter-returns-pointer-if-LFS-object-not-found-graceful-fallback', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    // Create .gitattributes
    await fs.write(`${dir}/.gitattributes`, '*.psd filter=lfs\n', 'utf8')

    const pointerText = `version https://git-lfs.github.com/spec/v1
oid sha256:nonexistent123456789012345678901234567890123456789012345678901234567890
size 100
`
    const pointerBuffer = Buffer.from(pointerText, 'utf8')

    // Should not throw, but return pointer as fallback
    const result = await applySmudgeFilter({
      fs,
      dir,
      gitdir: await repo.getGitdir(),
      filepath: 'test.psd',
      blobContent: pointerBuffer,
      backend,
    })

    // Should return pointer file (graceful fallback when LFS object not available)
    assert.ok(result.toString('utf8').includes('version https://git-lfs.github.com/spec/v1'))
  })

  await t.test('ok:applyCleanFilter-returns-original-content-if-not-LFS-tracked', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    const fileContent = Buffer.from('Regular file content\n', 'utf8')

    const result = await applyCleanFilter({
      fs,
      dir,
      gitdir: await repo.getGitdir(),
      filepath: 'test.txt',
      fileContent,
      backend,
    })

    assert.strictEqual(result.toString('utf8'), fileContent.toString('utf8'))
  })

  await t.test('ok:applyCleanFilter-converts-to-pointer-for-LFS-tracked-files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const repo = await Repository.open({ fs, dir })
    const gitdir = await repo.getGitdir()
    if (!gitdir) throw new Error('gitdir is required')
    const backend = new FilesystemBackend(fs, gitdir)

    // Create .gitattributes
    await fs.write(`${dir}/.gitattributes`, '*.psd filter=lfs\n', 'utf8')

    const fileContent = Buffer.from('Large file content\n', 'utf8')

    const result = await applyCleanFilter({
      fs,
      dir,
      gitdir: await repo.getGitdir(),
      filepath: 'test.psd',
      fileContent,
      backend,
    })

    // Should be a pointer file
    const pointer = parsePointer(result)
    assert.strictEqual(pointer.size, fileContent.length)
    assert.ok(pointer.oid.startsWith('sha256:'))

    // Verify actual file was stored in LFS
    const { getLFSObjectPath } = await import('@awesome-os/universal-git-src/git/lfs/pointer.ts')
    const objectPath = getLFSObjectPath(pointer.oid)
    const storedContent = await backend.readLFSFile(objectPath)
    assert.ok(storedContent)
    assert.strictEqual(storedContent!.toString('utf8'), fileContent.toString('utf8'))
  })
})

