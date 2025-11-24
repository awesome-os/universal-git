---
title: Write Commit
sidebar_label: writeCommit
---

# writeCommit

Write a commit object directly to the Git object store.

## Overview

The `writeCommit` command:
- Writes commit objects to Git
- Computes SHA-1 or SHA-256 hash automatically
- Returns the commit OID
- Supports dry-run mode

## Basic Usage

```typescript
import { writeCommit } from 'universal-git'

// Write a commit
const oid = await writeCommit({
  fs,
  dir: '/path/to/repo',
  commit: {
    tree: 'abc123...',
    parent: [],
    author: { name: 'John', email: 'john@example.com', timestamp: 1234567890, timezoneOffset: -0 },
    committer: { name: 'John', email: 'john@example.com', timestamp: 1234567890, timezoneOffset: -0 },
    message: 'Initial commit'
  }
})

console.log('Commit OID:', oid)
```

## Examples

### Example 1: Write Initial Commit

```typescript
// Create initial commit
const treeOid = await writeTree({
  fs,
  dir: '/path/to/repo',
  tree: [...]
})

const commitOid = await writeCommit({
  fs,
  dir: '/path/to/repo',
  commit: {
    tree: treeOid,
    parent: [],  // No parent (initial commit)
    author: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    committer: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    message: 'Initial commit'
  }
})
```

### Example 2: Write Commit with Parent

```typescript
// Create commit with parent
const parentOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const treeOid = await writeTree({ fs, dir, tree: [...] })

const commitOid = await writeCommit({
  fs,
  dir: '/path/to/repo',
  commit: {
    tree: treeOid,
    parent: [parentOid],  // One parent
    author: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    committer: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    message: 'Update files'
  }
})
```

### Example 3: Write Merge Commit

```typescript
// Create merge commit (multiple parents)
const currentOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const mergeOid = await resolveRef({ fs, dir, ref: 'feature-branch' })
const treeOid = await writeTree({ fs, dir, tree: [...] })

const commitOid = await writeCommit({
  fs,
  dir: '/path/to/repo',
  commit: {
    tree: treeOid,
    parent: [currentOid, mergeOid],  // Two parents (merge)
    author: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    committer: {
      name: 'John Doe',
      email: 'john@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: new Date().getTimezoneOffset()
    },
    message: 'Merge feature-branch into main'
  }
})
```

### Example 4: Write Signed Commit

```typescript
// Create signed commit
const commitOid = await writeCommit({
  fs,
  dir: '/path/to/repo',
  commit: {
    tree: treeOid,
    parent: [parentOid],
    author: {...},
    committer: {...},
    message: 'Signed commit',
    gpgsig: '-----BEGIN PGP SIGNATURE-----\n...\n-----END PGP SIGNATURE-----'
  }
})
```

### Example 5: Dry Run

```typescript
// Compute OID without writing
const commitOid = await writeCommit({
  fs,
  dir: '/path/to/repo',
  commit: {...},
  dryRun: true
})

console.log('Would create commit with OID:', commitOid)
// Commit is not written to disk
```

## API Reference

### `writeCommit(options)`

Write a commit object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `commit` - Commit object (required)
- `dryRun` - Compute OID without writing (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID of the written commit

**CommitObject:**
```typescript
{
  tree: string           // Tree OID (required)
  parent: string[]       // Parent commit OIDs (empty for initial commit)
  author: {
    name: string
    email: string
    timestamp: number    // Unix timestamp
    timezoneOffset: number
  }
  committer: {
    name: string
    email: string
    timestamp: number
    timezoneOffset: number
  }
  message: string        // Commit message
  gpgsig?: string        // GPG signature (optional)
}
```

## Best Practices

### 1. Use Commit Command for Normal Commits

```typescript
// ✅ Good: Use commit command for normal commits
await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Update files',
  author: {...}
})

// ⚠️ Use writeCommit for: Custom commits, merge commits, signed commits
```

### 2. Normalize Timestamps

```typescript
// ✅ Good: Use proper timestamp format
const timestamp = Math.floor(Date.now() / 1000)  // Unix timestamp
const timezoneOffset = new Date().getTimezoneOffset()

await writeCommit({
  fs,
  dir: '/path/to/repo',
  commit: {
    ...,
    author: {
      ...,
      timestamp,
      timezoneOffset
    }
  }
})
```

## Limitations

1. **No Validation**: Doesn't validate commit structure
2. **Object Format**: Uses repository's object format
3. **Manual Creation**: Requires manual construction of commit object

## See Also

- [Read Commit](./read-commit.md) - Read commit objects
- [Commit](./commit.md) - Create commits (higher-level)
- [Write Tree](./write-tree.md) - Write tree objects

