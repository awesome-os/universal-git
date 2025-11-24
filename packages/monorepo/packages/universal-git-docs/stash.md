---
title: Stash
sidebar_label: Stash
---

# Stash

The `stash` command allows you to temporarily save changes in your working directory and index without committing them. This is useful when you need to switch branches but have uncommitted changes.

## Overview

Stash operations:
- **push** - Save current changes to stash (default)
- **pop** - Apply and remove stash entry
- **apply** - Apply stash entry without removing it
- **drop** - Remove stash entry
- **list** - List all stash entries
- **clear** - Remove all stash entries
- **create** - Create stash commit without modifying working directory

## Basic Usage

### Stash Changes (Push)

```typescript
import { stash } from 'universal-git'

// Stash working directory and index changes
await stash({
  fs,
  dir: '/path/to/repo'
})

// Stash with a message
await stash({
  fs,
  dir: '/path/to/repo',
  message: 'WIP: working on feature'
})
```

### Apply Stash (Pop)

```typescript
// Apply and remove the most recent stash
await stash({
  fs,
  dir: '/path/to/repo',
  op: 'pop'
})

// Apply and remove a specific stash entry
await stash({
  fs,
  dir: '/path/to/repo',
  op: 'pop',
  refIdx: 1  // Apply stash@{1}
})
```

### Apply Stash (Without Removing)

```typescript
// Apply stash without removing it
await stash({
  fs,
  dir: '/path/to/repo',
  op: 'apply'
})

// Apply a specific stash entry
await stash({
  fs,
  dir: '/path/to/repo',
  op: 'apply',
  refIdx: 0  // Apply stash@{0}
})
```

### List Stash Entries

```typescript
// List all stash entries
const entries = await stash({
  fs,
  dir: '/path/to/repo',
  op: 'list'
})

console.log(entries)
// [
//   { stash: 'stash@{0}', message: 'WIP: feature work' },
//   { stash: 'stash@{1}', message: 'WIP: bug fix' }
// ]
```

### Remove Stash Entry

```typescript
// Remove the most recent stash
await stash({
  fs,
  dir: '/path/to/repo',
  op: 'drop'
})

// Remove a specific stash entry
await stash({
  fs,
  dir: '/path/to/repo',
  op: 'drop',
  refIdx: 1  // Remove stash@{1}
})
```

### Clear All Stashes

```typescript
// Remove all stash entries
await stash({
  fs,
  dir: '/path/to/repo',
  op: 'clear'
})
```

### Create Stash Without Modifying Working Directory

```typescript
// Create a stash commit without modifying working directory
const stashHash = await stash({
  fs,
  dir: '/path/to/repo',
  op: 'create',
  message: 'My stash'
})

console.log(stashHash) // Returns the commit hash
```

## Examples

### Example 1: Basic Stash Workflow

```typescript
import { stash, checkout, status } from 'universal-git'

// Make some changes
await fs.promises.writeFile(`${dir}/file.txt`, 'modified content')

// Stage some changes
await add({ fs, dir, filepath: 'file.txt' })

// Stash everything (working directory + index)
await stash({
  fs,
  dir,
  message: 'WIP: feature work'
})

// Check status (should be clean)
const fileStatus = await status({ fs, dir, filepath: 'file.txt' })
console.log(fileStatus) // 'unmodified'

// Switch branches
await checkout({ fs, dir, ref: 'other-branch' })

// Do some work...

// Switch back
await checkout({ fs, dir, ref: 'main' })

// Apply the stash
await stash({
  fs,
  dir,
  op: 'pop'  // Apply and remove
})

// Check status (changes are back)
const fileStatus2 = await status({ fs, dir, filepath: 'file.txt' })
console.log(fileStatus2) // 'modified'
```

### Example 2: Multiple Stashes

```typescript
// Create first stash
await stash({
  fs,
  dir,
  message: 'Feature A work'
})

// Make more changes
await fs.promises.writeFile(`${dir}/file2.txt`, 'new content')

// Create second stash
await stash({
  fs,
  dir,
  message: 'Feature B work'
})

// List all stashes
const stashes = await stash({
  fs,
  dir,
  op: 'list'
})

console.log(stashes)
// [
//   { stash: 'stash@{0}', message: 'Feature B work' },
//   { stash: 'stash@{1}', message: 'Feature A work' }
// ]

// Apply the older stash (stash@{1})
await stash({
  fs,
  dir,
  op: 'apply',
  refIdx: 1
})
```

### Example 3: Stash Only Index Changes

```typescript
// Make changes to working directory
await fs.promises.writeFile(`${dir}/file.txt`, 'working dir change')

// Stage some changes
await add({ fs, dir, filepath: 'other-file.txt' })

// Stash (includes both working directory and index)
await stash({
  fs,
  dir,
  message: 'Stashed changes'
})

// Both working directory and index are now clean
```

