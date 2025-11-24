import { test } from 'node:test'
import assert from 'node:assert'
import { readNote, getNotesRef } from '@awesome-os/universal-git-src/git/refs/notes/readNote.ts'
import { writeNote } from '@awesome-os/universal-git-src/git/refs/notes/writeNote.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { commit, add, init } from '@awesome-os/universal-git-src/index.ts'

test('getNotesRef', async (t) => {
  await t.test('ok:returns-default-notes-ref-for-commits', () => {
    const ref = getNotesRef()
    assert.strictEqual(ref, 'refs/notes/commits')
  })

  await t.test('ok:returns-notes-ref-for-custom-namespace', () => {
    const ref = getNotesRef('foobar')
    assert.strictEqual(ref, 'refs/notes/foobar')
  })
})

test('readNote', async (t) => {
  await t.test('ok:reads-existing-note', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-readNote')
    await init({ fs, dir, gitdir })
    
    // Create a commit
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write a note
    await writeNote({ fs, gitdir, oid: commitOid, note: 'This is a note' })
    
    // Read the note
    const note = await readNote({ fs, gitdir, oid: commitOid })
    
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'This is a note')
  })

  await t.test('ok:returns-null-for-non-existent-note', async () => {
    const { fs, gitdir } = await makeFixture('test-readNote')
    
    const note = await readNote({ 
      fs, 
      gitdir, 
      oid: '0000000000000000000000000000000000000000' 
    })
    
    assert.strictEqual(note, null)
  })

  await t.test('ok:returns-null-when-notes-ref-does-not-exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const note = await readNote({ 
      fs, 
      gitdir, 
      oid: '0000000000000000000000000000000000000000' 
    })
    
    assert.strictEqual(note, null)
  })

  await t.test('ok:reads-note-from-custom-namespace', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-readNote-namespace')
    await init({ fs, dir, gitdir })
    
    // Create a commit
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Write a note in custom namespace
    await writeNote({ 
      fs, 
      gitdir, 
      oid: commitOid, 
      note: 'Custom namespace note',
      namespace: 'custom'
    })
    
    // Read the note from custom namespace
    const note = await readNote({ 
      fs, 
      gitdir, 
      oid: commitOid,
      namespace: 'custom'
    })
    
    assert.ok(note !== null)
    assert.strictEqual(note.toString('utf8'), 'Custom namespace note')
  })

  await t.test('ok:handles-fanout-structure-correctly', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-readNote-fanout')
    await init({ fs, dir, gitdir })
    
    // Create multiple commits with different OID prefixes to test fanout
    await fs.write(`${dir}/file1.txt`, 'content1')
    await add({ fs, dir, gitdir, filepath: 'file1.txt' })
    const commit1 = await commit({ fs, dir, gitdir, message: 'commit 1' })
    
    await fs.write(`${dir}/file2.txt`, 'content2')
    await add({ fs, dir, gitdir, filepath: 'file2.txt' })
    const commit2 = await commit({ fs, dir, gitdir, message: 'commit 2' })
    
    // Write notes for both commits
    await writeNote({ fs, gitdir, oid: commit1, note: 'Note 1' })
    await writeNote({ fs, gitdir, oid: commit2, note: 'Note 2' })
    
    // Read both notes
    const note1 = await readNote({ fs, gitdir, oid: commit1 })
    const note2 = await readNote({ fs, gitdir, oid: commit2 })
    
    assert.ok(note1 !== null)
    assert.strictEqual(note1.toString('utf8'), 'Note 1')
    assert.ok(note2 !== null)
    assert.strictEqual(note2.toString('utf8'), 'Note 2')
  })

  await t.test('ok:returns-null-when-fanout1-entry-does-not-exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-readNote-missing-fanout1')
    await init({ fs, dir, gitdir })
    
    // Create a commit with a specific OID prefix
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Create notes tree with different fanout1
    await writeNote({ fs, gitdir, oid: 'aa' + '00'.repeat(19), note: 'other note' })
    
    // Try to read note with different fanout1
    const note = await readNote({ fs, gitdir, oid: commitOid })
    
    assert.strictEqual(note, null)
  })

  await t.test('ok:returns-null-when-fanout2-entry-does-not-exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-readNote-missing-fanout2')
    await init({ fs, dir, gitdir })
    
    // Create a commit
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'test commit' })
    
    // Get the fanout structure
    const fanout1 = commitOid.slice(0, 2)
    const fanout2 = commitOid.slice(2, 4)
    
    // Create a note with same fanout1 but different fanout2
    const otherOid = fanout1 + 'ff' + commitOid.slice(4)
    await writeNote({ fs, gitdir, oid: otherOid, note: 'other note' })
    
    // Try to read note with different fanout2
    const note = await readNote({ fs, gitdir, oid: commitOid })
    
    assert.strictEqual(note, null)
  })

  await t.test('ok:handles-errors-gracefully-and-returns-null', async () => {
    const { fs, gitdir } = await makeFixture('test-readNote-error')
    
    // Try to read from non-existent repository
    const note = await readNote({ 
      fs, 
      gitdir: '/nonexistent/gitdir', 
      oid: '0000000000000000000000000000000000000000' 
    })
    
    assert.strictEqual(note, null)
  })
})

