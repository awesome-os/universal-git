---
title: Remove Note
sidebar_label: removeNote
---

# removeNote

Remove a Git note from an object.

## Overview

The `removeNote` command:
- Removes notes attached to Git objects
- Creates a commit to record the removal
- Supports custom notes refs
- Returns the commit OID for the removal

## Basic Usage

```typescript
import { removeNote } from 'universal-git'

// Remove a note
const commitOid = await removeNote({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})
```

## Examples

### Example 1: Remove Note

```typescript
// Remove note from a commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const removalCommitOid = await removeNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid
})

console.log('Note removal commit:', removalCommitOid)
```

### Example 2: Remove Note from Custom Ref

```typescript
// Remove note from custom ref
const removalCommitOid = await removeNote({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/notes/reviews',
  oid: commitOid
})
```

### Example 3: Handle Note Not Found

```typescript
// Remove note, handle if doesn't exist
try {
  await removeNote({
    fs,
    dir: '/path/to/repo',
    oid: commitOid
  })
  console.log('Note removed')
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Note does not exist')
  } else {
    throw error
  }
}
```

## API Reference

### `removeNote(options)`

Remove a Git note.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Notes ref to remove from (optional, default: `'refs/notes/commits'`)
- `oid` - Object OID to remove note from (required)
- `author` - Author for removal commit (optional)
- `committer` - Committer for removal commit (optional)
- `signingKey` - Signing key for removal commit (optional)
- `onSign` - Sign callback (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID of the commit created for note removal

**Throws:**

- `NotFoundError` - If note doesn't exist

## Best Practices

### 1. Check Before Removing

```typescript
// ✅ Good: Check if note exists before removing
try {
  await readNote({ fs, dir, oid: commitOid })
  // Note exists, remove it
  await removeNote({ fs, dir, oid: commitOid })
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Note does not exist')
  } else {
    throw error
  }
}
```

## Limitations

1. **Commit Creation**: Creates a commit for note removal
2. **Ref Required**: Notes ref must exist

## See Also

- [Add Note](./add-note.md) - Add notes
- [Read Note](./read-note.md) - Read notes
- [List Notes](./list-notes.md) - List all notes

