# Reflog Test Guidelines

**Status**: ✅ **COMPLETE** - Comprehensive guidelines for testing reflog functionality  
**Location**: `tests/helpers/REFLOG_TEST_GUIDELINES.md`  
**Related**: [Reflog Documentation](@awesome-os/universal-git-src/git/logs/README.md), [Reflog Helpers](./reflogHelpers.ts)

---

## 📋 Table of Contents

1. [When to Test Reflog](#when-to-test-reflog)
2. [Test Utilities](#test-utilities)
3. [Common Test Patterns](#common-test-patterns)
4. [Edge Cases to Test](#edge-cases-to-test)
5. [Best Practices](#best-practices)
6. [Examples](#examples)

---

## When to Test Reflog

### ✅ Always Test Reflog For

Operations that modify refs or HEAD:

- **`commit`** - Creates reflog entry with commit message
- **`branch`** - Creates reflog entry for branch creation
- **`checkout`** - Creates HEAD reflog entry (via `writeSymbolicRef`)
- **`reset`** - Creates reflog entry with reset message
- **`merge`** - Creates reflog entry for merge operations
- **`rebase`** - Creates start and finish reflog entries
- **`tag`** - Creates reflog entry for tag creation/deletion
- **`push`** - Creates reflog entry for remote ref updates
- **`fetch`** - Creates reflog entry for remote tracking ref updates

### ❌ Don't Test Reflog For

Operations that don't modify refs:

- **`add`** - Only modifies index, not refs
- **`status`** - Read-only operation
- **`log`** - Read-only operation
- **`diff`** - Read-only operation
- **`readObject`** - Read-only operation

---

## Test Utilities

### Import Helpers

```typescript
import { 
  verifyReflogEntry, 
  getHeadReflog,
  getReflog 
} from '../helpers/reflogHelpers.ts'
```

### `verifyReflogEntry`

Verifies a specific reflog entry exists with expected values.

**Signature**:
```typescript
await verifyReflogEntry({
  fs,
  gitdir,
  ref: 'refs/heads/main',
  expectedOldOid: 'abc123...',
  expectedNewOid: 'def456...',
  expectedMessage: 'commit: My commit',
  index: 0, // Most recent entry (0 = newest)
})
```

**Behavior**:
- Reads reflog entries (parsed)
- Reverses array so `index: 0` = newest entry (matching Git's `HEAD@{0}` syntax)
- Verifies entry exists at specified index
- Asserts `oldOid`, `newOid`, and `message` match expected values

**Example**:
```typescript
// Verify most recent commit created reflog entry
await verifyReflogEntry({
  fs,
  gitdir,
  ref: 'refs/heads/main',
  expectedOldOid: previousOid,
  expectedNewOid: commitOid,
  expectedMessage: 'Initial commit',
  index: 0, // Most recent
})
```

### `getHeadReflog`

Convenience helper to get HEAD reflog entries.

**Signature**:
```typescript
const headReflog = await getHeadReflog(fs, gitdir) as ReflogEntry[]
```

**Returns**: Array of `ReflogEntry` objects (chronological order, oldest first)

**Example**:
```typescript
const headReflog = await getHeadReflog(fs, gitdir)
const mostRecent = headReflog.reverse()[0] // HEAD@{0}
assert.strictEqual(mostRecent.message, 'checkout: moving from main to feature')
```

### `getReflog`

Generic helper to get reflog entries for any ref.

**Signature**:
```typescript
const reflog = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
```

**Returns**: Array of `ReflogEntry` objects (chronological order, oldest first)

**Example**:
```typescript
const branchReflog = await getReflog(fs, gitdir, 'refs/heads/feature') as ReflogEntry[]
assert.ok(branchReflog.length > 0, 'Reflog should have entries')
```

---

## Common Test Patterns

### Pattern 1: Verify Entry Exists

**Use Case**: Verify that a reflog entry was created for an operation.

```typescript
// Before operation
const oldOid = await resolveRef({ fs, gitdir, ref: 'refs/heads/main' })

// Perform operation
await commit({ fs, dir, gitdir, message: 'My commit', ... })

// Verify reflog entry
await verifyReflogEntry({
  fs,
  gitdir,
  ref: 'refs/heads/main',
  expectedOldOid: oldOid,
  expectedNewOid: commitOid,
  expectedMessage: 'My commit',
  index: 0,
})
```

### Pattern 2: Verify Multiple Entries

**Use Case**: Verify multiple operations created multiple reflog entries.

```typescript
// Perform multiple operations
await commit({ fs, dir, gitdir, message: 'First commit', ... })
await commit({ fs, dir, gitdir, message: 'Second commit', ... })

// Read reflog
const reflog = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
const reversed = [...reflog].reverse() // Newest first

// Verify most recent (index 0)
assert.strictEqual(reversed[0].message, 'Second commit')

// Verify previous (index 1)
assert.strictEqual(reversed[1].message, 'First commit')
```

### Pattern 3: Verify Entry Order

**Use Case**: Verify reflog entries are in correct chronological order.

```typescript
// Perform operations
const commit1Oid = await commit({ fs, dir, gitdir, message: 'First', ... })
const commit2Oid = await commit({ fs, dir, gitdir, message: 'Second', ... })

// Read reflog
const reflog = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
const reversed = [...reflog].reverse()

// Verify order (newest first)
assert.strictEqual(reversed[0].newOid, commit2Oid, 'Most recent should be commit2')
assert.strictEqual(reversed[1].newOid, commit1Oid, 'Previous should be commit1')
```

### Pattern 4: Verify Entry Content

**Use Case**: Verify reflog entry contains expected information.

```typescript
// Perform operation
await reset({ fs, dir, gitdir, ref: 'HEAD~1' })

// Read reflog
const reflog = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
const reversed = [...reflog].reverse()
const resetEntry = reversed[0]

// Verify content
assert.ok(resetEntry.message.includes('reset: moving to'), 'Should have reset message')
assert.strictEqual(resetEntry.oldOid, branchOidBeforeReset, 'Old OID should match')
assert.strictEqual(resetEntry.newOid, resetTargetOid, 'New OID should match')
assert.ok(resetEntry.author, 'Should have author')
assert.ok(resetEntry.timestamp > 0, 'Should have timestamp')
assert.ok(resetEntry.timezoneOffset, 'Should have timezone offset')
```

### Pattern 5: Verify No Entry (Reflog Disabled)

**Use Case**: Verify reflog entry is NOT created when reflog is disabled.

```typescript
// Disable reflog
await setConfig({ fs, gitdir, path: 'core.logAllRefUpdates', value: 'false' })

// Perform operation
await commit({ fs, dir, gitdir, message: 'My commit', ... })

// Verify no reflog entry
const reflog = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
assert.strictEqual(reflog.length, 0, 'Reflog should be empty when disabled')
```

### Pattern 6: Verify HEAD Reflog

**Use Case**: Verify HEAD reflog entries for checkout operations.

```typescript
// Perform checkout
await checkout({ fs, dir, gitdir, ref: 'feature' })

// Verify HEAD reflog
const headReflog = await getHeadReflog(fs, gitdir)
const reversed = [...headReflog].reverse()
const checkoutEntry = reversed[0]

assert.ok(checkoutEntry.message.includes('checkout: moving from'), 'Should have checkout message')
assert.ok(checkoutEntry.message.includes('main'), 'Should mention source branch')
assert.ok(checkoutEntry.message.includes('feature'), 'Should mention target branch')
```

---

## Edge Cases to Test

### 1. Empty Repository

**Scenario**: First commit in empty repository

**Test**:
```typescript
// Create first commit
const commitOid = await commit({ fs, dir, gitdir, message: 'Initial commit', ... })

// Verify reflog entry has zero OID for oldOid
await verifyReflogEntry({
  fs,
  gitdir,
  ref: 'refs/heads/main',
  expectedOldOid: '0000000000000000000000000000000000000000',
  expectedNewOid: commitOid,
  expectedMessage: 'Initial commit',
  index: 0,
})
```

### 2. Reflog Disabled

**Scenario**: `core.logAllRefUpdates = false`

**Test**:
```typescript
await setConfig({ fs, gitdir, path: 'core.logAllRefUpdates', value: 'false' })
await commit({ fs, dir, gitdir, message: 'My commit', ... })

const reflog = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
assert.strictEqual(reflog.length, 0, 'Reflog should be empty')
```

### 3. Same OID (No Change)

**Scenario**: Operation that doesn't actually change the ref

**Test**:
```typescript
const currentOid = await resolveRef({ fs, gitdir, ref: 'refs/heads/main' })

// Attempt to reset to same commit (no-op)
await reset({ fs, dir, gitdir, ref: currentOid })

// Verify no new reflog entry (logRefUpdate returns early if oldOid === newOid)
const reflogBefore = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
await reset({ fs, dir, gitdir, ref: currentOid })
const reflogAfter = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
assert.strictEqual(reflogAfter.length, reflogBefore.length, 'No new entry for no-op')
```

### 4. Multiple Entries with Same OIDs

**Scenario**: Multiple operations with same OIDs but different messages

**Test**:
```typescript
// writeRef creates automatic entry
await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: commitOid })

// Command adds descriptive entry
await logRefUpdate({
  fs,
  gitdir,
  ref: 'refs/heads/main',
  oldOid: previousOid,
  newOid: commitOid,
  message: 'commit: My commit',
})

// Verify both entries exist
const reflog = await getReflog(fs, gitdir, 'refs/heads/main') as ReflogEntry[]
const reversed = [...reflog].reverse()
assert.ok(reversed[0].message.includes('My commit'), 'Should have descriptive entry')
assert.ok(reversed[1].message.includes('update by writeRef'), 'Should have automatic entry')
```

### 5. Branch Creation

**Scenario**: Creating a new branch

**Test**:
```typescript
// Create branch
await branch({ fs, dir, gitdir, ref: 'feature', checkout: true })

// Verify reflog entry
await verifyReflogEntry({
  fs,
  gitdir,
  ref: 'refs/heads/feature',
  expectedOldOid: '0000000000000000000000000000000000000000', // New branch
  expectedNewOid: currentOid,
  expectedMessage: 'branch: Created from HEAD',
  index: 0,
})
```

### 6. Reflog for Remote Refs

**Scenario**: Push/fetch operations update remote tracking refs

**Test**:
```typescript
// Perform push
await push({ fs, dir, gitdir, remote: 'origin', ref: 'main', ... })

// Verify remote tracking ref reflog
await verifyReflogEntry({
  fs,
  gitdir,
  ref: 'refs/remotes/origin/main',
  expectedOldOid: previousOid,
  expectedNewOid: pushedOid,
  expectedMessage: 'update by push',
  index: 0,
})
```

---

## Best Practices

### ✅ Do

1. **Use Helper Functions**: Always use `verifyReflogEntry`, `getHeadReflog`, etc.
2. **Test Both OIDs and Messages**: Verify both `oldOid`/`newOid` and `message`
3. **Test Entry Order**: Verify entries are in correct chronological order
4. **Test Edge Cases**: Empty repo, disabled reflog, no-op operations
5. **Use Full Ref Paths**: Always use full ref paths (e.g., `refs/heads/main`, not `main`)
6. **Handle Optional Reflog**: Some environments may have reflog disabled

### ❌ Don't

1. **Don't Test Read-Only Operations**: Don't test reflog for `status`, `log`, `diff`, etc.
2. **Don't Rely on Fixed Indices**: Use `find` or `verifyReflogEntry` instead of `reflog[0]`
3. **Don't Assume Reflog is Enabled**: Check if reflog exists before asserting
4. **Don't Test Internal Implementation**: Test behavior, not implementation details
5. **Don't Mutate Reflog Arrays**: Use `[...reflog].reverse()` instead of `reflog.reverse()`

---

## Examples

### Example 1: Commit Test

```typescript
await t.test('commit creates reflog entry', async () => {
  const { fs, dir, gitdir } = await makeFixture('test-branch')
  const cache = {}
  
  // Get initial state
  const branchName = await currentBranch({ fs, dir, gitdir }) || 'main'
  const fullRef = `refs/heads/${branchName}`
  const oldOid = await resolveRef({ fs, gitdir, ref: fullRef })
  
  // Make commit
  await fs.write(`${dir}/file.txt`, 'content')
  await add({ fs, dir, gitdir, filepath: 'file.txt', cache })
  const commitOid = await commit({
    fs,
    dir,
    gitdir,
    message: 'My commit',
    author: { name: 'Test', email: 'test@example.com' },
    cache,
  })
  
  // Verify reflog entry
  await verifyReflogEntry({
    fs,
    gitdir,
    ref: fullRef,
    expectedOldOid: oldOid,
    expectedNewOid: commitOid,
    expectedMessage: 'My commit',
    index: 0,
  })
})
```

### Example 2: Reset Test

```typescript
await t.test('reset creates reflog entry', async () => {
  const { fs, dir, gitdir } = await makeFixture('test-branch')
  
  // Get initial state
  const branchName = await currentBranch({ fs, dir, gitdir }) || 'main'
  const fullRef = `refs/heads/${branchName}`
  const currentOid = await resolveRef({ fs, gitdir, ref: fullRef })
  
  // Get previous commit
  const previousOid = await resolveRef({ fs, gitdir, ref: 'HEAD~1' })
  
  // Perform reset
  await reset({ fs, dir, gitdir, ref: 'HEAD~1' })
  
  // Verify reflog entry
  await verifyReflogEntry({
    fs,
    gitdir,
    ref: fullRef,
    expectedOldOid: currentOid,
    expectedNewOid: previousOid,
    expectedMessage: 'reset: moving to HEAD~1',
    index: 0,
  })
})
```

### Example 3: Rebase Test

```typescript
await t.test('rebase creates start and finish reflog entries', async () => {
  const { fs, dir, gitdir } = await makeFixture('test-branch')
  const cache = {}
  
  // Setup branches
  const branchName = await currentBranch({ fs, dir, gitdir }) || 'main'
  const fullRef = `refs/heads/${branchName}`
  
  // Create upstream branch
  await branch({ fs, dir, gitdir, ref: 'upstream', checkout: true })
  await commit({ fs, dir, gitdir, message: 'Upstream commit', ... })
  
  // Switch back and make feature commit
  await checkout({ fs, dir, gitdir, ref: branchName })
  await commit({ fs, dir, gitdir, message: 'Feature commit', ... })
  
  const branchOidBeforeRebase = await resolveRef({ fs, gitdir, ref: fullRef })
  
  // Perform rebase
  await rebase({ fs, dir, gitdir, upstream: 'upstream', branch: branchName, cache })
  
  // Read reflog
  const reflog = await getReflog(fs, gitdir, fullRef) as ReflogEntry[]
  const reversed = [...reflog].reverse()
  
  // Find rebase start entry
  const startEntry = reversed.find(entry => 
    entry.message.includes('rebase: rebasing onto')
  )
  assert.ok(startEntry, 'Should have rebase start entry')
  assert.strictEqual(startEntry.oldOid, branchOidBeforeRebase, 'Old OID should match')
  
  // Find rebase finish entry
  const finishEntry = reversed.find(entry => 
    entry.message.includes('rebase finished: returning to')
  )
  assert.ok(finishEntry, 'Should have rebase finish entry')
})
```

---

## References

- [Reflog Documentation](@awesome-os/universal-git-src/git/logs/README.md) - Complete reflog API documentation
- [Reflog Helpers](./reflogHelpers.ts) - Test utility functions
- [Reflog Unification Plan](../../REFLOG_UNIFICATION_PLAN.md) - Implementation plan

---

**Last Updated**: 2025-01-XX  
**Status**: ✅ Complete

