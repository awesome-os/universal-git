import { test } from 'node:test'
import assert from 'node:assert'
import { nextRebaseCommand, initRebase } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('nextRebaseCommand', async (t) => {
  await t.test('ok:get-next-command', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const commands = [
      { action: 'pick', oid: 'e'.repeat(40), message: 'First' },
      { action: 'pick', oid: 'f'.repeat(40), message: 'Second' },
    ]
    await initRebase({ fs, gitdir, headName: 'refs/heads/main', onto: 'g'.repeat(40), commands })

    const first = await nextRebaseCommand({ fs, gitdir })
    assert.notStrictEqual(first, null)
    assert.strictEqual(first!.action, 'pick')
    assert.strictEqual(first!.oid, 'e'.repeat(40))

    const second = await nextRebaseCommand({ fs, gitdir })
    assert.notStrictEqual(second, null)
    assert.strictEqual(second!.action, 'pick')
    assert.strictEqual(second!.oid, 'f'.repeat(40))

    const third = await nextRebaseCommand({ fs, gitdir })
    assert.strictEqual(third, null)
  })

  await t.test('edge:empty-todo-list', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await nextRebaseCommand({ fs, gitdir })
    assert.strictEqual(result, null)
  })
})

