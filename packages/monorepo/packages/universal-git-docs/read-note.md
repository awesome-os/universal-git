---
title: Read Note
sidebar_label: readNote
---

# readNote

Read a Git note attached to an object.

## Overview

The `readNote` command:
- Reads notes attached to Git objects
- Returns note content as Uint8Array
- Supports custom notes refs
- Throws error if note doesn't exist

## Basic Usage

```typescript
import { readNote } from 'universal-git'

// Read a note
const note = await readNote({
  fs,
  dir: '/path/to/repo',
  oid: 'abc123...'
})

console.log('Note:', UniversalBuffer.from(note).toString('utf8'))
```

## Examples

### Example 1: Read Note from Commit

```typescript
// Read note attached to a commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
const note = await readNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid
})

const noteText = UniversalBuffer.from(note).toString('utf8')
console.log('Note:', noteText)
```

### Example 2: Read Note from Custom Ref

```typescript
// Read note from custom notes ref
const note = await readNote({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/notes/reviews',  // Custom notes ref
  oid: commitOid
})
```

### Example 3: Handle Note Not Found

```typescript
// Read note, handle if doesn't exist
try {
  const note = await readNote({
    fs,
    dir: '/path/to/repo',
    oid: commitOid
  })
  console.log('Note:', UniversalBuffer.from(note).toString('utf8'))
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('No note attached to this commit')
  } else {
    throw error
  }
}
```

### Example 4: Read Binary Note

```typescript
// Read binary note
const note = await readNote({
  fs,
  dir: '/path/to/repo',
  oid: commitOid
})

// note is Uint8Array, use directly
console.log('Note size:', note.length)
```

## API Reference

### `readNote(options)`

Read a Git note.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Notes ref to read from (optional, default: `'refs/notes/commits'`)
- `oid` - Object OID to read note for (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<Uint8Array>` - Note content as Uint8Array

**Throws:**

- `NotFoundError` - If note doesn't exist

## Best Practices

### 1. Handle Missing Notes

```typescript
// ✅ Good: Handle missing notes gracefully
async function getNoteSafely(fs: FileSystemProvider, dir: string, oid: string): Promise<string | null> {
  try {
    const note = await readNote({ fs, dir, oid })
    return UniversalBuffer.from(note).toString('utf8')
  } catch (error) {
    if (error.code === 'NotFoundError') {
      return null
    }
    throw error
  }
}
```

### 2. Convert to String

```typescript
// ✅ Good: Convert Uint8Array to string
const note = await readNote({ fs, dir, oid: commitOid })
const noteText = UniversalBuffer.from(note).toString('utf8')
console.log('Note:', noteText)
```

## Limitations

1. **Single Note**: Returns one note at a time
2. **Ref Required**: Notes ref must exist (use `listNotes` to check)

## See Also

- [Add Note](./add-note.md) - Add notes
- [List Notes](./list-notes.md) - List all notes
- [Remove Note](./remove-note.md) - Remove notes

