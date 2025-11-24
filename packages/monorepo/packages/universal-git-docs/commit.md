---
title: Commit
sidebar_label: commit
---

# commit

Create a new commit from the staged changes in the index.

## Overview

The `commit` command:
- Creates a commit object from staged changes
- Updates the branch ref to point to the new commit
- Updates HEAD to point to the branch
- Records author and committer information
- Supports commit signing
- Supports amending previous commits

## Basic Usage

```typescript
import { commit } from 'universal-git'

// Create a commit
const oid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Initial commit'
})

console.log('Commit OID:', oid)
```

## Examples

### Example 1: Basic Commit

```typescript
// Stage files first
await add({ fs, dir: '/path/to/repo', filepath: 'README.md' })

// Create commit
const oid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Add README'
})

console.log('Created commit:', oid)
```

### Example 2: Commit with Author

```typescript
// Commit with custom author
const oid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Add feature',
  author: {
    name: 'John Doe',
    email: 'john@example.com'
  }
})
```

### Example 3: Amend Previous Commit

```typescript
// Amend the last commit
const oid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Updated commit message',
  amend: true
})
```

### Example 4: Signed Commit

```typescript
import { onSign } from 'universal-git'

// Create a signed commit
const oid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Signed commit',
  signingKey: 'key-id',
  onSign: async (message) => {
    // Sign the commit message
    return await signMessage(message)
  }
})
```

### Example 5: Dry Run

```typescript
// Check what would be committed without creating it
const oid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Test commit',
  dryRun: true
})

console.log('Would create commit:', oid)
// Commit is not actually created
```

### Example 6: Commit to Specific Branch

```typescript
// Commit to a specific branch
const oid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Add feature',
  ref: 'refs/heads/feature-branch'
})
```

## API Reference

### `commit(options)`

Create a new commit.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `message` - Commit message (required, unless `amend: true`)
- `author` - Author information (optional)
  ```typescript
  {
    name?: string    // Author name (defaults to user.name from config)
    email?: string   // Author email (defaults to user.email from config)
    timestamp?: number  // Unix timestamp (defaults to now)
    timezoneOffset?: string  // Timezone offset, e.g., '-0500' (defaults to local)
  }
  ```
- `committer` - Committer information (optional, defaults to author)
  ```typescript
  {
    name?: string
    email?: string
    timestamp?: number
    timezoneOffset?: string
  }
  ```
- `amend` - Amend the previous commit (optional, default: `false`)
- `dryRun` - Don't create commit, just return what would be created (optional, default: `false`)
- `noUpdateBranch` - Don't update branch ref (optional, default: `false`)
- `ref` - Branch to commit to (optional, defaults to current branch)
- `parent` - Parent commit OIDs (optional, defaults to HEAD)
- `tree` - Tree OID to use (optional, defaults to index)
- `signingKey` - Key ID for signing (optional)
- `onSign` - Signing callback (required if `signingKey` is provided)
- `cache` - Cache object (optional)
- `autoDetectConfig` - Auto-detect config (optional, default: `true`)

**Returns:**

- `Promise<string>` - The commit OID

## How Commit Works

1. **Reads the index** to get staged files
2. **Creates a tree object** from the index
3. **Determines parent commits** (defaults to HEAD)
4. **Creates commit object** with:
   - Tree OID
   - Parent commit OIDs
   - Author and committer information
   - Commit message
   - Timestamp
5. **Signs the commit** (if `signingKey` and `onSign` provided)
6. **Writes the commit** to the object database
7. **Updates the branch ref** to point to the new commit
8. **Updates HEAD** to point to the branch

## Important Notes

### Staged Changes Required

You must stage changes before committing:

```typescript
// ✅ Good: Stage then commit
await add({ fs, dir, filepath: 'README.md' })
await commit({ fs, dir, message: 'Add README' })

// ❌ Bad: Nothing to commit
await commit({ fs, dir, message: 'Add README' })
// May create empty commit or fail
```

### Commit Message

The commit message is required (unless amending):

