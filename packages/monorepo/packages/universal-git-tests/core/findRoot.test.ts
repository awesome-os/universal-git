import { test } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { findRoot } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { normalize } from '@awesome-os/universal-git-src/core-utils/GitPath.ts'

// NOTE: Because ".git" is not allowed as a path name in git,
// we can't actually store the ".git" folders in our fixture,
// so we have to make those folders dynamically.
test('findRoot', async (t) => {
  await t.test('finds git directory', async () => {
    const { fs, dir } = await makeFixture('test-simple')
    
    // Create .git directory in the working directory so findRoot can find it
    await fs.mkdir(path.join(dir, '.git'))
    
    const foundRoot = await findRoot({ fs, filepath: dir })
    // findRoot returns the directory containing .git, not the .git directory itself
    // Normalize foundRoot for comparison (makeFixture already normalizes dir)
    assert.strictEqual(normalize(foundRoot), dir)
  })

  await t.test('finds git directory from subdirectory', async () => {
    const { fs, dir } = await makeFixture('test-simple')
    
    // Create .git directory in the working directory
    await fs.mkdir(path.join(dir, '.git'))
    
    // Create a subdirectory
    const subdir = path.join(dir, 'subdir')
    await fs.mkdir(subdir)
    
    const foundRoot = await findRoot({ fs, filepath: subdir })
    // findRoot should find the directory containing .git
    // Normalize foundRoot for comparison (makeFixture already normalizes dir)
    assert.strictEqual(normalize(foundRoot), dir)
  })

  await t.test('filepath has its own .git folder', async () => {
    // Setup
    const { fs, dir } = await makeFixture('test-findRoot')
    
    await fs.mkdir(path.join(dir, 'foobar', '.git'))
    await fs.mkdir(path.join(dir, 'foobar/bar', '.git'))
    // Test
    const root = await findRoot({
      fs,
      filepath: path.join(dir, 'foobar'),
    })
    // Normalize root for comparison (makeFixture already normalizes dir)
    const normalizedRoot = normalize(root)
    assert.strictEqual(path.basename(normalizedRoot), 'foobar')
  })

  await t.test('filepath has ancestor with a .git folder', async () => {
    // Setup
    const { fs, dir } = await makeFixture('test-findRoot')
    
    await fs.mkdir(path.join(dir, 'foobar', '.git'))
    await fs.mkdir(path.join(dir, 'foobar/bar', '.git'))
    // Test
    const root = await findRoot({
      fs,
      filepath: path.join(dir, 'foobar/bar/baz/buzz'),
    })
    // Normalize root for comparison (makeFixture already normalizes dir)
    const normalizedRoot = normalize(root)
    assert.strictEqual(path.basename(normalizedRoot), 'bar')
  })
})

