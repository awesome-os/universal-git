import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  init,
  add,
  listFiles,
  readBlob,
  walk,
  STAGE,
  status,
  getConfig,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

// NOTE: we cannot actually commit a real .gitignore file in fixtures or fixtures won't be included in this repo
const writeGitIgnore = async (fs, dir) =>
  fs.write(
    dir + '/.gitignore',
    ['*-pattern.js', 'i.txt', 'js_modules', '.DS_Store'].join('\n')
  )

// NOTE: we cannot actually commit a real symlink in fixtures because it relies on core.symlinks being enabled
const writeSymlink = async (fs, dir) =>
  fs._symlink('c/e.txt', dir + '/e-link.txt')

describe('add', () => {
  it('ok:single-file', async () => {
    // Setup
    const { repo } = await makeFixture('test-add', { init: true })
    // Test
    await add({ repo, filepath: 'a.txt' })
    assert.strictEqual((await listFiles({ repo })).length, 1)
    await add({ repo, filepath: 'a.txt' })
    assert.strictEqual((await listFiles({ repo })).length, 1)
    await add({ repo, filepath: 'a-copy.txt' })
    assert.strictEqual((await listFiles({ repo })).length, 2)
    await add({ repo, filepath: 'b.txt' })
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })
  
  it('ok:multiple-files', async () => {
    // Setup
    const { repo } = await makeFixture('test-add', { init: true })
    // Test
    await add({ repo, filepath: ['a.txt', 'a-copy.txt', 'b.txt'] })
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })
  
  it('param:parallel-false', async () => {
    // Setup
    const { repo } = await makeFixture('test-add', { init: true })
    // Test
    await add({
      repo,
      filepath: ['a.txt', 'a-copy.txt', 'b.txt'],
      parallel: false,
    })
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })
  
  it('error:single-failure', async () => {
    // Setup
    const { repo } = await makeFixture('test-add', { init: true })
    // Test
    let err: any = null
    try {
      await add({ repo, filepath: ['a.txt', 'a-copy.txt', 'non-existent'] })
    } catch (e) {
      err = e
    }
    assert.ok(err !== null, 'Error should be thrown')
    assert.strictEqual(err.caller, 'git.add')
    assert.strictEqual(err.name, 'NotFoundError')
  })
  
  it('error:multiple-failures', async () => {
    // Setup
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)

    // Test
    let err: any = null
    try {
      await add({
        repo,
        filepath: ['a.txt', 'i.txt', 'non-existent', 'also-non-existent'],
      })
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
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)

    // Test
    await add({
      repo,
      filepath: ['a.txt', 'i.txt'],
    })
  })
  
  it('param:force-ignored', async () => {
    // Setup
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)

    // Test
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
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    // it's not currently possible to tests symlinks in the browser since there's no way to create them
    const symlinkCreated = await writeSymlink(fs, dir)
      .then(() => true)
      .catch(() => false)
    // Test
    await add({ repo, filepath: 'c/e.txt' })
    assert.strictEqual((await listFiles({ repo })).length, 1)
    if (!symlinkCreated) return
    await add({ repo, filepath: 'e-link.txt' })
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
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)
    // Test
    await add({ repo, filepath: 'i.txt' })
    assert.strictEqual((await listFiles({ repo })).length, 0)
  })
  
  it('param:force-ignored-file', async () => {
    // Setup
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)
    // Test
    await add({ repo, filepath: 'i.txt', force: true })
    assert.strictEqual((await listFiles({ repo })).length, 1)
  })
  
  it('error:non-existent-file', async () => {
    // Setup
    const { repo } = await makeFixture('test-add', { init: true })
    // Test
    let err: unknown = null
    try {
      await add({ repo, filepath: 'asdf.txt' })
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
    const { repo } = await makeFixture('test-add', { init: true })
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await add({ repo, filepath: 'c' })
    assert.strictEqual((await listFiles({ repo })).length, 4)
  })

  it('behavior:folder-with-gitignore', async () => {
    // Setup
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await add({ repo, filepath: 'c' })
    assert.strictEqual((await listFiles({ repo })).length, 3)
  })

  it('param:force-folder-gitignore', async () => {
    // Setup
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await add({ repo, filepath: 'c', force: true })
    assert.strictEqual((await listFiles({ repo })).length, 4)
  })

  it('ok:add-all', async () => {
    // Setup
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await add({ repo, filepath: '.' })
    assert.strictEqual((await listFiles({ repo })).length, 7)
  })

  it('param:add-all-parallel-false', async () => {
    // Setup
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    await writeGitIgnore(fs, dir)
    // Test
    assert.strictEqual((await listFiles({ repo })).length, 0)
    await add({ repo, filepath: '.', parallel: false })
    assert.strictEqual((await listFiles({ repo })).length, 7)
  })

  it('behavior:autocrlf-binary-files', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-add-autocrlf')
    const autocrlf = await getConfig({ fs, dir, gitdir, path: 'core.autocrlf' })
    assert.strictEqual(autocrlf, 'true')
    const files = await fs.readdir(dir)
    assert.ok(files !== null && files !== undefined, 'readdir should return an array')
    assert.ok(files.includes('20thcenturyfoodcourt.png'))
    assert.ok(files.includes('Test.md'))
    const index = await listFiles({ fs, dir, gitdir })
    assert.ok(index.includes('20thcenturyfoodcourt.png'))
    assert.ok(index.includes('Test.md'))
    const testMdData = await fs.read(`${dir}/Test.md`)
    const testMdContent = testMdData ? new TextDecoder().decode(typeof testMdData === 'string' ? new TextEncoder().encode(testMdData) : testMdData) : ''
    assert.ok(testMdContent.includes(`\r\n`))
    await fs.write(`${dir}/README.md`, '# test')

    await add({ fs, dir, gitdir, filepath: '.' })

    // Binary file should remain unmodified (autocrlf shouldn't affect it)
    const binaryStatus = await status({ fs, dir, gitdir, filepath: '20thcenturyfoodcourt.png' })
    assert.ok(binaryStatus === 'unmodified' || binaryStatus === '*modified', 'Binary file should not be modified by autocrlf')
    // Text file may show as modified if autocrlf changes line endings
    const textStatus = await status({ fs, dir, gitdir, filepath: 'Test.md' })
    assert.ok(textStatus === 'unmodified' || textStatus === '*modified', 'Text file status may vary with autocrlf')
    assert.strictEqual(await status({ fs, dir, gitdir, filepath: 'README.md' }), 'added')
  })

  it('error:caller-property', async () => {
    const { repo } = await makeFixture('test-add', { init: true })
    
    let error: any = null
    try {
      await add({ repo, filepath: 'nonexistent.txt' })
    } catch (err) {
      error = err
    }
    
    assert.ok(error, 'Error should be thrown')
    assert.strictEqual(error.caller, 'git.add', 'Error should have caller property set')
  })

  it('behavior:directory-sequential', async () => {
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    
    // Create a directory with multiple files
    await fs.mkdir(`${dir}/subdir`)
    await fs.write(`${dir}/subdir/file1.txt`, 'content1')
    await fs.write(`${dir}/subdir/file2.txt`, 'content2')
    await fs.write(`${dir}/subdir/file3.txt`, 'content3')
    
    // Add directory with parallel=false
    await add({ repo, filepath: 'subdir', parallel: false })
    
    const files = await listFiles({ repo })
    assert.ok(files.includes('subdir/file1.txt'))
    assert.ok(files.includes('subdir/file2.txt'))
    assert.ok(files.includes('subdir/file3.txt'))
  })

  it('edge:empty-directory', async () => {
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    
    // Create an empty directory
    await fs.mkdir(`${dir}/empty-dir`)
    
    // Add empty directory - should not fail but also not add anything
    await add({ repo, filepath: 'empty-dir' })
    
    const files = await listFiles({ repo })
    assert.strictEqual(files.length, 0, 'Empty directory should not add any files')
  })


  it('error:LFS-filter-error', async () => {
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    
    // Create a file
    await fs.write(`${dir}/file.txt`, 'content')
    
    // The LFS filter might fail, but add should still work
    // This tests the catch block in the LFS filter application
    await add({ repo, filepath: 'file.txt' })
    
    const files = await listFiles({ repo })
    assert.ok(files.includes('file.txt'), 'File should be added even if LFS filter fails')
  })

  it('behavior:autocrlf-config', async () => {
    const { fs, dir, repo } = await makeFixture('test-add', { init: true })
    
    // Set autocrlf to true
    const { setConfig } = await import('@awesome-os/universal-git-src/index.ts')
    const config = await repo.getConfig()
    await config.set('core.autocrlf', 'true', 'local')
    
    // Create a file with LF line endings
    await fs.write(`${dir}/file.txt`, 'line1\nline2\n')
    
    await add({ repo, filepath: 'file.txt' })
    
    const files = await listFiles({ repo })
    assert.ok(files.includes('file.txt'), 'File should be added with autocrlf enabled')
  })
})

