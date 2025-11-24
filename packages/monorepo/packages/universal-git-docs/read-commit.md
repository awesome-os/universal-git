---
title: Read Commit
sidebar_label: readCommit
---

# readCommit

Read a commit object directly by its OID.

## Overview

The `readCommit` command:
- Reads commit objects
- Returns parsed commit information
- Includes commit payload (for verification)
- Automatically peels tags to find commits

## Basic Usage

```typescript
import { readCommit } from 'universal-git'

// Read a commit
const { oid, commit } = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Commit OID:', oid)
console.log('Message:', commit.message)
```

## Examples

### Example 1: Read Commit by OID

```typescript
// Read commit directly by OID
const { oid, commit } = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Author:', commit.author.name)
console.log('Message:', commit.message)
console.log('Tree:', commit.tree)
console.log('Parents:', commit.parent)
```

### Example 2: Read Commit from Ref

```typescript
// Read commit from a ref
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const { oid, commit } = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: commitOid
})

console.log('Commit:', commit)
```

### Example 3: Access Commit Fields

```typescript
// Access commit information
const { oid, commit } = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: commitOid
})

console.log('OID:', oid)
console.log('Tree OID:', commit.tree)
console.log('Parent OIDs:', commit.parent)
console.log('Author:', commit.author.name, commit.author.email)
console.log('Committer:', commit.committer.name, commit.committer.email)
console.log('Message:', commit.message)
console.log('Timestamp:', new Date(commit.author.timestamp * 1000))
```

### Example 4: Read Commit from Tag

```typescript
// Read commit from a tag (tag is automatically peeled)
const tagOid = await resolveRef({ fs, dir, ref: 'v1.0.0' })
const { oid, commit } = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: tagOid  // Tag is peeled to commit
})

console.log('Tagged commit:', commit)
```

### Example 5: Verify Commit

```typescript
// Read commit with payload for verification
const { oid, commit, payload } = await readCommit({
  fs,
  dir: '/path/to/repo',
  oid: commitOid
})

// payload is the commit without signature (for verification)
console.log('Commit payload:', payload)
```

## API Reference

### `readCommit(options)`

Read a commit object.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `oid` - Commit OID (required)
  - Can be commit OID or tag OID (tags are peeled)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<ReadCommitResult>` - Commit result

**ReadCommitResult:**
```typescript
{
  oid: string        // Commit OID
  commit: CommitObject  // Parsed commit object
  payload: Uint8Array   // Commit payload (without signature, for verification)
}
```

**CommitObject:**
```typescript
{
  tree: string           // Tree OID
  parent: string[]       // Parent commit OIDs
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
  gpgsig?: string        // GPG signature (if signed)
}
```

## Best Practices

### 1. Use for Commit Information

```typescript
// ✅ Good: Use readCommit for commit details
const { commit } = await readCommit({ fs, dir, oid: commitOid })
console.log('Author:', commit.author.name)

// ⚠️ More complex: Use readObject and handle types
const result = await readObject({ fs, dir, oid: commitOid })
if (result.type === 'commit') {
  console.log('Author:', result.object.author.name)
}
```

### 2. Navigate Commit History

```typescript
// Navigate commit history
let currentOid = await resolveRef({ fs, dir, ref: 'HEAD' })

while (currentOid) {
  const { commit } = await readCommit({ fs, dir, oid: currentOid })
  console.log(commit.message)
  
  // Move to parent
  currentOid = commit.parent[0]
  if (!currentOid) break
}
```

## Limitations

1. **Single Commit**: Returns one commit at a time
2. **No History**: Doesn't traverse commit history (use `log` for that)

## See Also

- [Write Commit](./write-commit.md) - Write commit objects
- [Log](./log.md) - View commit history
- [Read Object](./read-object.md) - Read any object type

