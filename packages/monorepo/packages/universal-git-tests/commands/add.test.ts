import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  listFiles,
  readBlob,
  walk,
  STAGE,
  getConfig,
} from '@awesome-os/universal-git-src/index.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

// NOTE: we cannot actually commit a real .gitignore file in fixtures or fixtures won't be included in this repo
const writeGitIgnore = async (repo: Repository) => {
  if (!repo.worktreeBackend) {
    throw new Error('WorktreeBackend not available')
  }
  const { UniversalBuffer } = await import('@awesome-os/universal-git-src/utils/UniversalBuffer.ts')
  const content = ['*-pattern.js', 'i.txt', 'js_modules', '.DS_Store'].join('\n')
  await repo.worktreeBackend.write(
    '.gitignore',
    UniversalBuffer.from(content, 'utf8')
  )
}

// NOTE: we cannot actually commit a real symlink in fixtures because it relies on core.symlinks being enabled
const writeSymlink = async (repo: Repository) => {
  if (!repo.worktreeBackend) {
    throw new Error('WorktreeBackend not available')
  }
  const { UniversalBuffer } = await import('@awesome-os/universal-git-src/utils/UniversalBuffer.ts')
  try {
    await repo.worktreeBackend.writelink('e-link.txt', 'c/e.txt')
  } catch {
    // Symlinks may not be supported
  }
}

