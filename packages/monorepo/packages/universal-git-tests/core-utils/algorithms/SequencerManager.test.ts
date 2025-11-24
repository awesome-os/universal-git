import { test } from 'node:test'
import assert from 'node:assert'
import {
  getSequencerDir,
  isRebaseInProgress,
  readRebaseTodo,
  writeRebaseTodo,
  readRebaseHead,
  readRebaseOnto,
  initRebase,
  nextRebaseCommand,
  abortRebase,
  completeRebase,
} from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('SequencerManager', async (t) => {
  await t.test('ok:getSequencerDir-rebase-operation', () => {
    const gitdir = '/test/.git'
    const result = getSequencerDir(gitdir, 'rebase')
    assert.ok(result.includes('rebase-merge'))
    assert.ok(!result.includes('sequencer'))
  })

  await t.test('ok:getSequencerDir-cherry-pick-operation', () => {
    const gitdir = '/test/.git'
    const result = getSequencerDir(gitdir, 'cherry-pick')
    assert.ok(result.includes('sequencer'))
    assert.ok(!result.includes('rebase-merge'))
  })

  await t.test('ok:getSequencerDir-default-operation', () => {
    const gitdir = '/test/.git'
    const result = getSequencerDir(gitdir)
    // Default operation is 'rebase', so should return 'rebase-merge'
    assert.ok(result.includes('rebase-merge'))
  })

  await t.test('ok:isRebaseInProgress-no-rebase', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await isRebaseInProgress({ fs, gitdir })
    assert.strictEqual(result, false)
  })

  await t.test('ok:isRebaseInProgress-rebase-in-progress', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    // Create rebase directory and todo file
    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    await fs.write(`${rebaseDir}/git-rebase-todo`, 'pick abc123 commit message\n', 'utf8')

    const result = await isRebaseInProgress({ fs, gitdir })
    assert.strictEqual(result, true)
  })

  await t.test('edge:readRebaseTodo-file-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await readRebaseTodo({ fs, gitdir })
    assert.deepStrictEqual(result, [])
  })

  await t.test('ok:readRebaseTodo-read-commands', async () => {
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

  await t.test('ok:readRebaseTodo-filters-comments-and-empty-lines', async () => {
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

  await t.test('ok:writeRebaseTodo-write-commands', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const commands = [
      { action: 'pick', oid: 'abc123', message: 'First commit' },
      { action: 'reword', oid: 'def456', message: 'Second commit' },
    ]

    await writeRebaseTodo({ fs, gitdir, commands })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    const content = await fs.read(`${rebaseDir}/git-rebase-todo`, 'utf8') as string
    assert.ok(content.includes('pick abc123 First commit'))
    assert.ok(content.includes('reword def456 Second commit'))
  })

  await t.test('edge:readRebaseHead-file-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await readRebaseHead({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:readRebaseHead-read-head-name', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    await fs.write(`${rebaseDir}/head-name`, 'refs/heads/main\n', 'utf8')

    const result = await readRebaseHead({ fs, gitdir })
    assert.strictEqual(result, 'refs/heads/main')
  })

  await t.test('edge:readRebaseOnto-file-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await readRebaseOnto({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:readRebaseOnto-read-onto-OID', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    const ontoOid = 'a'.repeat(40)
    await fs.write(`${rebaseDir}/onto`, `${ontoOid}\n`, 'utf8')

    const result = await readRebaseOnto({ fs, gitdir })
    assert.strictEqual(result, ontoOid)
  })

  await t.test('ok:initRebase-initialize-rebase', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const headName = 'refs/heads/feature'
    const onto = 'b'.repeat(40)
    const commands = [
      { action: 'pick', oid: 'c'.repeat(40), message: 'Commit 1' },
      { action: 'pick', oid: 'd'.repeat(40), message: 'Commit 2' },
    ]

    await initRebase({ fs, gitdir, headName, onto, commands })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    const headContent = await fs.read(`${rebaseDir}/head-name`, 'utf8') as string
    const ontoContent = await fs.read(`${rebaseDir}/onto`, 'utf8') as string
    const todoContent = await fs.read(`${rebaseDir}/git-rebase-todo`, 'utf8') as string

    assert.strictEqual(headContent.trim(), headName)
    assert.strictEqual(ontoContent.trim(), onto)
    assert.ok(todoContent.includes('Commit 1'))
    assert.ok(todoContent.includes('Commit 2'))
  })

  await t.test('ok:nextRebaseCommand-get-next-command', async () => {
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

  await t.test('edge:nextRebaseCommand-empty-todo-list', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await nextRebaseCommand({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:abortRebase-remove-rebase-directory', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    await fs.write(`${rebaseDir}/git-rebase-todo`, 'pick abc123 test\n', 'utf8')

    await abortRebase({ fs, gitdir })

    const exists = await fs.exists(rebaseDir)
    assert.strictEqual(exists, false)
  })

  await t.test('edge:abortRebase-directory-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    // Should not throw
    await abortRebase({ fs, gitdir })
  })

  await t.test('ok:completeRebase-remove-rebase-directory', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    await fs.write(`${rebaseDir}/git-rebase-todo`, 'pick abc123 test\n', 'utf8')

    await completeRebase({ fs, gitdir })

    const exists = await fs.exists(rebaseDir)
    assert.strictEqual(exists, false)
  })
})

