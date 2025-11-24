import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, add, commit } from '@awesome-os/universal-git-src/index.ts'
import { lfs } from '@awesome-os/universal-git-src/commands/lfs.ts'

test('LFS Command', async (t) => {
  await t.test('lfs track - adds patterns to .gitattributes', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await lfs({ fs, dir, track: ['*.psd', '*.zip'] })

    const gitattributes = (await fs.read(`${dir}/.gitattributes`, 'utf8')) as string
    assert.ok(gitattributes.includes('*.psd filter=lfs'))
    assert.ok(gitattributes.includes('*.zip filter=lfs'))
  })

  await t.test('lfs track - appends to existing .gitattributes', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/.gitattributes`, '*.txt text\n', 'utf8')

    await lfs({ fs, dir, track: ['*.psd'] })

    const gitattributes = (await fs.read(`${dir}/.gitattributes`, 'utf8')) as string
    assert.ok(gitattributes.includes('*.txt text'))
    assert.ok(gitattributes.includes('*.psd filter=lfs'))
  })

  await t.test('lfs track - does not duplicate existing patterns', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/.gitattributes`, '*.psd filter=lfs\n', 'utf8')

    await lfs({ fs, dir, track: ['*.psd'] })

    const gitattributes = (await fs.read(`${dir}/.gitattributes`, 'utf8')) as string
    const matches = gitattributes.match(/\*\.psd filter=lfs/g)
    assert.strictEqual(matches?.length, 1, 'Should not duplicate pattern')
  })

  await t.test('lfs untrack - removes patterns from .gitattributes', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/.gitattributes`, '*.psd filter=lfs\n*.zip filter=lfs\n', 'utf8')

    await lfs({ fs, dir, untrack: ['*.psd'] })

    const gitattributes = (await fs.read(`${dir}/.gitattributes`, 'utf8')) as string
    assert.ok(!gitattributes.includes('*.psd filter=lfs'))
    assert.ok(gitattributes.includes('*.zip filter=lfs'))
  })

  await t.test('lfs untrack - keeps non-LFS patterns', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/.gitattributes`, '*.psd filter=lfs\n*.txt text\n', 'utf8')

    await lfs({ fs, dir, untrack: ['*.psd'] })

    const gitattributes = (await fs.read(`${dir}/.gitattributes`, 'utf8')) as string
    assert.ok(!gitattributes.includes('*.psd filter=lfs'))
    assert.ok(gitattributes.includes('*.txt text'))
  })

  await t.test('lfs list - returns empty array for empty repo', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    const files = await lfs({ fs, dir, list: true }) as string[]

    assert.ok(Array.isArray(files))
    assert.strictEqual(files.length, 0)
  })

  await t.test('lfs list - returns LFS-tracked files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    // Track *.psd files
    await lfs({ fs, dir, track: ['*.psd'] })

    // Create and add files
    await fs.write(`${dir}/test.psd`, 'large file content\n', 'utf8')
    await fs.write(`${dir}/test.txt`, 'regular file\n', 'utf8')
    await add({ fs, dir, filepath: ['test.psd', 'test.txt'] })
    await commit({
      fs,
      dir,
      message: 'Add files',
      author: { name: 'Test', email: 'test@example.com' },
    })

    const files = await lfs({ fs, dir, list: true }) as string[]

    assert.ok(files.includes('test.psd'))
    assert.ok(!files.includes('test.txt'))
  })

  await t.test('lfs isTracked - returns true for LFS-tracked files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await lfs({ fs, dir, track: ['*.psd'] })
    await fs.write(`${dir}/test.psd`, 'content\n', 'utf8')

    const isTracked = await lfs({ fs, dir, isTracked: true, filepath: 'test.psd' }) as boolean

    assert.strictEqual(isTracked, true)
  })

  await t.test('lfs isTracked - returns false for non-LFS files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await fs.write(`${dir}/test.txt`, 'content\n', 'utf8')

    const isTracked = await lfs({ fs, dir, isTracked: true, filepath: 'test.txt' }) as boolean

    assert.strictEqual(isTracked, false)
  })

  await t.test('lfs - throws error for invalid command', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })

    await assert.rejects(
      () => lfs({ fs, dir }),
      /Invalid LFS command/
    )
  })
})