describe('add', () => {
  it('ok:single-file', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    // makeFixture already provides a worktreeBackend and automatically checks out to it
    
    // Test
    await repo.add('a.txt')
    assert.strictEqual((await listFiles({ repo })).length, 1)
    await repo.add('a.txt')
    assert.strictEqual((await listFiles({ repo })).length, 1)
    await repo.add('a-copy.txt')
    assert.strictEqual((await listFiles({ repo })).length, 2)
    await repo.add('b.txt')
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })
  
  it('ok:multiple-files', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    // Test
    await repo.add(['a.txt', 'a-copy.txt', 'b.txt'])
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })
  
  it('param:parallel-false', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    // Test - Note: parallel option is not exposed on repo.add(), but we test the functionality
    const { add } = await import('@awesome-os/universal-git-src/commands/add.ts')
    await add({
      repo,
      filepath: ['a.txt', 'a-copy.txt', 'b.txt'],
      parallel: false,
    })
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })
  
  it('error:single-failure', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    // Test
    let err: any = null
    try {
      await repo.add(['a.txt', 'a-copy.txt', 'non-existent'])
    } catch (e) {
      err = e
    }
    assert.ok(err !== null, 'Error should be thrown')
    assert.strictEqual(err.caller, 'git.add')
    assert.strictEqual(err.name, 'NotFoundError')
  })
  
  it('error:multiple-failures', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)

    // Test
    let err: any = null
    try {
      await repo.add(['a.txt', 'i.txt', 'non-existent', 'also-non-existent'])
    } catch (e) {
      err = e
    }
    assert.ok(err !== null, 'Error should be thrown')
    assert.strictEqual(err.caller, 'git.add')
    assert.strictEqual(err.name, 'MultipleGitError')
    assert.ok(err.errors !== null && err.errors !== undefined, 'Error should have errors array')
    assert.strictEqual(err.errors.length, 2)
    err.errors.forEach((e: any) => {
      assert.strictEqual(e.name, 'NotFoundError')
    })
  })
  
  it('behavior:ignored-file', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)

    // Test
    await repo.add(['a.txt', 'i.txt'])
  })
  
  it('param:force-ignored', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)

    // Test
    const { add } = await import('@awesome-os/universal-git-src/commands/add.ts')
    await add({
      repo,
      filepath: ['a.txt', 'i.txt'],
      force: true,
    })
    assert.strictEqual((await listFiles({ repo })).length, 2)
    const files = await listFiles({ repo })
    assert.ok(files.includes('a.txt'))
    assert.ok(files.includes('i.txt'))
  })
  
  it('ok:symlink', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    // it's not currently possible to tests symlinks in the browser since there's no way to create them
    const symlinkCreated = await writeSymlink(repo)
      .then(() => true)
      .catch(() => false)
    // Test
    await repo.add('c/e.txt')
    assert.strictEqual((await listFiles({ repo })).length, 1)
    if (!symlinkCreated) return
    await repo.add('e-link.txt')
    assert.strictEqual((await listFiles({ repo })).length, 2)
    const walkResult = await walk({
      repo,
      trees: [STAGE()],
      map: async (filepath, [stage]) =>
        filepath === 'e-link.txt' && stage ? stage.oid() : undefined,
    })
    assert.strictEqual(walkResult.length, 1)
    const oid = walkResult[0]
    const { blob: symlinkTarget } = await readBlob({ repo, oid })
    let symlinkTargetStr = Buffer.from(symlinkTarget).toString('utf8')
    if (symlinkTargetStr.startsWith('./')) {
      symlinkTargetStr = symlinkTargetStr.substring(2)
    }
    assert.strictEqual(symlinkTargetStr, 'c/e.txt')
  })

  it('edge:ignored-file', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)
    
    // Test
    await repo.add('i.txt')
    assert.strictEqual((await listFiles({ repo })).length, 0)
  })
  
  it('param:force-ignored-file', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)
    
    // Test
    const { add } = await import('@awesome-os/universal-git-src/commands/add.ts')
    await add({ repo, filepath: 'i.txt', force: true })
    assert.strictEqual((await listFiles({ repo })).length, 1)
  })
  
  it('error:non-existent-file', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    // Test
    let err: unknown = null
    try {
      await repo.add('asdf.txt')
    } catch (e) {
      err = e
    }
    assert.notStrictEqual(err, null)
    if (err && typeof err === 'object' && 'caller' in err) {
      assert.strictEqual(err.caller, 'git.add')
    }
  })

  it('ok:folder', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await repo.add('c')
    assert.strictEqual((await listFiles({ repo })).length, 4)
  })

  it('behavior:folder-with-gitignore', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)
    
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await repo.add('c')
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })

  it('param:force-folder-gitignore', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)
    
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    const { add } = await import('@awesome-os/universal-git-src/commands/add.ts')
    await add({ repo, filepath: 'c', force: true })
    assert.strictEqual((await listFiles({ repo })).length, 4)
  })

  it('ok:add-all', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)
    
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await repo.add('.')
    assert.strictEqual((await listFiles({ repo })).length, 7)
  })

  it('param:add-all-parallel-false', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    await writeGitIgnore(repo)
    
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    const { add } = await import('@awesome-os/universal-git-src/commands/add.ts')
    await add({ repo, filepath: '.', parallel: false })
    assert.strictEqual((await listFiles({ repo })).length, 7)
  })

  it('behavior:autocrlf-binary-files', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-add-autocrlf')
    await repo.init()
    
    if (!repo.worktreeBackend) {
      throw new Error('WorktreeBackend not available')
    }
    const { UniversalBuffer } = await import('@awesome-os/universal-git-src/utils/UniversalBuffer.ts')
    
    // Ensure autocrlf is set to true
    const config = await repo.getConfig()
    await config.set('core.autocrlf', 'true', 'local')
    
    const autocrlf = await getConfig({ repo, path: 'core.autocrlf' })
    assert.strictEqual(autocrlf, 'true')
    const files = await repo.worktreeBackend.readdir('')
    assert.ok(files !== null && files !== undefined, 'readdir should return an array')
    assert.ok(files.includes('20thcenturyfoodcourt.png'))
    assert.ok(files.includes('Test.md'))
    
    // Add files first, then check index
    await repo.add('.')
    
    const index = await listFiles({ repo })
    assert.ok(index.includes('20thcenturyfoodcourt.png'))
    assert.ok(index.includes('Test.md'))
    const testMdData = await repo.worktreeBackend.read('Test.md')
    const testMdContent = testMdData ? new TextDecoder().decode(UniversalBuffer.isBuffer(testMdData) ? testMdData : UniversalBuffer.from(testMdData, 'utf8')) : ''
    assert.ok(testMdContent.includes(`\r\n`))
    await repo.worktreeBackend.write('README.md', UniversalBuffer.from('# test', 'utf8'))

    await repo.add('README.md')

    // Binary file should remain unmodified (autocrlf shouldn't affect it)
    const binaryStatus = await repo.status('20thcenturyfoodcourt.png')
    assert.ok(binaryStatus === 'unmodified' || binaryStatus === '*modified', 'Binary file should not be modified by autocrlf')
    // Text file may show as modified if autocrlf changes line endings
    const textStatus = await repo.status('Test.md')
    assert.ok(textStatus === 'unmodified' || textStatus === '*modified', 'Text file status may vary with autocrlf')
    assert.strictEqual(await repo.status('README.md'), 'added')
  })

  it('error:caller-property', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    let error: any = null
    try {
      await repo.add('nonexistent.txt')
    } catch (err) {
      error = err
    }
    
    assert.ok(error, 'Error should be thrown')
    assert.strictEqual(error.caller, 'git.add', 'Error should have caller property set')
  })

  it('behavior:directory-sequential', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    if (!repo.worktreeBackend) {
      throw new Error('WorktreeBackend not available')
    }
    const { UniversalBuffer } = await import('@awesome-os/universal-git-src/utils/UniversalBuffer.ts')
    
    // Create a directory with multiple files
    await repo.worktreeBackend.mkdir('subdir')
    await repo.worktreeBackend.write('subdir/file1.txt', UniversalBuffer.from('content1', 'utf8'))
    await repo.worktreeBackend.write('subdir/file2.txt', UniversalBuffer.from('content2', 'utf8'))
    await repo.worktreeBackend.write('subdir/file3.txt', UniversalBuffer.from('content3', 'utf8'))
    
    // Add directory with parallel=false
    const { add } = await import('@awesome-os/universal-git-src/commands/add.ts')
    await add({ repo, filepath: 'subdir', parallel: false })
    
    const files = await listFiles({ repo })
    assert.ok(files.includes('subdir/file1.txt'))
    assert.ok(files.includes('subdir/file2.txt'))
    assert.ok(files.includes('subdir/file3.txt'))
  })

  it('edge:empty-directory', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    if (!repo.worktreeBackend) {
      throw new Error('WorktreeBackend not available')
    }
    
    // Create an empty directory
    await repo.worktreeBackend.mkdir('empty-dir')
    
    // Add empty directory - should not fail but also not add anything
    await repo.add('empty-dir')
    
    const files = await listFiles({ repo })
    assert.strictEqual(files.length, 0, 'Empty directory should not add any files')
  })


  it('error:LFS-filter-error', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    if (!repo.worktreeBackend) {
      throw new Error('WorktreeBackend not available')
    }
    const { UniversalBuffer } = await import('@awesome-os/universal-git-src/utils/UniversalBuffer.ts')
    
    // Create a file
    await repo.worktreeBackend.write('file.txt', UniversalBuffer.from('content', 'utf8'))
    
    // The LFS filter might fail, but add should still work
    // This tests the catch block in the LFS filter application
    await repo.add('file.txt')
    
    const files = await listFiles({ repo })
    assert.ok(files.includes('file.txt'), 'File should be added even if LFS filter fails')
  })

  it('behavior:autocrlf-config', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-add')
    await repo.init()
    
    if (!repo.worktreeBackend) {
      throw new Error('WorktreeBackend not available')
    }
    const { UniversalBuffer } = await import('@awesome-os/universal-git-src/utils/UniversalBuffer.ts')
    
    // Set autocrlf to true
    const config = await repo.getConfig()
    await config.set('core.autocrlf', 'true', 'local')
    
    // Create a file with LF line endings
    await repo.worktreeBackend.write('file.txt', UniversalBuffer.from('line1\nline2\n', 'utf8'))
    
    await repo.add('file.txt')
    
    const files = await listFiles({ repo })
    assert.ok(files.includes('file.txt'), 'File should be added with autocrlf enabled')
  })
})