## API Reference

### `stash(options)`

Manages stash entries.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `op` - Stash operation: `'push' | 'pop' | 'apply' | 'drop' | 'list' | 'clear' | 'create'` (default: `'push'`)
- `message` - Stash message (optional, only for `push` or `create`)
- `refIdx` - Stash ref index (optional, only for `apply`, `drop`, or `pop`, default: `0`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string | void>` - For `create` operation, returns commit hash. Otherwise returns void.

**Operations:**

1. **`push`** (default) - Save current changes to stash
   - Saves both working directory and index changes
   - Creates a stash commit
   - Updates `refs/stash` ref
   - Clears working directory and index

2. **`pop`** - Apply and remove stash entry
   - Applies stash changes to working directory
   - Removes the stash entry
   - Equivalent to `apply` followed by `drop`

3. **`apply`** - Apply stash entry without removing
   - Applies stash changes to working directory
   - Keeps the stash entry

4. **`drop`** - Remove stash entry
   - Removes the specified stash entry
   - Does not modify working directory

5. **`list`** - List all stash entries
   - Returns array of stash entries with messages
   - Most recent stash is `stash@{0}`

6. **`clear`** - Remove all stash entries
   - Removes all stash entries
   - Does not modify working directory

7. **`create`** - Create stash commit without modifying working directory
   - Creates a stash commit
   - Returns the commit hash
   - Does not update `refs/stash` or modify working directory

## How Stash Works

### Stash Storage

Stashes are stored as commits in the object database:
- Stash commits have a special structure (multiple parents)
- The `refs/stash` ref points to the most recent stash
- Older stashes are accessed via reflog: `stash@{0}`, `stash@{1}`, etc.

### Stash Commit Structure

A stash commit has:
- **First parent**: The commit that was HEAD when stash was created
- **Second parent** (if index changes): The index state
- **Tree**: The working directory state
- **Message**: The stash message

### Stash Reflog

Stash entries are tracked in `.git/logs/refs/stash`:
- Each stash operation creates a reflog entry
- Reflog entries are used to access older stashes
- `stash@{0}` is the most recent, `stash@{1}` is the previous, etc.

## Best Practices

### 1. Use Descriptive Messages

```typescript
// ✅ Good: Descriptive message
await stash({
  fs,
  dir,
  message: 'WIP: implementing user authentication'
})

// ❌ Bad: No message or vague message
await stash({ fs, dir })
```

### 2. List Before Applying

```typescript
// ✅ Good: Check what you're applying
const stashes = await stash({ fs, dir, op: 'list' })
console.log(stashes)

await stash({ fs, dir, op: 'pop' })
```

### 3. Use `pop` Instead of `apply` + `drop`

```typescript
// ✅ Good: Use pop
await stash({ fs, dir, op: 'pop' })

// ❌ Less efficient: apply then drop
await stash({ fs, dir, op: 'apply' })
await stash({ fs, dir, op: 'drop' })
```

### 4. Clean Up Old Stashes

```typescript
// Periodically clean up old stashes
const stashes = await stash({ fs, dir, op: 'list' })
if (stashes.length > 10) {
  // Remove old stashes
  for (let i = 10; i < stashes.length; i++) {
    await stash({ fs, dir, op: 'drop', refIdx: i })
  }
}
```

## Limitations

1. **Tracked Files Only**: Stash only saves changes to tracked files
2. **Untracked Files**: Untracked files are not stashed (use `git add` first)
3. **Conflicts**: Applying stash may cause conflicts if files have changed
4. **No Abort**: There's no automatic way to abort a stash apply if conflicts occur

## Troubleshooting

### Stash Not Saving Changes

If stash doesn't save changes:

1. Check that files are tracked:
   ```typescript
   const status = await status({ fs, dir })
   console.log(status) // Should show modified files
   ```

2. Verify you have changes:
   ```typescript
   // Check if there are changes to stash
   const files = await listFiles({ fs, dir })
   ```

### Conflicts When Applying Stash

If applying stash causes conflicts:

1. Resolve conflicts manually
2. Complete the merge
3. The stash entry remains until you drop it

### Stash Entry Not Found

If `refIdx` is out of range:

```typescript
// Check available stashes
const stashes = await stash({ fs, dir, op: 'list' })
console.log(`Available stashes: ${stashes.length}`)

// Use valid refIdx (0 to stashes.length - 1)
await stash({ fs, dir, op: 'pop', refIdx: 0 })
```

## See Also

- [Checkout](./checkout.md) - Checkout operations
- [Status](./status.md) - Check repository status
- [Add](./add.md) - Stage files
- [Commit](./commit.md) - Create commits

