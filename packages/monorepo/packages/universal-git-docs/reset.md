---
title: Reset
sidebar_label: reset
---

# reset

Resets the repository to a specific commit. Supports three reset modes: soft, mixed, and hard.

## Overview

The `resetToCommit` command supports three reset modes:

- **Soft reset** (`mode: 'soft'`): Only updates HEAD and branch ref. Keeps index and working directory unchanged.
- **Mixed reset** (`mode: 'mixed'`): Updates HEAD, branch ref, and index. Keeps working directory changes.
- **Hard reset** (`mode: 'hard'`, default): Updates HEAD, branch ref, index, and working directory. Equivalent to `git reset --hard`.

## Basic Usage

### Hard Reset (Default)

```typescript
import { resetToCommit } from 'universal-git'

// Hard reset to a specific commit (default behavior)
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123...'
})

// Hard reset to previous commit
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'hard'  // Explicit, but 'hard' is the default
})
```

### Soft Reset

```typescript
// Soft reset: Only update HEAD and branch ref
// Keeps changes staged in the index and working directory unchanged
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'soft'
})
```

### Mixed Reset

```typescript
// Mixed reset: Update HEAD, branch ref, and index
// Keeps working directory changes (unstaged)
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'mixed'  // Note: 'hard' is the default for backward compatibility
})
```

## Examples

### Example 1: Soft Reset (Keep Changes Staged)

```typescript
import { resetToCommit } from 'universal-git'

// Soft reset: Move HEAD back but keep all changes staged
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'soft'
})

// All changes remain staged in the index
// Useful for amending commits or creating a new commit from the same changes
```

### Example 2: Mixed Reset (Keep Working Directory Changes)

```typescript
// Mixed reset: Reset index but keep working directory changes
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'mixed'
})

// Index is reset to match the commit
// Working directory changes remain (unstaged)
// Useful for uncommitting changes while keeping your work
```

### Example 3: Hard Reset (Complete Reset)

```typescript
import { resetToCommit, log } from 'universal-git'

// View recent commits
const commits = await log({
  fs,
  dir: '/path/to/repo',
  depth: 5
})

// Hard reset to the previous commit (default)
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'hard'
})

// Repository is completely reset to the previous commit
// All uncommitted changes are lost
```

### Example 4: Reset to Specific Commit

```typescript
// Reset to a specific commit by hash
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123def456...',
  mode: 'hard'  // or 'soft' or 'mixed'
})
```

### Example 5: Reset Specific Branch

```typescript
// Reset a specific branch
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123...',
  branch: 'feature-branch',
  mode: 'mixed'
})
```

### Example 6: Reset to Tag

```typescript
// Reset to a tag
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  mode: 'hard'
})
```

### Example 7: Undo Last Commit (Keep Changes)

```typescript
// Soft reset to undo last commit but keep changes staged
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'soft'
})

// Now you can amend the commit or create a new one with the same changes
```

### Example 8: Unstage All Changes

```typescript
// Mixed reset to HEAD to unstage all changes
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  mode: 'mixed'
})

// All staged changes are now unstaged, but working directory is unchanged
```

## API Reference

### `resetToCommit(options)`

Resets the repository to a specific commit.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Reference or OID to reset to (required)
  - Can be: commit hash, `HEAD~N`, branch name, tag name, etc.
