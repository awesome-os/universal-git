---
title: Write Ref
sidebar_label: writeRef
---

# writeRef

Write a Git reference (branch, tag, or other ref) to point to a specific OID or symbolic ref.

## Overview

The `writeRef` command:
- Creates or updates refs
- Supports direct refs (pointing to OIDs)
- Supports symbolic refs (pointing to other refs)
- Can create reflog entries
- Supports force mode to overwrite existing refs

## Basic Usage

```typescript
import { writeRef } from 'universal-git'

// Write a ref pointing to a commit
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/feature-branch',
  value: 'abc123...'
})
```

## Examples

### Example 1: Create Branch Ref

```typescript
// Create a branch pointing to a commit
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/feature-branch',
  value: commitOid
})
```

### Example 2: Update Branch Ref

```typescript
// Update branch to point to new commit
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/main',
  value: newCommitOid,
  force: true  // Overwrite existing
})
```

### Example 3: Create Symbolic Ref

```typescript
// Create symbolic ref (e.g., HEAD -> refs/heads/main)
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  value: 'refs/heads/main',
  symbolic: true
})
```

### Example 4: Create Tag Ref

```typescript
// Create lightweight tag
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0',
  value: commitOid
})
```

### Example 5: Force Overwrite

```typescript
// Force overwrite existing ref
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/branch',
  value: newCommitOid,
  force: true  // Overwrite even if exists
})
```

### Example 6: Conditional Update

```typescript
// Update ref only if it matches expected value
const currentOid = await resolveRef({ fs, dir, ref: 'refs/heads/main' })
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/main',
  value: newCommitOid,
  oldOid: currentOid  // Only update if current value matches
})
```

## API Reference

### `writeRef(options)`

Write a Git reference.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Reference name to write (required)
  - Examples: `'refs/heads/main'`, `'refs/tags/v1.0.0'`, `'HEAD'`
- `value` - Value to write (required)
  - For direct refs: OID or ref name
  - For symbolic refs: Full ref path (must start with `refs/`)
- `force` - Overwrite existing ref (optional, default: `false`)
- `symbolic` - Create symbolic ref (optional, default: `false`)
- `oldOid` - Expected current OID (optional, for conditional updates)

**Returns:**

- `Promise<void>` - Resolves when ref is written

## Ref Types

### Direct Refs

Point directly to an OID:

```typescript
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/branch',
  value: 'abc123...',  // OID
  symbolic: false  // Default
})
```

### Symbolic Refs

Point to another ref:

```typescript
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  value: 'refs/heads/main',  // Must start with 'refs/'
  symbolic: true
})
```

## Common Use Cases

### Create Branch

```typescript
// Create new branch
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/new-branch',
  value: commitOid
})
```

### Create Lightweight Tag

```typescript
// Create lightweight tag
const commitOid = await resolveRef({ fs, dir, ref: 'HEAD' })
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0',
  value: commitOid
})
```

### Detach HEAD

```typescript
// Detach HEAD to point directly to commit
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  value: commitOid,
  force: true
})
```

## Best Practices

### 1. Use Full Ref Paths

```typescript
// ✅ Good: Use full ref paths
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/branch',
  value: commitOid
})

// ⚠️ May fail: Short ref names may not work
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'branch',  // May not resolve correctly
  value: commitOid
})
```

### 2. Check Before Writing

```typescript
// ✅ Good: Check if ref exists before force
try {
  await resolveRef({ fs, dir, ref: 'refs/heads/branch' })
  // Ref exists, use force
  await writeRef({
    fs,
    dir: '/path/to/repo',
    ref: 'refs/heads/branch',
    value: commitOid,
    force: true
  })
} catch {
  // Ref doesn't exist, create normally
  await writeRef({
    fs,
    dir: '/path/to/repo',
    ref: 'refs/heads/branch',
    value: commitOid
  })
}
```

## Limitations

1. **Ref Validation**: Ref names must be valid Git ref names
2. **Symbolic Refs**: Symbolic ref values must start with `refs/`
3. **Force Required**: Cannot overwrite existing refs without `force: true`

## See Also

- [Delete Ref](./delete-ref.md) - Delete refs
- [Resolve Ref](./resolve-ref.md) - Resolve refs to OIDs
- [Branch](./branch.md) - Create branches (higher-level)

