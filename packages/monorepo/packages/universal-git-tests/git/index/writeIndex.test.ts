import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { GitIndex } from '@awesome-os/universal-git-src/git/index/GitIndex.ts'
import { writeIndex } from '@awesome-os/universal-git-src/git/index/writeIndex.ts'
import { readIndex } from '@awesome-os/universal-git-src/git/index/readIndex.ts'

test('git/index/writeIndex', async (t) => {
  await t.test('writes entries to disk', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const filepath = 'file.txt'
    await fs.write(join(dir, filepath), 'hello world')
    const stats = await fs.lstat(join(dir, filepath))

    const index = new GitIndex()
    index.insert({
      filepath,
      stats,
      oid: '0123456789abcdef0123456789abcdef01234567',
    })

    await writeIndex({ fs, gitdir, index })

    const reloaded = await readIndex({ fs, gitdir })
    assert.ok(reloaded.has({ filepath }))
  })
})

