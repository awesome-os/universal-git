---
title: Resolve Ref
sidebar_label: resolveRef
---

# resolveRef

Resolve a Git reference to its OID or symbolic ref value.

## Overview

The `resolveRef` command:
- Resolves refs to commit OIDs
- Can resolve symbolic refs
- Supports depth limiting for symbolic ref chains
- Works with branches, tags, and other refs

## Basic Usage

```typescript
import { resolveRef } from 'universal-git'

// Resolve a ref to OID
const oid = await resolveRef({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD'
})

console.log('Commit OID:', oid)
```

## Examples

### Example 1: Resolve Branch to OID

```typescript
// Resolve branch to commit OID
const oid = await resolveRef({
  fs,
  dir: '/path/to/repo',
  ref: 'main'
})

console.log('Main branch OID:', oid)
```

### Example 2: Resolve Tag to OID

```typescript
// Resolve tag to commit OID
const oid = await resolveRef({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})

console.log('Tag OID:', oid)
```

### Example 3: Resolve HEAD

```typescript
// Resolve HEAD to current commit
const oid = await resolveRef({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD'
})

console.log('Current commit:', oid)
```

### Example 4: Resolve Symbolic Ref

```typescript
// Resolve symbolic ref (e.g., HEAD -> refs/heads/main)
const symbolicRef = await resolveRef({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD',
  depth: 1  // Follow one level of indirection
})

console.log('Symbolic ref:', symbolicRef)
// 'refs/heads/main'
```

### Example 5: Resolve Full Ref Path

```typescript
// Resolve full ref path
const oid = await resolveRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/heads/main'
})

console.log('OID:', oid)
```

### Example 6: Resolve Short OID

```typescript
// Resolve short OID (if unique)
const fullOid = await resolveRef({
  fs,
  dir: '/path/to/repo',
  ref: 'abc123'  // Short OID
})

console.log('Full OID:', fullOid)
```

## API Reference

### `resolveRef(options)`

Resolve a reference to OID or symbolic ref.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Reference to resolve (required)
  - Can be: branch name, tag name, full ref path, short OID, or special refs like `'HEAD'`
- `depth` - How many symbolic references to follow (optional)
  - If not provided, resolves to final OID
  - If provided, stops after that many levels
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - OID or symbolic ref value

## How It Works

1. **Checks ref type** (symbolic or direct)
2. **Follows symbolic refs** if needed
3. **Resolves to OID** or returns symbolic ref value
4. **Respects depth limit** if specified

## Common Ref Formats

### Branch Names

```typescript
await resolveRef({ fs, dir, ref: 'main' })
await resolveRef({ fs, dir, ref: 'feature-branch' })
```

### Full Ref Paths

```typescript
await resolveRef({ fs, dir, ref: 'refs/heads/main' })
await resolveRef({ fs, dir, ref: 'refs/tags/v1.0.0' })
await resolveRef({ fs, dir, ref: 'refs/remotes/origin/main' })
```

### Special Refs

```typescript
await resolveRef({ fs, dir, ref: 'HEAD' })
await resolveRef({ fs, dir, ref: 'HEAD~1' })
await resolveRef({ fs, dir, ref: 'HEAD^' })
```

### OIDs

```typescript
await resolveRef({ fs, dir, ref: 'abc123...' })  // Full OID
await resolveRef({ fs, dir, ref: 'abc123' })    // Short OID (if unique)
```

## Best Practices

### 1. Use for OID Resolution

```typescript
// ✅ Good: Use resolveRef to get OID
const commitOid = await resolveRef({ fs, dir, ref: 'main' })
await readCommit({ fs, dir, oid: commitOid })

// ⚠️ More complex: Use readObject with ref
const result = await readObject({ fs, dir, oid: 'main' })
```

### 2. Handle Errors

```typescript
// ✅ Good: Handle NotFoundError
try {
  const oid = await resolveRef({ fs, dir, ref: 'nonexistent' })
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Ref not found')
  } else {
    throw error
  }
}
```

## Limitations

1. **Short OIDs**: Must be unique (ambiguous short OIDs will fail)
2. **Symbolic Depth**: May need to specify depth for complex symbolic refs

## See Also

- [Expand Ref](./expand-ref.md) - Expand abbreviated refs
- [Expand OID](./expand-oid.md) - Expand short OIDs
- [Write Ref](./write-ref.md) - Write refs

