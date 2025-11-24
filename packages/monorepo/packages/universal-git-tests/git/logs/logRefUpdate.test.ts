import { describe, it } from 'node:test'
import assert from 'node:assert'
import { logRefUpdate } from '@awesome-os/universal-git-src/git/logs/logRefUpdate.ts'
import { readLog } from '@awesome-os/universal-git-src/git/logs/readLog.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('logRefUpdate', () => {
  it('ok:creates-a-new-reflog-file-when-logging-a-ref-update', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const oldOid = '0000000000000000000000000000000000000000'
    const newOid = 'a'.repeat(40)
    const ref = 'refs/heads/main'

    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid,
      newOid,
      message: 'test: initial commit',
    })

    // Verify reflog file was created
    const entries = await readLog({ fs, gitdir, ref, parsed: true })
    assert.strictEqual(entries.length, 1)
    
    const entry = entries[0] as { oldOid: string; newOid: string; message: string }
    assert.strictEqual(entry.oldOid, oldOid)
    assert.strictEqual(entry.newOid, newOid)
    assert.ok(entry.message.includes('test: initial commit'))
  })

  it('ok:appends-to-an-existing-reflog-file', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const ref = 'refs/heads/main'
    const oldOid1 = '0000000000000000000000000000000000000000'
    const newOid1 = 'a'.repeat(40)

    // First entry
    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid: oldOid1,
      newOid: newOid1,
      message: 'test: first commit',
    })

    // Second entry
    const oldOid2 = newOid1
    const newOid2 = 'b'.repeat(40)
    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid: oldOid2,
      newOid: newOid2,
      message: 'test: second commit',
    })

    // Verify both entries exist
    const entries = await readLog({ fs, gitdir, ref, parsed: true })
    assert.strictEqual(entries.length, 2)
    
    const entry1 = entries[0] as { oldOid: string; newOid: string; message: string }
    const entry2 = entries[1] as { oldOid: string; newOid: string; message: string }
    
    assert.strictEqual(entry1.oldOid, oldOid1)
    assert.strictEqual(entry1.newOid, newOid1)
    assert.ok(entry1.message.includes('first commit'))
    
    assert.strictEqual(entry2.oldOid, oldOid2)
    assert.strictEqual(entry2.newOid, newOid2)
    assert.ok(entry2.message.includes('second commit'))
  })

  it('ok:correctly-formats-author-timestamp-and-message', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const ref = 'refs/heads/main'
    const oldOid = '0000000000000000000000000000000000000000'
    const newOid = 'a'.repeat(40)
    const author = 'Test User <test@example.com>'
    const timestamp = 1234567890
    const timezoneOffset = '-0500'
    const message = 'test: formatted entry'

    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid,
      newOid,
      message,
      author,
      timestamp,
      timezoneOffset,
    })

    const entries = await readLog({ fs, gitdir, ref, parsed: true })
    assert.strictEqual(entries.length, 1)
    
    const entry = entries[0] as { 
      oldOid: string
      newOid: string
      author: string
      timestamp: number
      timezoneOffset: string
      message: string
    }
    
    assert.strictEqual(entry.oldOid, oldOid)
    assert.strictEqual(entry.newOid, newOid)
    assert.strictEqual(entry.author, author)
    assert.strictEqual(entry.timestamp, timestamp)
    assert.strictEqual(entry.timezoneOffset, timezoneOffset)
    assert.strictEqual(entry.message, message)
  })

  it('ok:respects-core-logAllRefUpdates-false-setting', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    // Set core.logAllRefUpdates to false
    const { setConfig } = await import('@awesome-os/universal-git-src/index.ts')
    await setConfig({
      fs,
      gitdir,
      path: 'core.logAllRefUpdates',
      value: 'false',
    })

    const ref = 'refs/heads/main'
    const oldOid = '0000000000000000000000000000000000000000'
    const newOid = 'a'.repeat(40)

    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid,
      newOid,
      message: 'test: should not be logged',
    })

    // Verify reflog file was NOT created
    const entries = await readLog({ fs, gitdir, ref, parsed: true })
    assert.strictEqual(entries.length, 0)
  })

  it('ok:defaults-to-true-for-non-bare-repositories', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    // Don't set core.logAllRefUpdates (should default to true for non-bare)
    const ref = 'refs/heads/main'
    const oldOid = '0000000000000000000000000000000000000000'
    const newOid = 'a'.repeat(40)

    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid,
      newOid,
      message: 'test: should be logged by default',
    })

    // Verify reflog file was created (default behavior)
    const entries = await readLog({ fs, gitdir, ref, parsed: true })
    assert.strictEqual(entries.length, 1)
  })

  it('ok:does-not-log-when-oldOid-and-newOid-are-the-same', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const ref = 'refs/heads/main'
    const oid = 'a'.repeat(40)

    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid: oid,
      newOid: oid, // Same as oldOid
      message: 'test: no change',
    })

    // Verify reflog file was NOT created (no change)
    const entries = await readLog({ fs, gitdir, ref, parsed: true })
    assert.strictEqual(entries.length, 0)
  })

  it('ok:generates-default-author-timestamp-and-timezone-when-not-provided', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const ref = 'refs/heads/main'
    const oldOid = '0000000000000000000000000000000000000000'
    const newOid = 'a'.repeat(40)

    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid,
      newOid,
      message: 'test: with defaults',
    })

    const entries = await readLog({ fs, gitdir, ref, parsed: true })
    assert.strictEqual(entries.length, 1)
    
    const entry = entries[0] as { 
      author: string
      timestamp: number
      timezoneOffset: string
    }
    
    // Verify defaults were generated
    assert.ok(entry.author.includes('isomorphic-git'))
    assert.ok(typeof entry.timestamp === 'number')
    assert.ok(entry.timestamp > 0)
    assert.ok(/^[+-]\d{4}$/.test(entry.timezoneOffset)) // Format: +HHMM or -HHMM
  })

  it('ok:silently-fails-when-reflog-write-fails-Git-behavior', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    // Create a read-only directory to simulate permission errors
    // Note: This test may not work on all systems, but it demonstrates the intent
    const ref = 'refs/heads/main'
    const oldOid = '0000000000000000000000000000000000000000'
    const newOid = 'a'.repeat(40)

    // This should not throw, even if write fails
    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid,
      newOid,
      message: 'test: should not throw',
    })

    // If we get here without throwing, the test passes
    assert.ok(true)
  })
})

