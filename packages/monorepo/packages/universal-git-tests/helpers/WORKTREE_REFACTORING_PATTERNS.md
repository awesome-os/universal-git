# Worktree Refactoring Patterns

**Status**: ✅ **IN USE**  
**Purpose**: Document patterns and best practices for refactoring tests to use worktrees  
**Created**: 2025-01-XX  
**Last Updated**: 2025-01-XX

---

## 🎯 Overview

This document captures the patterns, best practices, and lessons learned from refactoring tests to use worktrees instead of branch switching. These patterns ensure reliable, fast, and well-isolated tests.

---

## 📋 Core Patterns

### Pattern 1: Basic Worktree Setup and Cleanup

**Use Case**: Replace multiple `checkout` calls with a single worktree.

**Before**:
```typescript
const { fs, dir, gitdir } = await makeFixture('test-checkout')
await branch({ fs, dir, gitdir, ref: 'other', checkout: true })
await checkout({ fs, dir, gitdir, ref: 'test-branch' })
// ... work on test-branch ...
await checkout({ fs, dir, gitdir, ref: 'other' })
await checkout({ fs, dir, gitdir, ref: 'test-branch' })
```

**After**:
```typescript
const { fs, dir, gitdir } = await makeFixture('test-checkout')
await branch({ fs, dir, gitdir, ref: 'other', checkout: false })
const worktreePath = createWorktreePath(dir, 'test-branch-worktree')

try {
  await worktree({ fs, dir, gitdir, add: true, path: worktreePath, ref: 'test-branch' })
  // ... work on test-branch in worktree ...
} finally {
  await cleanupWorktrees(fs, dir, gitdir)
}
```

**Key Points**:
- Use `createWorktreePath()` to generate unique worktree paths
- Always use `try...finally` with `cleanupWorktrees()` for test isolation
- Create branches with `checkout: false` when using worktrees

---

### Pattern 2: Committing in Worktrees (Critical: Symbolic HEAD)

**Use Case**: Making commits in a worktree that should update a branch ref.

**⚠️ CRITICAL**: When creating a worktree for a branch and you plan to commit, you **must** set the worktree's HEAD as a symbolic ref pointing to the branch. Otherwise, commits will only update the worktree's detached HEAD, not the branch ref.

**Recommended Pattern (Using Helper)**:
```typescript
import { commitInWorktree, createWorktreePath } from '../helpers/worktreeHelpers.ts'

// Create worktree
const worktreePath = createWorktreePath(dir, 'test-branch-worktree')
await worktree({ fs, dir, gitdir, add: true, path: worktreePath, ref: 'test-branch' })

// Use the helper - it handles symbolic HEAD setup automatically
const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
const repo = await Repository.open({ fs, dir, gitdir, cache })
await add({ fs, dir: worktreePath, gitdir, filepath: 'file.txt' })
const commitOid = await commitInWorktree({
  repo,
  worktreePath,
  message: 'add file',
  author: { name: 'Test', email: 'test@example.com' },
  branch: 'test-branch', // Optional - will be auto-detected
})
```

