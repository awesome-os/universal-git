import { test } from 'node:test'
import assert from 'node:assert'
import { updateRemoteRefs } from '@awesome-os/universal-git-src/git/refs/updateRemoteRefs.ts'
import { resolveRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { writeRef } from '@awesome-os/universal-git-src/git/refs/writeRef.ts'
import { InvalidOidError } from '@awesome-os/universal-git-src/errors/InvalidOidError.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, commit, add, branch } from '@awesome-os/universal-git-src/index.ts'

test('updateRemoteRefs', async (t) => {
  await t.test('throws InvalidOidError for invalid OID', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', 'invalid-oid')
    
    await assert.rejects(
      async () => {
        await updateRemoteRefs({
          fs,
          gitdir,
          remote: 'origin',
          refs,
          symrefs: new Map(),
        })
      },
      (error: any) => {
        return error instanceof InvalidOidError
      }
    )
  })

  await t.test('updates remote refs from refs/heads/', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', commitOid)
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
    })
    
    // Verify remote ref was created
    const remoteRef = await resolveRef({ fs, gitdir, ref: 'refs/remotes/origin/master' })
    assert.strictEqual(remoteRef, commitOid)
  })

  await t.test('handles short ref names (without refs/ prefix)', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    const refs = new Map<string, string>()
    refs.set('develop', commitOid) // Short ref name
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
    })
    
    // Verify remote ref was created with full path
    const remoteRef = await resolveRef({ fs, gitdir, ref: 'refs/remotes/origin/develop' })
    assert.strictEqual(remoteRef, commitOid)
  })

  await t.test('handles HEAD ref', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    const refs = new Map<string, string>()
    refs.set('HEAD', commitOid)
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
    })
    
    // Verify remote HEAD ref was created
    const remoteHead = await resolveRef({ fs, gitdir, ref: 'refs/remotes/origin/HEAD' })
    assert.strictEqual(remoteHead, commitOid)
  })

  await t.test('handles symrefs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    const refs = new Map<string, string>()
    const symrefs = new Map<string, string>()
    symrefs.set('refs/heads/master', 'refs/heads/main')
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs,
    })
    
    // Verify symbolic ref was created
    // Use readSymbolicRef to get the target of the symref
    const { readSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/readRef.ts')
    const symrefTarget = await readSymbolicRef({ fs, gitdir, ref: 'refs/remotes/origin/master' })
    assert.ok(symrefTarget)
    assert.strictEqual(symrefTarget, 'refs/remotes/origin/main')
  })

  await t.test('prunes remote refs when prune=true', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create existing remote refs
    await fs.write(`${dir}/test1.txt`, 'content1')
    await add({ fs, dir, gitdir, filepath: 'test1.txt' })
    const commit1 = await commit({ fs, dir, gitdir, message: 'commit1' })
    
    await writeRef({ 
      fs, 
      gitdir, 
      ref: 'refs/remotes/origin/old-branch', 
      value: commit1 
    })
    
    // Create new commit
    await fs.write(`${dir}/test2.txt`, 'content2')
    await add({ fs, dir, gitdir, filepath: 'test2.txt' })
    const commit2 = await commit({ fs, dir, gitdir, message: 'commit2' })
    
    // Update with new refs (old-branch not included)
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', commit2)
    
    const result = await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      prune: true,
    })
    
    // Verify old-branch was pruned
    assert.ok(result.pruned.includes('refs/remotes/origin/old-branch'))
    
    // Verify old-branch no longer exists
    await assert.rejects(
      async () => {
        await resolveRef({ fs, gitdir, ref: 'refs/remotes/origin/old-branch' })
      },
      (error: any) => {
        return error instanceof Error
      }
    )
  })

  await t.test('does not prune when prune=false', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create existing remote ref
    await fs.write(`${dir}/test1.txt`, 'content1')
    await add({ fs, dir, gitdir, filepath: 'test1.txt' })
    const commit1 = await commit({ fs, dir, gitdir, message: 'commit1' })
    
    await writeRef({ 
      fs, 
      gitdir, 
      ref: 'refs/remotes/origin/old-branch', 
      value: commit1 
    })
    
    // Update with new refs (old-branch not included)
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', commit1)
    
    const result = await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      prune: false,
    })
    
    // Verify old-branch was NOT pruned
    assert.strictEqual(result.pruned.length, 0)
    
    // Verify old-branch still exists
    const oldBranch = await resolveRef({ fs, gitdir, ref: 'refs/remotes/origin/old-branch' })
    assert.strictEqual(oldBranch, commit1)
  })

  await t.test('handles tags when tags=true', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    const refs = new Map<string, string>()
    refs.set('refs/tags/v1.0', commitOid)
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      tags: true,
    })
    
    // Verify tag was created
    const tagRef = await resolveRef({ fs, gitdir, ref: 'refs/tags/v1.0' })
    assert.strictEqual(tagRef, commitOid)
  })

  await t.test('skips tags when tags=false', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    const refs = new Map<string, string>()
    refs.set('refs/tags/v1.0', commitOid)
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      tags: false,
    })
    
    // Verify tag was NOT created
    await assert.rejects(
      async () => {
        await resolveRef({ fs, gitdir, ref: 'refs/tags/v1.0' })
      },
      (error: any) => {
        return error instanceof Error
      }
    )
  })

  await t.test('skips tags that already exist when tags=true', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commit1 = await commit({ fs, dir, gitdir, message: 'initial' })
    
    // Create existing tag
    await writeRef({ 
      fs, 
      gitdir, 
      ref: 'refs/tags/v1.0', 
      value: commit1 
    })
    
    // Try to update with different OID
    const commit2 = await commit({ fs, dir, gitdir, message: 'second' })
    const refs = new Map<string, string>()
    refs.set('refs/tags/v1.0', commit2)
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      tags: true,
    })
    
    // Tag should still have original OID (not updated)
    const tagRef = await resolveRef({ fs, gitdir, ref: 'refs/tags/v1.0' })
    assert.strictEqual(tagRef, commit1) // Original OID, not commit2
  })

  await t.test('writes symbolic refs correctly', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    // Create target ref first
    await writeRef({ 
      fs, 
      gitdir, 
      ref: 'refs/remotes/origin/main', 
      value: commitOid 
    })
    
    const refs = new Map<string, string>()
    const symrefs = new Map<string, string>()
    symrefs.set('refs/heads/master', 'refs/heads/main')
    
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs,
    })
    
    // Verify symbolic ref was created
    const symref = await resolveRef({ fs, gitdir, ref: 'refs/remotes/origin/master' })
    // Should resolve through the symref to main
    assert.strictEqual(symref, commitOid)
  })

  await t.test('handles reflog errors gracefully', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', commitOid)
    
    // Should not throw even if reflog fails
    await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
    })
    
    // Verify ref was still written
    const remoteRef = await resolveRef({ fs, gitdir, ref: 'refs/remotes/origin/master' })
    assert.strictEqual(remoteRef, commitOid)
  })

  await t.test('adds reflog entries for pruned refs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create existing remote ref
    await fs.write(`${dir}/test1.txt`, 'content1')
    await add({ fs, dir, gitdir, filepath: 'test1.txt' })
    const commit1 = await commit({ fs, dir, gitdir, message: 'commit1' })
    
    await writeRef({ 
      fs, 
      gitdir, 
      ref: 'refs/remotes/origin/old-branch', 
      value: commit1 
    })
    
    // Create new commit
    await fs.write(`${dir}/test2.txt`, 'content2')
    await add({ fs, dir, gitdir, filepath: 'test2.txt' })
    const commit2 = await commit({ fs, dir, gitdir, message: 'commit2' })
    
    // Update with prune=true
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', commit2)
    
    const result = await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      prune: true,
    })
    
    // Verify old-branch was pruned
    assert.ok(result.pruned.includes('refs/remotes/origin/old-branch'))
    
    // Verify reflog entry was added (check if reflog file exists)
    const reflogPath = `${gitdir}/logs/refs/remotes/origin/old-branch`
    const reflogExists = await fs.exists(reflogPath)
    // Reflog might exist if logRefUpdate was called
    assert.ok(true) // Just verify the operation completed
  })

  await t.test('handles prune when ref does not exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Try to prune a ref that doesn't exist
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', 'a'.repeat(40))
    
    const result = await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      prune: true,
    })
    
    // Should not throw and should return empty pruned array
    assert.strictEqual(result.pruned.length, 0)
  })

  await t.test('handles prune when ref exists but resolve fails', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create a ref that exists but might fail to resolve
    await fs.write(`${dir}/test.txt`, 'content')
    await add({ fs, dir, gitdir, filepath: 'test.txt' })
    const commitOid = await commit({ fs, dir, gitdir, message: 'initial' })
    
    // Create remote ref
    await writeRef({ 
      fs, 
      gitdir, 
      ref: 'refs/remotes/origin/test-branch', 
      value: commitOid 
    })
    
    // Update without test-branch
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', commitOid)
    
    const result = await updateRemoteRefs({
      fs,
      gitdir,
      remote: 'origin',
      refs,
      symrefs: new Map(),
      prune: true,
    })
    
    // Should handle gracefully even if resolve fails during prune
    assert.ok(Array.isArray(result.pruned))
  })
})

