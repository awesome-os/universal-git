import assert from 'node:assert'
// readLog is not exported from main package, use relative path to source
import { readLog, type ReflogEntry } from '@awesome-os/universal-git-src/git/logs/readLog.ts'
// FileSystemProvider is not exported as subpath, use relative path
import type { FileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'

/**
 * Verify reflog entry exists and matches expected values
 * 
 * @param index - Index of entry to verify (0 = most recent, matching Git's HEAD@{0} syntax)
 */
export async function verifyReflogEntry({
  fs,
  gitdir,
  ref,
  expectedOldOid,
  expectedNewOid,
  expectedMessage,
  index = 0, // 0 = most recent entry (HEAD@{0})
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  expectedOldOid?: string
  expectedNewOid?: string
  expectedMessage?: string | RegExp
  index?: number
}): Promise<ReflogEntry> {
  const entries = (await readLog({ fs, gitdir, ref, parsed: true })) as ReflogEntry[]
  
  // Reverse array so index 0 is the most recent entry (matching Git's HEAD@{0} syntax)
  const reversedEntries = [...entries].reverse()
  
  assert.ok(reversedEntries.length > index, `Reflog should have at least ${index + 1} entries`)
  
  const entry = reversedEntries[index] // Now index 0 is most recent
  
  if (expectedOldOid) {
    assert.strictEqual(entry.oldOid, expectedOldOid, `Reflog entry ${index} oldOid should match`)
  }
  
  if (expectedNewOid) {
    assert.strictEqual(entry.newOid, expectedNewOid, `Reflog entry ${index} newOid should match`)
  }
  
  if (expectedMessage) {
    if (typeof expectedMessage === 'string') {
      assert.ok(entry.message.includes(expectedMessage), `Reflog entry ${index} message should contain "${expectedMessage}"`)
    } else {
      assert.ok(expectedMessage.test(entry.message), `Reflog entry ${index} message should match pattern`)
    }
  }
  
  return entry
}

/**
 * Get the most recent reflog entry for a ref
 */
export async function getLatestReflogEntry({
  fs,
  gitdir,
  ref,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
}): Promise<ReflogEntry | null> {
  const entries = (await readLog({ fs, gitdir, ref, parsed: true })) as ReflogEntry[]
  return entries.length > 0 ? entries[entries.length - 1] : null
}

/**
 * Get HEAD reflog entries (common case helper)
 */
export async function getHeadReflog({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<ReflogEntry[]> {
  return (await readLog({ fs, gitdir, ref: 'HEAD', parsed: true })) as ReflogEntry[]
}

/**
 * Verify reflog entry count
 */
export async function verifyReflogCount({
  fs,
  gitdir,
  ref,
  expectedCount,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  expectedCount: number
}): Promise<void> {
  const entries = (await readLog({ fs, gitdir, ref, parsed: true })) as ReflogEntry[]
  assert.strictEqual(entries.length, expectedCount, `Reflog should have ${expectedCount} entries`)
}

