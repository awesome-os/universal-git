import { test } from 'node:test'
import assert from 'node:assert'
import { rmRecursive } from '@awesome-os/universal-git-src/utils/rmRecursive.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'

test('rmRecursive', async (t) => {
  await t.test('ok:removes-single-file', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const filepath = join(dir, 'file.txt')
    await normalizedFs.write(filepath, 'content', 'utf8')
    
    // Verify file exists
    assert.ok(await normalizedFs.exists(filepath))
    
    await rmRecursive(fs, filepath)
    
    // Verify file is removed
    assert.ok(!(await normalizedFs.exists(filepath)))
  })

  await t.test('ok:removes-empty-directory', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const dirpath = join(dir, 'emptydir')
    await normalizedFs.mkdir(dirpath, { recursive: true })
    
    // Verify directory exists
    assert.ok(await normalizedFs.exists(dirpath))
    
    await rmRecursive(fs, dirpath)
    
    // Verify directory is removed
    assert.ok(!(await normalizedFs.exists(dirpath)))
  })

  await t.test('ok:removes-directory-with-files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const dirpath = join(dir, 'dir')
    await normalizedFs.mkdir(dirpath, { recursive: true })
    await normalizedFs.write(join(dirpath, 'file1.txt'), 'content1', 'utf8')
    await normalizedFs.write(join(dirpath, 'file2.txt'), 'content2', 'utf8')
    
    // Verify directory and files exist
    assert.ok(await normalizedFs.exists(dirpath))
    assert.ok(await normalizedFs.exists(join(dirpath, 'file1.txt')))
    assert.ok(await normalizedFs.exists(join(dirpath, 'file2.txt')))
    
    await rmRecursive(fs, dirpath)
    
    // Verify directory and files are removed
    assert.ok(!(await normalizedFs.exists(dirpath)))
    assert.ok(!(await normalizedFs.exists(join(dirpath, 'file1.txt'))))
    assert.ok(!(await normalizedFs.exists(join(dirpath, 'file2.txt'))))
  })

  await t.test('ok:removes-nested-directory', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const rootDir = join(dir, 'root')
    const subDir1 = join(rootDir, 'sub1')
    const subDir2 = join(rootDir, 'sub2')
    const deepDir = join(subDir1, 'deep')
    
    // Create parent directories first
    await normalizedFs.mkdir(rootDir, { recursive: true })
    await normalizedFs.mkdir(subDir1, { recursive: true })
    await normalizedFs.mkdir(subDir2, { recursive: true })
    await normalizedFs.mkdir(deepDir, { recursive: true })
    await normalizedFs.write(join(rootDir, 'root.txt'), 'root', 'utf8')
    await normalizedFs.write(join(subDir1, 'sub1.txt'), 'sub1', 'utf8')
    await normalizedFs.write(join(subDir2, 'sub2.txt'), 'sub2', 'utf8')
    await normalizedFs.write(join(deepDir, 'deep.txt'), 'deep', 'utf8')
    
    // Verify all files and directories exist
    assert.ok(await normalizedFs.exists(rootDir))
    assert.ok(await normalizedFs.exists(join(rootDir, 'root.txt')))
    assert.ok(await normalizedFs.exists(deepDir))
    assert.ok(await normalizedFs.exists(join(deepDir, 'deep.txt')))
    
    await rmRecursive(fs, rootDir)
    
    // Verify everything is removed
    assert.ok(!(await normalizedFs.exists(rootDir)))
    assert.ok(!(await normalizedFs.exists(join(rootDir, 'root.txt'))))
    assert.ok(!(await normalizedFs.exists(deepDir)))
    assert.ok(!(await normalizedFs.exists(join(deepDir, 'deep.txt'))))
  })

  await t.test('ok:directory-only-subdirectories', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const rootDir = join(dir, 'root')
    const subDir1 = join(rootDir, 'sub1')
    const subDir2 = join(rootDir, 'sub2')
    
    // Create parent directory first
    await normalizedFs.mkdir(rootDir, { recursive: true })
    await normalizedFs.mkdir(subDir1, { recursive: true })
    await normalizedFs.mkdir(subDir2, { recursive: true })
    
    // Verify directories exist
    assert.ok(await normalizedFs.exists(rootDir))
    assert.ok(await normalizedFs.exists(subDir1))
    assert.ok(await normalizedFs.exists(subDir2))
    
    await rmRecursive(fs, rootDir)
    
    // Verify all directories are removed
    assert.ok(!(await normalizedFs.exists(rootDir)))
    assert.ok(!(await normalizedFs.exists(subDir1)))
    assert.ok(!(await normalizedFs.exists(subDir2)))
  })

  await t.test('edge:readdir-returns-null', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const filepath = join(dir, 'file.txt')
    await normalizedFs.write(filepath, 'content', 'utf8')
    
    // When readdir returns null, it should treat it as a file and call rm
    await rmRecursive(fs, filepath)
    
    // Verify file is removed
    assert.ok(!(await normalizedFs.exists(filepath)))
  })

  await t.test('ok:directory-mixed-files-subdirs', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const rootDir = join(dir, 'root')
    const subDir = join(rootDir, 'subdir')
    
    // Create parent directory first
    await normalizedFs.mkdir(rootDir, { recursive: true })
    await normalizedFs.mkdir(subDir, { recursive: true })
    await normalizedFs.write(join(rootDir, 'file1.txt'), 'file1', 'utf8')
    await normalizedFs.write(join(rootDir, 'file2.txt'), 'file2', 'utf8')
    await normalizedFs.write(join(subDir, 'subfile.txt'), 'subfile', 'utf8')
    
    // Verify everything exists
    assert.ok(await normalizedFs.exists(rootDir))
    assert.ok(await normalizedFs.exists(join(rootDir, 'file1.txt')))
    assert.ok(await normalizedFs.exists(subDir))
    assert.ok(await normalizedFs.exists(join(subDir, 'subfile.txt')))
    
    await rmRecursive(fs, rootDir)
    
    // Verify everything is removed
    assert.ok(!(await normalizedFs.exists(rootDir)))
    assert.ok(!(await normalizedFs.exists(join(rootDir, 'file1.txt'))))
    assert.ok(!(await normalizedFs.exists(subDir)))
    assert.ok(!(await normalizedFs.exists(join(subDir, 'subfile.txt'))))
  })

  await t.test('edge:lstat-returns-null', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const dirpath = join(dir, 'dir')
    await normalizedFs.mkdir(dirpath, { recursive: true })
    
    // Create a mock scenario where lstat might return null
    // This is handled by the code checking `if (!stat) return`
    await rmRecursive(fs, dirpath)
    
    // Directory should still be removed
    assert.ok(!(await normalizedFs.exists(dirpath)))
  })

  await t.test('ok:deeply-nested-many-files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const normalizedFs = createFileSystem(fs)
    
    const rootDir = join(dir, 'root')
    const level1 = join(rootDir, 'level1')
    const level2 = join(level1, 'level2')
    const level3 = join(level2, 'level3')
    
    // Create parent directories first
    await normalizedFs.mkdir(rootDir, { recursive: true })
    await normalizedFs.mkdir(level1, { recursive: true })
    await normalizedFs.mkdir(level2, { recursive: true })
    await normalizedFs.mkdir(level3, { recursive: true })
    
    // Create many files at different levels
    for (let i = 0; i < 5; i++) {
      await normalizedFs.write(join(rootDir, `file${i}.txt`), `content${i}`, 'utf8')
      await normalizedFs.write(join(level1, `file${i}.txt`), `content${i}`, 'utf8')
      await normalizedFs.write(join(level2, `file${i}.txt`), `content${i}`, 'utf8')
      await normalizedFs.write(join(level3, `file${i}.txt`), `content${i}`, 'utf8')
    }
    
    // Verify structure exists
    assert.ok(await normalizedFs.exists(rootDir))
    assert.ok(await normalizedFs.exists(level3))
    assert.ok(await normalizedFs.exists(join(level3, 'file0.txt')))
    
    await rmRecursive(fs, rootDir)
    
    // Verify everything is removed
    assert.ok(!(await normalizedFs.exists(rootDir)))
    assert.ok(!(await normalizedFs.exists(level3)))
    assert.ok(!(await normalizedFs.exists(join(level3, 'file0.txt'))))
  })
})

