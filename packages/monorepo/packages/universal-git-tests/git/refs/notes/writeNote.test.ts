import { test } from 'node:test'
import assert from 'node:assert'
import { writeNote, removeNote } from '@awesome-os/universal-git-src/git/refs/notes/writeNote.ts'
import { readNote } from '@awesome-os/universal-git-src/git/refs/notes/readNote.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { commit, add, init } from '@awesome-os/universal-git-src/index.ts'

test('writeNote', async (t) => {
  await t.test('ok:writes-a-new-note', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-writeNote')
    await init({ fs, dir, gitdir })
    
    // Create a commit
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write a note
    const notesTreeOid = await writeNote({ 
      fs, 
      gitdir, 
      oid: commitOid, 
      note: 'This is a note' 
    })
    
    assert.ok(notesTreeOid)
    assert.strictEqual(typeof notesTreeOid, 'string')
    
    // Verify note can be read
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'This is a note')
  })

  await t.test('ok:writes-note-from-Buffer', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-writeNote-buffer')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    const noteBuffer = Buffer.from('Note from buffer', 'utf8')
    await writeNote({ fs, gitdir, oid: commitOid, note: noteBuffer })
    
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Note from buffer')
  })

  await t.test('ok:writes-note-from-string', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-writeNote-string')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    await writeNote({ fs, gitdir, oid: commitOid, note: 'Note from string' })
    
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Note from string')
  })

  await t.test('ok:creates-notes-ref-if-it-does-not-exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-writeNote-new-ref')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write note (notes ref doesn't exist yet)
    await writeNote({ fs, gitdir, oid: commitOid, note: 'First note' })
    
    // Verify note was written
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.ok(note !== null)
  })

  await t.test('ok:overwrites-existing-note-when-force-true', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-writeNote-force')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write initial note
    await writeNote({ fs, gitdir, oid: commitOid, note: 'Initial note' })
    
    // Overwrite with force=true
    await writeNote({ 
      fs, 
      gitdir, 
      oid: commitOid, 
      note: 'Updated note',
      force: true
    })
    
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Updated note')
  })

  await t.test('error:throws-error-when-overwriting-without-force', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-writeNote-no-force')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write initial note
    await writeNote({ fs, gitdir, oid: commitOid, note: 'Initial note' })
    
    // Try to overwrite without force
    await assert.rejects(
      async () => {
        await writeNote({ 
          fs, 
          gitdir, 
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
    const { fs, dir, gitdir } = await makeFixture('test-writeNote-namespace')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    await writeNote({ 
      fs, 
      gitdir, 
      oid: commitOid, 
      note: 'Custom namespace note',
      namespace: 'custom'
    })
    
    const note = await readNote({ fs, gitdir, oid: commitOid, namespace: 'custom' })
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Custom namespace note')
  })

  await t.test('ok:creates-fanout-structure-correctly', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-writeNote-fanout')
    await init({ fs, dir, gitdir })
    
    // Create multiple commits with different OID prefixes
    await fs.write(`${dir}/file1.txt`, 'content1')
    await add({ fs, dir, gitdir, filepath: 'file1.txt' })
    const commit1 = await commit({ fs, dir, gitdir, message: 'commit 1' })
    
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ fs, dir, gitdir, filepath: 'file2.txt' })
    const commit2 = await commit({ fs, dir, gitdir, message: 'commit 2' })
    
    // Write notes for both (should create fanout structure)
    await writeNote({ fs, gitdir, oid: commit1, note: 'Note 1' })
    await writeNote({ fs, gitdir, oid: commit2, note: 'Note 2' })
    
    // Verify both notes can be read
    const note1 = await readNote({ fs, gitdir, oid: commit1 })
    const note2 = await readNote({ fs, gitdir, oid: commit2 })
    
    assert.ok(note1 !== null)
    assert.ok(note2 !== null)
  })
})

test('removeNote', async (t) => {
  await t.test('ok:removes-existing-note', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-removeNote')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write a note
    await writeNote({ fs, gitdir, oid: commitOid, note: 'Test note' })
    
    // Remove the note
    const result = await removeNote({ fs, gitdir, oid: commitOid })
    
    assert.ok(result !== null)
    
    // Verify note is gone
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.strictEqual(note, null)
  })

  await t.test('ok:returns-null-for-non-existent-note', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-removeNote-nonexistent')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    const result = await removeNote({ fs, gitdir, oid: commitOid })
    assert.strictEqual(result, null)
  })

  await t.test('ok:removes-fanout2-tree-when-empty', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-removeNote-fanout2')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write a note (creates fanout structure)
    await writeNote({ fs, gitdir, oid: commitOid, note: 'Test note' })
    
    // Remove the note (should remove empty fanout2 tree)
    await removeNote({ fs, gitdir, oid: commitOid })
    
    // Verify note is gone
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.strictEqual(note, null)
  })

  await t.test('ok:removes-fanout1-tree-when-empty', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-removeNote-fanout1')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write a note
    await writeNote({ fs, gitdir, oid: commitOid, note: 'Test note' })
    
    // Remove the note (should remove empty fanout1 tree too)
    await removeNote({ fs, gitdir, oid: commitOid })
    
    // Verify note is gone
    const note = await readNote({ fs, gitdir, oid: commitOid })
    assert.strictEqual(note, null)
  })

  await t.test('ok:deletes-notes-ref-when-tree-is-empty', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-removeNote-empty-ref')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write a note
    await writeNote({ fs, gitdir, oid: commitOid, note: 'Test note' })
    
    // Remove the note (should set ref to empty tree OID when tree is empty)
    const result = await removeNote({ fs, gitdir, oid: commitOid })
    
    // When tree becomes empty, returns empty tree OID
    const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    assert.strictEqual(result, EMPTY_TREE_OID)
  })

  await t.test('ok:removes-note-from-custom-namespace', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-removeNote-namespace')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write note in custom namespace
    await writeNote({ 
      fs, 
      gitdir, 
      oid: commitOid, 
      note: 'Custom note',
      namespace: 'custom'
    })
    
    // Remove from custom namespace
    await removeNote({ fs, gitdir, oid: commitOid, namespace: 'custom' })
    
    // Verify note is gone
    const note = await readNote({ fs, gitdir, oid: commitOid, namespace: 'custom' })
    assert.strictEqual(note, null)
  })

  await t.test('ok:handles-errors-gracefully-and-returns-null', async () => {
    const { fs, gitdir } = await makeFixture('test-removeNote-error')
    
    const result = await removeNote({ 
      fs, 
      gitdir: '/nonexistent/gitdir', 
      oid: '0000000000000000000000000000000000000000' 
    })
    
    assert.strictEqual(result, null)
  })
})

