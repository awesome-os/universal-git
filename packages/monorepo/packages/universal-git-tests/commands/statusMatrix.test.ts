import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { statusMatrix, add, remove } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('statusMatrix', () => {
  it('ok:basic', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-statusMatrix')
    // Test
    let matrix = await statusMatrix({ fs, dir, gitdir })
    assert.deepStrictEqual(matrix, [
      ['a.txt', 1, 1, 1],
      ['b.txt', 1, 2, 1],
      ['c.txt', 1, 0, 1],
      ['d.txt', 0, 2, 0],
    ])

    await add({ fs, dir, gitdir, filepath: 'a.txt' })
    await add({ fs, dir, gitdir, filepath: 'b.txt' })
    await remove({ fs, dir, gitdir, filepath: 'c.txt' })
    await add({ fs, dir, gitdir, filepath: 'd.txt' })
    matrix = await statusMatrix({ fs, dir, gitdir })
    assert.deepStrictEqual(matrix, [
      ['a.txt', 1, 1, 1],
      ['b.txt', 1, 2, 2],
      ['c.txt', 1, 0, 0],
      ['d.txt', 0, 2, 2],
    ])

    // And finally the weirdo cases
    const acontent = await fs.read(path.join(dir, 'a.txt'))
    await fs.write(path.join(dir, 'a.txt'), 'Hi')
    await add({ fs, dir, gitdir, filepath: 'a.txt' })
    if (acontent) {
      await fs.write(path.join(dir, 'a.txt'), acontent)
    }
    matrix = await statusMatrix({ fs, dir, gitdir, filepaths: ['a.txt'] })
    assert.deepStrictEqual(matrix, [['a.txt', 1, 1, 3]])

    await remove({ fs, dir, gitdir, filepath: 'a.txt' })
    matrix = await statusMatrix({ fs, dir, gitdir, filepaths: ['a.txt'] })
    assert.deepStrictEqual(matrix, [['a.txt', 1, 1, 0]])

    await fs.write(path.join(dir, 'e.txt'), 'Hi')
    await add({ fs, dir, gitdir, filepath: 'e.txt' })
    await fs.rm(path.join(dir, 'e.txt'))
    matrix = await statusMatrix({ fs, dir, gitdir, filepaths: ['e.txt'] })
    assert.deepStrictEqual(matrix, [['e.txt', 0, 0, 3]])
  })

  it('ok:fresh-repo-no-commits', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await fs.write(path.join(dir, 'a.txt'), 'Hi')
    await fs.write(path.join(dir, 'b.txt'), 'Hi')
    await add({ fs, dir, gitdir, filepath: 'b.txt' })
    // Test
    const a = await statusMatrix({ fs, dir, gitdir, filepaths: ['a.txt'] })
    assert.deepStrictEqual(a, [['a.txt', 0, 2, 0]])
    const b = await statusMatrix({ fs, dir, gitdir, filepaths: ['b.txt'] })
    assert.deepStrictEqual(b, [['b.txt', 0, 2, 2]])
  })

  it('ok:fresh-repo-gitignore', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await fs.write(path.join(dir, '.gitignore'), 'ignoreme.txt\n')
    await fs.write(path.join(dir, 'ignoreme.txt'), 'ignored')
    await add({ fs, dir, gitdir, filepath: '.' })
    // Test
    const a = await statusMatrix({ fs, dir, gitdir })
    assert.deepStrictEqual(a, [['.gitignore', 0, 2, 2]])
  })

  it('behavior:no-ignored-files-in-index', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await fs.write(path.join(dir, '.gitignore'), 'ignoreme.txt\n')
    await add({ fs, dir, gitdir, filepath: '.' })
    await fs.write(path.join(dir, 'ignoreme.txt'), 'ignored')

    // Test
    const a = await statusMatrix({ fs, dir, gitdir })
    assert.deepStrictEqual(a, [['.gitignore', 0, 2, 2]])
  })

  it('param:ignored-true', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await fs.write(path.join(dir, '.gitignore'), 'ignoreme.txt\n')
    await add({ fs, dir, gitdir, filepath: '.' })
    await fs.write(path.join(dir, 'ignoreme.txt'), 'ignored')

    // Test
    const a = await statusMatrix({ fs, dir, gitdir, ignored: true })
    assert.deepStrictEqual(a, [
      ['.gitignore', 0, 2, 2],
      ['ignoreme.txt', 0, 2, 0],
    ])
  })
})

