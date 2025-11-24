import { test } from 'node:test'
import assert from 'node:assert'
import { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { makeNodeFixture } from '../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('FileSystem', async (t) => {
  await t.test('mkdir throws non-ENOENT errors', async () => {
    // Test - line 390: throw non-ENOENT errors
    const { fs, dir } = await makeNodeFixture('test-fs-mkdir-error')
    const fileSystem = new FileSystem(fs as any)
    
    // Mock mkdir to throw a non-ENOENT error
    const originalMkdir = (fileSystem as any)._mkdir
    ;(fileSystem as any)._mkdir = async () => {
      const err: any = new Error('Permission denied')
      err.code = 'EACCES'
      throw err
    }
    
    let error: unknown = null
    try {
      await fileSystem.mkdir(join(dir, 'test-dir'))
    } catch (err) {
      error = err
    }
    // Should throw an error (not ENOENT)
    assert.notStrictEqual(error, null)
    const errorCode = (error as { code?: string })?.code
    assert.ok(errorCode !== 'ENOENT', 'Should not be ENOENT error')
    assert.strictEqual(errorCode, 'EACCES')
    
    // Restore
    ;(fileSystem as any)._mkdir = originalMkdir
  })

  await t.test('readdirDeep handles null stats', async () => {
    // Test - lines 459-460: return res when stats is null
    const { fs, dir } = await makeNodeFixture('test-fs-readdir-deep')
    const fileSystem = new FileSystem(fs as any)
    
    // Create a directory structure
    await fileSystem.mkdir(join(dir, 'subdir'), { recursive: true })
    
    // Mock readdir to return a path
    const originalReaddir = (fileSystem as any)._readdir
    ;(fileSystem as any)._readdir = async () => {
      return ['subdir']
    }
    
    // Mock stat method (not _stat) to return null for the subdir
    // This tests the FileSystem.stat() method which calls extendStat
    const originalStatMethod = fileSystem.stat.bind(fileSystem)
    fileSystem.stat = async (path: string) => {
      if (path.includes('subdir')) {
        return null // Test - lines 459-460: return res when stats is null
      }
      return originalStatMethod(path)
    }
    
    const result = await fileSystem.readdirDeep(dir)
    assert.ok(Array.isArray(result))
    // Should include the subdir path even though stat returned null
    assert.ok(result.some((p: string) => p.includes('subdir')))
    
    // Restore
    ;(fileSystem as any)._readdir = originalReaddir
    fileSystem.stat = originalStatMethod
  })

  await t.test('lstat returns null when stats is null', async () => {
    // Test - lines 477-478: return null when stats is null
    const { fs, dir } = await makeNodeFixture('test-fs-lstat-null')
    const fileSystem = new FileSystem(fs as any)
    
    // Mock _lstat to return null
    const originalLstat = (fileSystem as any)._lstat
    ;(fileSystem as any)._lstat = async () => null
    
    const result = await fileSystem.lstat(join(dir, 'non-existent'))
    assert.strictEqual(result, null)
    
    // Restore
    ;(fileSystem as any)._lstat = originalLstat
  })

  await t.test('lstat throws non-ENOENT/ENS errors', async () => {
    // Test - lines 485-486: throw non-ENOENT/ENS errors
    const { fs, dir } = await makeNodeFixture('test-fs-lstat-error')
    const fileSystem = new FileSystem(fs as any)
    
    // Mock _lstat to throw a non-ENOENT error
    const originalLstat = (fileSystem as any)._lstat
    ;(fileSystem as any)._lstat = async () => {
      const err: any = new Error('Permission denied')
      err.code = 'EACCES'
      throw err
    }
    
    let error: unknown = null
    try {
      await fileSystem.lstat(join(dir, 'file'))
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.strictEqual((error as { code?: string })?.code, 'EACCES')
    
    // Restore
    ;(fileSystem as any)._lstat = originalLstat
  })

  await t.test('stat throws non-ENOENT/ENS errors', async () => {
    // Test - lines 498-503: throw non-ENOENT/ENS errors
    const { fs, dir } = await makeNodeFixture('test-fs-stat-error')
    const fileSystem = new FileSystem(fs as any)
    
    // Mock _stat to throw a non-ENOENT error
    const originalStat = (fileSystem as any)._stat
    ;(fileSystem as any)._stat = async () => {
      const err: any = new Error('Permission denied')
      err.code = 'EACCES'
      throw err
    }
    
    let error: unknown = null
    try {
      await fileSystem.stat(join(dir, 'file'))
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.strictEqual((error as { code?: string })?.code, 'EACCES')
    
    // Restore
    ;(fileSystem as any)._stat = originalStat
  })

  await t.test('readlink handles Uint8Array return', async () => {
    // Test - lines 520-525: handle Uint8Array and throw non-ENOENT/ENS errors
    const { fs, dir } = await makeNodeFixture('test-fs-readlink')
    const fileSystem = new FileSystem(fs as any)
    
    // Create a symlink
    await fileSystem.write(join(dir, 'target'), 'target content', 'utf8')
    await fileSystem.writelink(join(dir, 'link'), UniversalBuffer.from('target'))
    
    // Mock _readlink to return Uint8Array
    const originalReadlink = (fileSystem as any)._readlink
    ;(fileSystem as any)._readlink = async () => {
      return new Uint8Array([116, 97, 114, 103, 101, 116]) // 'target'
    }
    
    const result = await fileSystem.readlink(join(dir, 'link'))
    assert.ok(UniversalBuffer.isBuffer(result))
    
    // Restore
    ;(fileSystem as any)._readlink = originalReadlink
  })

  await t.test('readlink throws non-ENOENT/ENS errors', async () => {
    // Test - lines 520-525: throw non-ENOENT/ENS errors
    const { fs, dir } = await makeNodeFixture('test-fs-readlink-error')
    const fileSystem = new FileSystem(fs as any)
    
    // Mock _readlink to throw a non-ENOENT error
    const originalReadlink = (fileSystem as any)._readlink
    ;(fileSystem as any)._readlink = async () => {
      const err: any = new Error('Permission denied')
      err.code = 'EACCES'
      throw err
    }
    
    let error: unknown = null
    try {
      await fileSystem.readlink(join(dir, 'link'))
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.strictEqual((error as { code?: string })?.code, 'EACCES')
    
    // Restore
    ;(fileSystem as any)._readlink = originalReadlink
  })

  await t.test('writelink converts buffer to string', async () => {
    // Test - line 532-533: convert buffer to string for symlink
    const { fs, dir } = await makeNodeFixture('test-fs-writelink')
    const fileSystem = new FileSystem(fs as any)
    
    const target = 'target-file'
    await fileSystem.writelink(join(dir, 'link'), UniversalBuffer.from(target, 'utf8'))
    
    // Verify symlink was created
    const linkTarget = await fileSystem.readlink(join(dir, 'link'))
    assert.ok(linkTarget)
    assert.strictEqual(linkTarget.toString('utf8'), target)
  })
})

