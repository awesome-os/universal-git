import { test } from 'node:test'
import assert from 'node:assert'
import { writeNote, removeNote } from '@awesome-os/universal-git-src/git/refs/notes/writeNote.ts'
import { readNote } from '@awesome-os/universal-git-src/git/refs/notes/readNote.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { commit, add, init, setConfig } from '@awesome-os/universal-git-src/index.ts'

test('writeNote', async (t) => {
  await t.test('ok:writes-a-new-note', async () => {
    const { repo } = await makeFixture('test-writeNote')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    // Create a commit
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write a note
    const notesTreeOid = await writeNote({ 
      gitBackend: repo.gitBackend, 
      oid: commitOid, 
      note: 'This is a note' 
    })
    
    assert.ok(notesTreeOid)
    assert.strictEqual(typeof notesTreeOid, 'string')
    
    // Verify note can be read
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'This is a note')
  })

  await t.test('ok:writes-note-from-Buffer', async () => {
    const { repo } = await makeFixture('test-writeNote-buffer')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    const noteBuffer = Buffer.from('Note from buffer', 'utf8')
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: noteBuffer })
    
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Note from buffer')
  })

  await t.test('ok:writes-note-from-string', async () => {
    const { repo } = await makeFixture('test-writeNote-string')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'Note from string' })
    
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Note from string')
  })

  await t.test('ok:creates-notes-ref-if-it-does-not-exist', async () => {
    const { repo } = await makeFixture('test-writeNote-new-ref')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write note (notes ref doesn't exist yet)
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'First note' })
    
    // Verify note was written
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.ok(note !== null)
  })

  await t.test('ok:overwrites-existing-note-when-force-true', async () => {
    const { repo } = await makeFixture('test-writeNote-force')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write initial note
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'Initial note' })
    
    // Overwrite with force=true
    await writeNote({ 
      gitBackend: repo.gitBackend, 
      oid: commitOid, 
      note: 'Updated note',
      force: true
    })
    
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Updated note')
  })

  await t.test('error:throws-error-when-overwriting-without-force', async () => {
    const { repo } = await makeFixture('test-writeNote-no-force')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write initial note
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'Initial note' })
    
    // Try to overwrite without force
    await assert.rejects(
      async () => {
        await writeNote({ 
          gitBackend: repo.gitBackend, 
          oid: commitOid, 
          note: 'Updated note',
          force: false
        })
      },
      (error: any) => {
        return error instanceof Error && 
               error.message.includes('Note already exists')
      }
    )
  })

  await t.test('ok:writes-note-to-custom-namespace', async () => {
    const { repo } = await makeFixture('test-writeNote-namespace')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    await writeNote({ 
      gitBackend: repo.gitBackend, 
      oid: commitOid, 
      note: 'Custom namespace note',
      namespace: 'custom'
    })
    
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid, namespace: 'custom' })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Custom namespace note')
  })

  await t.test('ok:creates-fanout-structure-correctly', async () => {
    const { repo } = await makeFixture('test-writeNote-fanout')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    // Create multiple commits with different OID prefixes
    await repo.worktreeBackend?.write('file1.txt', 'content1')
    await add({ repo, filepath: 'file1.txt' })
    const commit1 = await commit({ repo, message: 'commit 1' })
    
    await repo.worktreeBackend?.write('file2.txt', 'content2')
    await add({ repo, filepath: 'file2.txt' })
    const commit2 = await commit({ repo, message: 'commit 2' })
    
    // Write notes for both (should create fanout structure)
    await writeNote({ gitBackend: repo.gitBackend, oid: commit1, note: 'Note 1' })
    await writeNote({ gitBackend: repo.gitBackend, oid: commit2, note: 'Note 2' })
    
    // Verify both notes can be read
    const note1 = await readNote({ gitBackend: repo.gitBackend, oid: commit1 })
    const note2 = await readNote({ gitBackend: repo.gitBackend, oid: commit2 })
    
    assert.ok(note1 !== null)
    assert.ok(note2 !== null)
  })
})

test('removeNote', async (t) => {
  await t.test('ok:removes-existing-note', async () => {
    const { repo } = await makeFixture('test-removeNote')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write a note
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'Test note' })
    
    // Remove the note
    const result = await removeNote({ gitBackend: repo.gitBackend, oid: commitOid })
    
    assert.ok(result !== null)
    
    // Verify note is gone
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.strictEqual(note, null)
  })

  await t.test('ok:returns-null-for-non-existent-note', async () => {
    const { repo } = await makeFixture('test-removeNote-nonexistent')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    const result = await removeNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.strictEqual(result, null)
  })

  await t.test('ok:removes-fanout2-tree-when-empty', async () => {
    const { repo } = await makeFixture('test-removeNote-fanout2')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write a note (creates fanout structure)
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'Test note' })
    
    // Remove the note (should remove empty fanout2 tree)
    await removeNote({ gitBackend: repo.gitBackend, oid: commitOid })
    
    // Verify note is gone
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.strictEqual(note, null)
  })

  await t.test('ok:removes-fanout1-tree-when-empty', async () => {
    const { repo } = await makeFixture('test-removeNote-fanout1')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write a note
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'Test note' })
    
    // Remove the note (should remove empty fanout1 tree too)
    await removeNote({ gitBackend: repo.gitBackend, oid: commitOid })
    
    // Verify note is gone
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid })
    assert.strictEqual(note, null)
  })

  await t.test('ok:deletes-notes-ref-when-tree-is-empty', async () => {
    const { repo } = await makeFixture('test-removeNote-empty-ref')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write a note
    await writeNote({ gitBackend: repo.gitBackend, oid: commitOid, note: 'Test note' })
    
    // Remove the note (should set ref to empty tree OID when tree is empty)
    const result = await removeNote({ gitBackend: repo.gitBackend, oid: commitOid })
    
    // When tree becomes empty, returns empty tree OID
    const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    assert.strictEqual(result, EMPTY_TREE_OID)
  })

  await t.test('ok:removes-note-from-custom-namespace', async () => {
    const { repo } = await makeFixture('test-removeNote-namespace')
    await init({ repo })
    await setConfig({ repo, path: 'user.name', value: 'Test User' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    await repo.worktreeBackend?.write('test.txt', 'content')
    await add({ repo, filepath: 'test.txt' })
    const commitOid = await commit({ repo, message: 'test commit' })
    
    // Write note in custom namespace
    await writeNote({ 
      gitBackend: repo.gitBackend, 
      oid: commitOid, 
      note: 'Custom note',
      namespace: 'custom'
    })
    
    // Remove from custom namespace
    await removeNote({ gitBackend: repo.gitBackend, oid: commitOid, namespace: 'custom' })
    
    // Verify note is gone
    const note = await readNote({ gitBackend: repo.gitBackend, oid: commitOid, namespace: 'custom' })
    assert.strictEqual(note, null)
  })

  await t.test('ok:handles-errors-gracefully-and-returns-null', async () => {
    const { repo } = await makeFixture('test-removeNote-error')
    
    const { GitBackendFs } = await import('@awesome-os/universal-git-src/backends/GitBackendFs/index.ts')
    const invalidBackend = new GitBackendFs(repo.gitBackend.getFs(), '/nonexistent/gitdir')
    const result = await removeNote({ 
      gitBackend: invalidBackend, 
      oid: '0000000000000000000000000000000000000000' 
    })
    
    assert.strictEqual(result, null)
  })
})

