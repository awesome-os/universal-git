---
title: List Notes
sidebar_label: listNotes
---

# listNotes

List all Git notes in a notes ref.

## Overview

The `listNotes` command:
- Lists all notes in a notes ref
- Returns array of note entries with target OIDs
- Supports custom notes refs
- Returns empty array if no notes exist

## Basic Usage

```typescript
import { listNotes } from 'universal-git'

// List all notes
const notes = await listNotes({
  fs,
  dir: '/path/to/repo'
})

console.log('Notes:', notes)
```

## Examples

### Example 1: List All Notes

```typescript
// List all notes in default ref
const notes = await listNotes({
  fs,
  dir: '/path/to/repo'
})

for (const { target, note } of notes) {
  console.log(`Commit ${target} has note: ${note}`)
}
```

### Example 2: List Notes from Custom Ref

```typescript
// List notes from custom ref
const notes = await listNotes({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/notes/reviews'
})

console.log('Review notes:', notes)
```

### Example 3: Find Notes for Specific Commit

```typescript
// Find notes for a specific commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const notes = await listNotes({ fs, dir: '/path/to/repo' })

const commitNote = notes.find(n => n.target === commitOid)
if (commitNote) {
  console.log('Commit has note:', commitNote.note)
} else {
  console.log('No note for this commit')
}
```

### Example 4: Count Notes

```typescript
// Count total notes
const notes = await listNotes({ fs, dir: '/path/to/repo' })
console.log(`Total notes: ${notes.length}`)
```

## API Reference

### `listNotes(options)`

List all notes in a notes ref.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Notes ref to list (optional, default: `'refs/notes/commits'`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<Array<{ target: string; note: string }>>` - Array of note entries
  - Returns empty array if no notes exist

**Note Entry:**
```typescript
{
  target: string  // OID of object the note is attached to
  note: string   // OID of the note blob
}
```

## Best Practices

### 1. Check if Notes Exist

```typescript
// ✅ Good: Check if notes exist
const notes = await listNotes({ fs, dir: '/path/to/repo' })
if (notes.length > 0) {
  console.log(`Found ${notes.length} notes`)
} else {
  console.log('No notes found')
}
```

### 2. Read Note Content

```typescript
// ✅ Good: List notes then read content
const notes = await listNotes({ fs, dir: '/path/to/repo' })

for (const { target, note } of notes) {
  const noteBlob = await readBlob({ fs, dir, oid: note })
  const content = UniversalBuffer.from(noteBlob.blob).toString('utf8')
  console.log(`Commit ${target}: ${content}`)
}
```

## Limitations

1. **Note OIDs**: Returns note blob OIDs, not content (use `readNote` for content)
2. **Single Ref**: Lists notes from one ref at a time

## See Also

- [Read Note](./read-note.md) - Read note content
- [Add Note](./add-note.md) - Add notes
- [Remove Note](./remove-note.md) - Remove notes