**Manual Pattern (If Helper Doesn't Fit)**:
```typescript
// Create worktree
await worktree({ fs, dir, gitdir, add: true, path: worktreePath, ref: 'test-branch' })

// Get worktree's gitdir
const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
const worktreeRepo = await Repository.open({ fs, dir: worktreePath, gitdir, autoDetectConfig: true })
const worktreeGitdir = await worktreeRepo.getGitdir()

// Set worktree HEAD as symbolic ref pointing to branch (not detached)
const { writeSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
const branchOid = await resolveRef({ fs, gitdir, ref: 'test-branch' })
await writeSymbolicRef({
  fs,
  gitdir: worktreeGitdir,
  ref: 'HEAD',
  value: 'refs/heads/test-branch',
  oldOid: branchOid,
})

// Now commits in the worktree will update the branch ref
await add({ fs, dir: worktreePath, gitdir, filepath: 'file.txt' })
await commit({
  fs,
  dir: worktreePath,
  gitdir,
  author: { name: 'Test', email: 'test@example.com' },
  message: 'add file',
})
```

**Why This Is Necessary**:
- By default, `createWorktree` sets HEAD as a detached commit OID
- Commits in a detached HEAD don't update branch refs
- Setting HEAD as a symbolic ref ensures commits update the branch

**When to Use**:
- ✅ When you need to commit in a worktree and verify the branch was updated
- ✅ When you need to checkout the branch in the main worktree after committing in a worktree
- ❌ Not needed if you're only reading/checking out files (no commits)

---

### Pattern 3: Testing Multiple Branches Simultaneously

**Use Case**: Test behavior across multiple branches without switching.

**Before**:
```typescript
const { fs, dir, gitdir } = await makeFixture('test-merge')
await checkout({ fs, dir, gitdir, ref: 'a' })
// ... test branch a ...
await checkout({ fs, dir, gitdir, ref: 'b' })
// ... test branch b ...
```

**After**:
```typescript
const { fs, dir, gitdir } = await makeFixture('test-merge')
const worktreeAPath = createWorktreePath(dir, 'worktree-a')
const worktreeBPath = createWorktreePath(dir, 'worktree-b')

try {
  const worktreeA = await worktree({ fs, dir, gitdir, add: true, path: worktreeAPath, ref: 'a' })
  const worktreeB = await worktree({ fs, dir, gitdir, add: true, path: worktreeBPath, ref: 'b' })
  
  // Test both branches simultaneously
  const filesA = await listFiles({ fs, dir: worktreeAPath, gitdir })
  const filesB = await listFiles({ fs, dir: worktreeBPath, gitdir })
  
  // Verify isolation - changes in one worktree don't affect the other
  assert.notDeepEqual(filesA, filesB, 'Worktrees should have different files')
} finally {
  await cleanupWorktrees(fs, dir, gitdir)
}
```

**Benefits**:
- Test multiple branches in parallel
- Verify worktree isolation
- Faster execution (no branch switching)

---

### Pattern 4: Worktree for Branch Creation and Testing

**Use Case**: Create a branch, make commits, then test it without affecting the main worktree.

**Pattern**:
```typescript
const { fs, dir, gitdir } = await makeFixture('test-fixture')

// Create branch without checking it out
await branch({ fs, dir, gitdir, ref: 'feature', checkout: false })

const featureWorktreePath = createWorktreePath(dir, 'feature-worktree')

try {
  // Create worktree for the new branch
  await worktree({ fs, dir, gitdir, add: true, path: featureWorktreePath, ref: 'feature' })
  
  // Set HEAD as symbolic ref if you plan to commit
  const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
  const worktreeRepo = await Repository.open({ fs, dir: featureWorktreePath, gitdir, autoDetectConfig: true })
  const worktreeGitdir = await worktreeRepo.getGitdir()
  const { writeSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
  const featureOid = await resolveRef({ fs, gitdir, ref: 'feature' })
  await writeSymbolicRef({
    fs,
    gitdir: worktreeGitdir,
    ref: 'HEAD',
    value: 'refs/heads/feature',
    oldOid: featureOid,
  })
  
  // Work on feature branch in worktree
  await fs.write(`${featureWorktreePath}/new-file.txt`, 'content')
  await add({ fs, dir: featureWorktreePath, gitdir, filepath: 'new-file.txt' })
  await commit({
    fs,
    dir: featureWorktreePath,
    gitdir,
    author: { name: 'Test', email: 'test@example.com' },
    message: 'add new file',
  })
  
  // Main worktree is unaffected - can test merge, etc.
  await merge({ fs, dir, gitdir, ours: 'main', theirs: 'feature' })
} finally {
  await cleanupWorktrees(fs, dir, gitdir)
}
```

---

## 🔧 Helper Functions

### `cleanupWorktrees(fs, dir, gitdir)`

**Purpose**: Remove all worktrees except the main worktree.

**Usage**:
```typescript
try {
  // ... test code with worktrees ...
} finally {
  await cleanupWorktrees(fs, dir, gitdir)
}
```

**Behavior**:
- Lists all worktrees
- Removes each worktree (except main) with `force: true`
- Prunes stale worktrees
- Silently ignores errors (worktree may already be removed or locked)

**When to Use**:
- Always in test teardown (`try...finally` blocks)
- Ensures test isolation
- Prevents worktree pollution between tests

### `createWorktreePath(baseDir, prefix)`

**Purpose**: Generate a unique worktree path for testing.

**Usage**:
```typescript
const worktreePath = createWorktreePath(dir, 'test-worktree')
// Returns: <tmpdir>/isogit-test-worktrees/test-worktree-<timestamp>-<random>
```

**Behavior**:
- Creates a unique path using timestamp and random string
- Places worktrees in system temp directory (`os.tmpdir()/isogit-test-worktrees/`)
- Avoids polluting project root or fixture directories
- Prevents path conflicts between tests
- Matches the pattern used by `makeNodeFixture` for test fixtures

**When to Use**:
- Every time you create a worktree in a test

### `commitInWorktree({ repo, worktreePath, message, author, branch })`

**Purpose**: Commit in a worktree with proper symbolic HEAD setup. **This is the recommended way to commit in worktrees.**

**Usage**:
```typescript
import { commitInWorktree } from '../helpers/worktreeHelpers.ts'

const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
const repo = await Repository.open({ fs, dir, gitdir, cache })

const worktreePath = createWorktreePath(dir, 'feature-worktree')
await worktree({ fs, dir, gitdir, add: true, path: worktreePath, ref: 'feature' })

// Use the helper instead of manual commit
const commitOid = await commitInWorktree({
  repo,
  worktreePath,
  message: 'add new feature',
  author: { name: 'Test', email: 'test@example.com' },
  branch: 'feature', // Optional - will be detected if not provided
})
```

**Behavior**:
- Opens a Repository instance for the worktree
- Detects branch name automatically if not provided
- **CRITICAL**: Sets worktree HEAD as symbolic ref pointing to branch
- Handles both existing and new branches
- Commits in the worktree using the proper context
- Returns the commit OID

**Why Use This Helper**:
- ✅ Encapsulates the complex symbolic HEAD setup logic
- ✅ Prevents common bugs where commits don't update branch refs
- ✅ Handles edge cases (new branches, detached HEAD, etc.)
- ✅ Reduces code duplication in tests
- ✅ Makes test code more readable and maintainable

**When to Use**:
- ✅ **Always** when committing in a worktree (recommended)
- ✅ When you need commits to update branch refs
- ✅ When you want to avoid manual symbolic HEAD setup

**When NOT to Use**:
- ❌ When you're testing detached HEAD behavior specifically
- ❌ When you need to test the manual symbolic ref setup
- Ensures unique paths for parallel test execution

---

## ⚠️ Common Pitfalls and Solutions

### Pitfall 1: Commits Don't Update Branch Refs

**Problem**: Committing in a worktree doesn't update the branch ref.

**Symptom**:
```typescript
await commit({ fs, dir: worktreePath, gitdir, ... })
const branchOid = await resolveRef({ fs, gitdir, ref: 'test-branch' })
// branchOid is still the old commit, not the new one
```

**Solution**: Set worktree HEAD as symbolic ref before committing (see Pattern 2).

---

### Pitfall 2: Forgetting Cleanup

**Problem**: Worktrees persist between tests, causing test pollution.

**Symptom**: Tests fail intermittently, especially when run in different orders.

**Solution**: Always use `try...finally` with `cleanupWorktrees()`:
```typescript
try {
  // ... test code ...
} finally {
  await cleanupWorktrees(fs, dir, gitdir)
}
```

---

### Pitfall 3: Using Wrong `gitdir` for Worktree Operations

**Problem**: Using main `gitdir` instead of worktree's `gitdir` for worktree-specific operations.

**Symptom**: Operations fail or affect the wrong worktree.

**Solution**: Get worktree's gitdir from Repository:
```typescript
const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
const worktreeRepo = await Repository.open({ fs, dir: worktreePath, gitdir, autoDetectConfig: true })
const worktreeGitdir = await worktreeRepo.getGitdir()
// Use worktreeGitdir for worktree-specific operations
```

---

### Pitfall 4: Not Setting Symbolic HEAD When Needed

**Problem**: Worktree HEAD is detached, commits don't update branch.

**Symptom**: See Pitfall 1.

**Solution**: Always set symbolic HEAD if you plan to commit:
```typescript
await writeSymbolicRef({
  fs,
  gitdir: worktreeGitdir,
  ref: 'HEAD',
  value: 'refs/heads/branch-name',
  oldOid: branchOid,
})
```

---

## 📊 When to Use Worktrees vs. Checkout

### ✅ Use Worktrees When:

1. **Testing multiple branches simultaneously**
   - Need to compare state across branches
   - Testing isolation between branches

2. **Avoiding branch switching overhead**
   - Multiple checkouts in the same test
   - Performance-sensitive tests

3. **Testing worktree features themselves**
   - Worktree isolation
   - Worktree-specific behavior

4. **Complex multi-branch scenarios**
   - Merge testing across branches
   - Submodule behavior across branches

### ❌ Don't Use Worktrees When:

1. **Testing checkout itself**
   - The test is specifically about checkout behavior
   - Need to verify checkout operations

2. **Simple single-branch operations**
   - Only one branch involved
   - No benefit from worktree isolation

3. **Native Git compatibility tests**
   - Tests that verify compatibility with native git
   - May need to match native git's checkout behavior

---

## 🎯 Refactoring Checklist

When refactoring a test to use worktrees:

- [ ] Import `worktree`, `cleanupWorktrees`, and `createWorktreePath`
- [ ] Identify branch switching operations to replace
- [ ] Create worktree paths using `createWorktreePath()`
- [ ] Wrap test code in `try...finally` with `cleanupWorktrees()`
- [ ] If committing in worktree: Set HEAD as symbolic ref
- [ ] Update file paths to use worktree directory
- [ ] Verify test still passes
- [ ] Check that test isolation is improved

---

## 📝 Example: Complete Refactored Test

```typescript
import { worktree, branch, add, commit, checkout } from 'universal-git'
import { cleanupWorktrees, createWorktreePath } from '../helpers/worktreeHelpers.ts'
import { writeSymbolicRef } from '@awesome-os/universal-git-src/git/refs/writeRef.ts'
import { resolveRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'

it('test using worktrees', async () => {
  const { fs, dir, gitdir } = await makeFixture('test-fixture')
  
  // Create branch without checking it out
  await branch({ fs, dir, gitdir, ref: 'feature', checkout: false })
  
  const featureWorktreePath = createWorktreePath(dir, 'feature-worktree')
  
  try {
    // Create worktree
    await worktree({ fs, dir, gitdir, add: true, path: featureWorktreePath, ref: 'feature' })
    
    // Set HEAD as symbolic ref (required for commits to update branch)
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const worktreeRepo = await Repository.open({ 
      fs, 
      dir: featureWorktreePath, 
      gitdir, 
      autoDetectConfig: true 
    })
    const worktreeGitdir = await worktreeRepo.getGitdir()
    const featureOid = await resolveRef({ fs, gitdir, ref: 'feature' })
    await writeSymbolicRef({
      fs,
      gitdir: worktreeGitdir,
      ref: 'HEAD',
      value: 'refs/heads/feature',
      oldOid: featureOid,
    })
    
    // Work on feature branch in worktree
    await fs.write(`${featureWorktreePath}/new-file.txt`, 'content')
    await add({ fs, dir: featureWorktreePath, gitdir, filepath: 'new-file.txt' })
    await commit({
      fs,
      dir: featureWorktreePath,
      gitdir,
      author: { name: 'Test', email: 'test@example.com' },
      message: 'add new file',
    })
    
    // Main worktree is unaffected - can test merge
    await merge({ fs, dir, gitdir, ours: 'main', theirs: 'feature' })
    
    // Verify merge worked
    const files = await listFiles({ fs, dir, gitdir })
    assert.ok(files.includes('new-file.txt'), 'Merge should include new file')
  } finally {
    await cleanupWorktrees(fs, dir, gitdir)
  }
})
```

---

## 🔍 Real-World Examples

### Example 1: Checkout File Permissions Test

**File**: `tests/commands/checkout.test.ts` - "checkout file permissions"

**Refactoring**:
- ✅ Replaced multiple `checkout` calls with single worktree
- ✅ Set worktree HEAD as symbolic ref for commits
- ✅ Used `cleanupWorktrees` in `try...finally`
- ✅ Test passes and is more isolated

**Key Learning**: Setting symbolic HEAD is critical for commits to update branch refs.

---

## 📚 References

- [WORKTREE_REFACTOR_PLAN.md](../WORKTREE_REFACTOR_PLAN.md) - Overall refactoring plan
- [worktreeHelpers.ts](./worktreeHelpers.ts) - Helper functions
- [src/commands/worktree.ts](@awesome-os/universal-git-src/commands/worktree.ts) - Worktree command implementation

---

## 🎓 Lessons Learned

1. **Worktree HEAD Must Be Symbolic for Commits**: When creating a worktree for a branch and planning to commit, always set HEAD as a symbolic ref pointing to the branch. This ensures commits update the branch ref, not just the worktree's detached HEAD.

2. **Always Clean Up**: Use `try...finally` with `cleanupWorktrees()` in every test that creates worktrees. This ensures test isolation and prevents worktree pollution.

3. **Use Unique Paths**: Always use `createWorktreePath()` to generate unique worktree paths. This prevents conflicts in parallel test execution.

4. **Get Worktree Gitdir Correctly**: When you need the worktree's gitdir (e.g., for setting symbolic HEAD), use Repository to get it correctly:
   ```typescript
   const worktreeRepo = await Repository.open({ fs, dir: worktreePath, gitdir, autoDetectConfig: true })
   const worktreeGitdir = await worktreeRepo.getGitdir()
   ```

5. **Worktrees Share Object Database**: All worktrees share the same object database (main gitdir), so commits are immediately visible to all worktrees. This is a feature, not a bug.

---

**Last Updated**: 2025-01-XX  
**Status**: ✅ **ACTIVE** - Patterns in use, being refined as more tests are refactored