- `branch` - Branch name to reset (optional, defaults to current branch)
- `mode` - Reset mode: `'soft' | 'mixed' | 'hard'` (optional, defaults to `'hard'`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when reset is complete

**Reset Modes:**

1. **`'soft'`** - Soft reset
   - Updates HEAD and branch ref only
   - Keeps index (staging area) unchanged
   - Keeps working directory unchanged
   - Equivalent to `git reset --soft`

2. **`'mixed'`** - Mixed reset
   - Updates HEAD and branch ref
   - Resets index to match the commit tree
   - Keeps working directory changes (unstaged)
   - Equivalent to `git reset --mixed` or `git reset` (without flags)
   - Note: In Git, `mixed` is the default, but here `hard` is the default for backward compatibility

3. **`'hard'`** - Hard reset (default)
   - Updates HEAD and branch ref
   - Resets index to match the commit tree
   - Resets working directory to match the commit (removes untracked files)
   - Equivalent to `git reset --hard`

## How Reset Works

The reset operation follows these steps:

1. **Resolves the ref** to a commit OID
2. **Updates the branch ref** to point to that commit
3. **Updates HEAD** to point to the branch (ensures HEAD is not detached)
4. **Applies the reset mode**:
   - **Soft**: Stops here (index and working directory unchanged)
   - **Mixed**: Resets index to match commit tree (working directory unchanged)
   - **Hard**: Cleans working directory and checks out the commit (index and working directory reset)

## Important Notes

### ⚠️ Destructive Operation (Hard Reset)

**WARNING**: Hard reset (`mode: 'hard'`) is a destructive operation:
- **All uncommitted changes are lost**
- **Untracked files are removed**
- **The working directory is completely reset**

**Soft and mixed reset are safer**:
- **Soft reset**: Only moves HEAD, preserves all changes (staged and unstaged)
- **Mixed reset**: Resets index but preserves working directory changes

### Reset Modes

The command supports three reset modes:
- **Soft** (`mode: 'soft'`): Only updates HEAD and branch ref
- **Mixed** (`mode: 'mixed'`): Updates HEAD, branch ref, and index
- **Hard** (`mode: 'hard'`, default): Updates HEAD, branch ref, index, and working directory

### HEAD Not Detached

After reset, HEAD always points to a branch (not detached), ensuring the repository is in a valid state.

## Best Practices

### 1. Choose the Right Reset Mode

```typescript
// ✅ Good: Use soft reset to undo commit but keep changes staged
await resetToCommit({ fs, dir, ref: 'HEAD~1', mode: 'soft' })

// ✅ Good: Use mixed reset to unstage changes but keep working directory
await resetToCommit({ fs, dir, ref: 'HEAD', mode: 'mixed' })

// ⚠️ Careful: Hard reset loses all uncommitted changes
await resetToCommit({ fs, dir, ref: 'HEAD~1', mode: 'hard' })
```

### 2. Stash Before Hard Reset

```typescript
// ✅ Good: Stash changes before hard reset
await stash({ fs, dir, message: 'Before reset' })
await resetToCommit({ fs, dir, ref: 'HEAD~1', mode: 'hard' })

// ❌ Bad: Hard reset without saving changes
await resetToCommit({ fs, dir, ref: 'HEAD~1' }) // Changes lost!
```

### 3. Verify the Target Commit

```typescript
// Check what commit you're resetting to
const commit = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Resetting to:', commit.message)
console.log('Date:', commit.committer.timestamp)

// Then reset
await resetToCommit({ fs, dir, ref: 'abc123...', mode: 'soft' })
```

### 4. Use Relative Refs Carefully

```typescript
// ✅ Good: Use specific commit hash
await resetToCommit({ fs, dir, ref: 'abc123...', mode: 'mixed' })

// ⚠️ Careful: Relative refs can change
await resetToCommit({ fs, dir, ref: 'HEAD~1', mode: 'hard' })
```

## Use Cases

### 1. Undo Last Commit (Keep Changes)

```typescript
// Soft reset: Undo commit but keep changes staged
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD~1',
  mode: 'soft'
})
// Changes remain staged, ready to recommit
```

### 2. Unstage All Changes

```typescript
// Mixed reset to HEAD: Unstage everything
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  mode: 'mixed'
})
// All staged changes become unstaged
```

### 3. Return to Stable Version

```typescript
// Hard reset to a stable tag
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  mode: 'hard'
})
// Repository completely matches the tag
```

### 4. Clean Working Directory

```typescript
// Hard reset to HEAD to clean working directory
await resetToCommit({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  mode: 'hard'
})
// Removes all uncommitted changes and untracked files
```

## Limitations

1. **Destructive (Hard Reset)**: Hard reset loses all uncommitted changes
2. **No Undo**: There's no built-in way to undo a reset (use reflog)
3. **Bare Repositories**: Soft and mixed reset require a working directory (`dir` parameter)

## Troubleshooting

### Changes Lost After Reset

If you lost changes after reset:

1. Check reflog for the previous state:
   ```typescript
   const reflog = await readLog({ fs, gitdir, ref: 'HEAD' })
   console.log(reflog) // Find the previous state
   ```

2. Reset back to the previous state:
   ```typescript
   await resetToCommit({
     fs,
     dir: '/path/to/repo',
     ref: reflog[0].oid  // Previous HEAD
   })
   ```

### Cannot Reset to Commit

If reset fails:

1. Verify the commit exists:
   ```typescript
   try {
     const commit = await readCommit({ fs, dir, oid: 'abc123...' })
   } catch (error) {
     console.log('Commit not found')
   }
   ```

2. Check that you have a valid repository:
   ```typescript
   const root = await findRoot({ fs, filepath: '/path/to/repo' })
   console.log('Repository root:', root)
   ```

## See Also

- [Checkout](./checkout.md) - Checkout operations
- [Abort Merge](./abort-merge.md) - Abort merge
- [Stash](./stash.md) - Save changes temporarily
- [Reflog](./reflog.md) - View reflog

