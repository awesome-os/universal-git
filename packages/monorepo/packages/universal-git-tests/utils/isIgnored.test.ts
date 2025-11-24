import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isIgnored } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

// NOTE: we cannot actually commit a real .gitignore file in fixtures or fixtures won't be included in this repo
const writeGitIgnore = async (fs, dir, patterns) =>
  fs.write(dir + '/.gitignore', patterns.join('\n'))

describe('isIgnored', () => {
  it('ok:check-gitignore', async () => {
    // Setup
    const { fs, gitdir, dir } = await makeFixture('test-isIgnored')
    await writeGitIgnore(fs, dir, ['a.txt', 'c/*', '!c/d.txt', 'd/'])
    // Test
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'a.txt' }), true)
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'b.txt' }), false)
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'c/d.txt' }), false)
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'c/e.txt' }), true)
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'd/' }), true)
  })
  
  it('ok:check-gitignore-subdirectory', async () => {
    // Setup
    const { fs, gitdir, dir } = await makeFixture('test-isIgnored')
    await writeGitIgnore(fs, dir, ['a.txt'])
    await writeGitIgnore(fs, dir + '/c', ['d.txt'])
    // Test
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'a.txt' }), true)
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'b.txt' }), false)
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'c/d.txt' }), true)
    assert.strictEqual(await isIgnored({ fs, gitdir, dir, filepath: 'c/e.txt' }), false)
  })

  it('ok:returns-false-non-ignored', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-isIgnored')
    
    const ignored = await isIgnored({
      fs,
      dir,
      gitdir,
      filepath: 'test.txt',
    })
    
    assert.strictEqual(ignored, false)
  })

  it('ok:returns-true-ignored', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-isIgnored')
    
    // Create a .gitignore file
    await fs.write(`${dir}/.gitignore`, '*.log\nnode_modules/\n', 'utf8')
    
    const ignored = await isIgnored({
      fs,
      dir,
      gitdir,
      filepath: 'test.log',
    })
    
    assert.strictEqual(ignored, true)
  })

  it('behavior:always-ignores-git-folders', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-isIgnored')
    
    const ignored = await isIgnored({
      fs,
      dir,
      gitdir,
      filepath: '.git',
    })
    
    assert.strictEqual(ignored, true)
  })

  it('behavior:never-ignores-root', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-isIgnored')
    
    const ignored = await isIgnored({
      fs,
      dir,
      gitdir,
      filepath: '.',
    })
    
    assert.strictEqual(ignored, false)
  })

  it('behavior:respects-parent-exclusion', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-isIgnored')
    
    // Create .gitignore that excludes a directory
    await fs.write(`${dir}/.gitignore`, 'excluded/\n', 'utf8')
    
    // Even if we try to un-ignore a file in excluded directory, it should still be ignored
    await fs.mkdir(`${dir}/excluded`, { recursive: true })
    await fs.write(`${dir}/excluded/.gitignore`, '!file.txt\n', 'utf8')
    
    const ignored = await isIgnored({
      fs,
      dir,
      gitdir,
      filepath: 'excluded/file.txt',
    })
    
    assert.strictEqual(ignored, true)
  })
})

