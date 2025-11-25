import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, add } from '@awesome-os/universal-git-src/index.ts'
import { readIndex } from '@awesome-os/universal-git-src/git/index/readIndex.ts'

test('git/index/readIndex', async (t) => {
  await t.test('returns empty GitIndex when index is missing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const index = await readIndex({ fs, gitdir })

    assert.strictEqual(index.entries.length, 0)
  })

  await t.test('parses existing index entries', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    await fs.write(`${dir}/tracked.txt`, 'tracked content')
    await add({ fs, dir, gitdir, filepath: 'tracked.txt' })

    const index = await readIndex({ fs, gitdir })

    assert.ok(index.entries.length > 0)
  })
})