```typescript
// ✅ Good: Provide message
await commit({ fs, dir, message: 'Add feature' })

// ❌ Bad: Missing message
await commit({ fs, dir })
// Throws error
```

### Amending

When amending:
- The previous commit's message is used if no new message is provided
- The previous commit is replaced (history is rewritten)
- Author can be changed, but committer defaults to current user

```typescript
// Amend with new message
await commit({ fs, dir, message: 'Updated message', amend: true })

// Amend keeping old message
await commit({ fs, dir, amend: true })
```

## Best Practices

### 1. Stage Files Before Committing

```typescript
// ✅ Good: Stage then commit
await add({ fs, dir, filepath: 'README.md' })
await commit({ fs, dir, message: 'Add README' })

// ❌ Bad: Commit without staging
await commit({ fs, dir, message: 'Add README' })
```

### 2. Write Clear Commit Messages

```typescript
// ✅ Good: Clear, descriptive message
await commit({
  fs,
  dir,
  message: 'Add user authentication feature'
})

// ❌ Bad: Vague message
await commit({
  fs,
  dir,
  message: 'fix'
})
```

### 3. Use Dry Run for Testing

```typescript
// Test commit creation
const oid = await commit({
  fs,
  dir,
  message: 'Test commit',
  dryRun: true
})

console.log('Would create:', oid)
// No commit is actually created
```

### 4. Configure Author Information

```typescript
// Set author in config
await setConfig({
  fs,
  gitdir,
  path: 'user.name',
  value: 'John Doe'
})

await setConfig({
  fs,
  gitdir,
  path: 'user.email',
  value: 'john@example.com'
})

// Commit will use config values
await commit({ fs, dir, message: 'Commit' })
```

## Common Patterns

### Initial Commit

```typescript
// First commit in a repository
await add({ fs, dir, filepath: 'README.md' })
const oid = await commit({
  fs,
  dir,
  message: 'Initial commit'
})
```

### Amending Last Commit

```typescript
// Make additional changes
await add({ fs, dir, filepath: 'README.md' })

// Amend to include in previous commit
await commit({
  fs,
  dir,
  message: 'Add README and LICENSE',
  amend: true
})
```

### Commit with Multiple Parents (Merge)

```typescript
// Commit with multiple parents (merge commit)
const oid = await commit({
  fs,
  dir,
  message: 'Merge feature branch',
  parent: ['abc123...', 'def456...']  // Two parents
})
```

## Limitations

1. **Staged Changes**: Must have staged changes (or use `amend`)
2. **Message Required**: Commit message is required (unless amending)
3. **Signing**: Requires `onSign` callback implementation
4. **Bare Repositories**: Requires a working directory for index operations

## Troubleshooting

### Nothing to Commit

If there's nothing to commit:

```typescript
// Check if there are staged changes
import { statusMatrix } from 'universal-git'

const matrix = await statusMatrix({ fs, dir })
const staged = matrix.filter(([filepath, head, index, workdir]) => {
  return index !== head && index !== 0
})

if (staged.length === 0) {
  console.log('No staged changes to commit')
  // Stage some files first
  await add({ fs, dir, filepath: 'README.md' })
}
```

### Commit Message Missing

If commit message is missing:

```typescript
try {
  await commit({ fs, dir })
} catch (error) {
  if (error.code === 'MissingParameterError') {
    console.log('Commit message is required')
    await commit({ fs, dir, message: 'My commit message' })
  }
}
```

### Cannot Amend Initial Commit

If trying to amend the initial commit:

```typescript
try {
  await commit({ fs, dir, message: 'Amend', amend: true })
} catch (error) {
  if (error.code === 'NoCommitError') {
    console.log('No commit to amend (initial commit)')
    // Create a new commit instead
    await commit({ fs, dir, message: 'Initial commit' })
  }
}
```

## See Also

- [Add](./add.md) - Stage files
- [Status](./status.md) - Check file status
- [Log](./log.md) - View commit history
- [Reset](./reset.md) - Undo commits

