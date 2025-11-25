import { test } from 'node:test'
import assert from 'node:assert'
import { readRebaseTodo, getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('readRebaseTodo', async (t) => {
  await t.test('edge:file-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await readRebaseTodo({ fs, gitdir })
    assert.deepStrictEqual(result, [])
  })

  await t.test('ok:read-commands', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    const todoContent = `pick abc123def456 First commit message
reword def456ghi789 Second commit message
edit ghi789jkl012 Third commit message
`
    await fs.write(`${rebaseDir}/git-rebase-todo`, todoContent, 'utf8')

    const result = await readRebaseTodo({ fs, gitdir })
    assert.strictEqual(result.length, 3)
    assert.strictEqual(result[0].action, 'pick')
    assert.strictEqual(result[0].oid, 'abc123def456')
    assert.strictEqual(result[0].message, 'First commit message')
    assert.strictEqual(result[1].action, 'reword')
    assert.strictEqual(result[2].action, 'edit')
  })

  await t.test('ok:filters-comments-and-empty-lines', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    const todoContent = `# This is a comment
pick abc123 First commit

# Another comment
reword def456 Second commit
`
    await fs.write(`${rebaseDir}/git-rebase-todo`, todoContent, 'utf8')

    const result = await readRebaseTodo({ fs, gitdir })
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].action, 'pick')
    assert.strictEqual(result[1].action, 'reword')
  })
})

