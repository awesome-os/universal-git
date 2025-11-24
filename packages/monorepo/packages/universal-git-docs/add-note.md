---
title: Add Note
sidebar_label: addNote
---

# addNote

Add or update a Git note attached to an object.

## Overview

The `addNote` command:
- Adds notes to Git objects (commits, trees, blobs, tags)
- Stores notes in a separate ref (default: `refs/notes/commits`)
- Creates commits to store notes
- Supports force mode to overwrite existing notes

## Basic Usage

```typescript
import { addNote } from 'universal-git'

// Add a note to a commit
const noteCommitOid = await addNote({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...',
  note: 'This commit fixes a critical bug'
})
```

## Examples

### Example 1: Add Note to Commit

```typescript
// Add a note to a commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const noteCommitOid = await addNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  note: 'Reviewed and approved by team lead'
})

console.log('Note commit OID:', noteCommitOid)
```

### Example 2: Add Note with Custom Ref

```typescript
// Add note to custom notes ref
const noteCommitOid = await addNote({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/notes/reviews',  // Custom notes ref
  oid: commitOid,
  note: 'Code review notes'
})
```

### Example 3: Force Overwrite Note

```typescript
// Overwrite existing note
const noteCommitOid = await addNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  note: 'Updated review notes',
  force: true  // Overwrite existing note
})
```

### Example 4: Add Binary Note

```typescript
// Add binary note (as Uint8Array)
const noteData = new Uint8Array([...])  // Binary data
const noteCommitOid = await addNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  note: noteData
})
```

### Example 5: Add Signed Note

```typescript
// Add signed note
const noteCommitOid = await addNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  note: 'Signed review',
  signingKey: privateKey,
  onSign: signCallback
})
```

## API Reference

### `addNote(options)`

Add or update a Git note.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Notes ref to use (optional, default: `'refs/notes/commits'`)
- `oid` - Object OID to attach note to (required)
- `note` - Note content (required)
  - Can be `string` or `Uint8Array`
- `force` - Overwrite existing note (optional, default: `false`)
- `author` - Author for note commit (optional)
- `committer` - Committer for note commit (optional)
- `signingKey` - Signing key for note commit (optional)
- `onSign` - Sign callback (optional)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID of the commit created for the note

## Notes Refs

Notes are stored in separate refs:

- **Default**: `refs/notes/commits` - Default notes ref
- **Custom**: `refs/notes/<name>` - Custom notes refs

## Best Practices

### 1. Use for Commit Annotations

```typescript
// ✅ Good: Use notes for additional commit information
const commitOid = await commit({ fs, dir, message: 'Fix bug' })
await addNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid,
  note: 'Bug reported by user@example.com'
})
```

### 2. Check Before Adding

```typescript
// ✅ Good: Check if note exists before force
try {
  await readNote({ fs, dir, oid: commitOid })
  // Note exists, use force
  await addNote({ fs, dir, oid: commitOid, note: 'Updated', force: true })
} catch {
  // Note doesn't exist, add normally
  await addNote({ fs, dir, oid: commitOid, note: 'New note' })
}
```

## Limitations

1. **Commit Creation**: Creates a commit for each note (may create many commits)
2. **Ref Management**: Notes are stored in separate refs

## See Also

- [Read Note](./read-note.md) - Read notes
- [List Notes](./list-notes.md) - List all notes
- [Remove Note](./remove-note.md) - Remove notes

