---
title: Expand Ref
sidebar_label: expandRef
---

# expandRef

Expands a short reference name to its full form (e.g., `main` → `refs/heads/main`).

## Overview

`expandRef` allows you to:
- Use short branch/tag names instead of full ref paths
- Resolve ambiguous ref names
- Find refs by prefix

## Basic Usage

```typescript
import { expandRef } from 'universal-git'

// Expand short ref name
const fullRef = await expandRef({
  fs,
  gitdir: '/path/to/.git',
  ref: 'main'  // Short ref name
})

console.log(fullRef) // 'refs/heads/main'
```

## Examples

### Example 1: Expand Branch Name

```typescript
// Expand branch name
const fullRef = await expandRef({
  fs,
  gitdir: '/path/to/.git',
  ref: 'feature-branch'
})

console.log(fullRef) // 'refs/heads/feature-branch'
```

### Example 2: Expand Tag Name

```typescript
// Expand tag name
const fullRef = await expandRef({
  fs,
  gitdir: '/path/to/.git',
  ref: 'v1.0.0'
})

console.log(fullRef) // 'refs/tags/v1.0.0'
```

### Example 3: Handle Ambiguous Refs

```typescript
try {
  const fullRef = await expandRef({
    fs,
    gitdir: '/path/to/.git',
    ref: 'test'  // Might match branch or tag
  })
  console.log('Unique ref:', fullRef)
} catch (error) {
  if (error.code === 'AmbiguousError') {
    console.log('Ref is ambiguous, multiple matches found')
    console.log('Matches:', error.data.matches)
  }
}
```

### Example 4: Use in Commands

```typescript
// Expand ref before using in commands
const shortRef = 'main'
const fullRef = await expandRef({ fs, gitdir, ref: shortRef })

// Use in checkout
await checkout({
  fs,
  dir: '/path/to/repo',
  ref: fullRef
})
```

## API Reference

### `expandRef(options)`

Expands a short reference name to its full form.

**Parameters:**

- `fs` - File system client (required)
- `gitdir` - Git directory (required)
- `ref` - Short ref name to expand (required)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<string>` - Full ref path

**Throws:**

- `AmbiguousError` - If multiple refs match the name
- `NotFoundError` - If no ref matches the name

## Ref Resolution Order

Refs are resolved in this order:
1. `refs/heads/<name>` - Local branches
2. `refs/tags/<name>` - Tags
3. `refs/remotes/<name>` - Remote-tracking branches
4. `refs/remotes/<remote>/<name>` - Remote-tracking branches
5. `refs/<name>` - Other refs

## Examples of Expansion

| Short Ref | Full Ref |
|-----------|----------|
| `main` | `refs/heads/main` |
| `v1.0.0` | `refs/tags/v1.0.0` |
| `origin/main` | `refs/remotes/origin/main` |
| `HEAD` | `refs/heads/main` (or current branch) |

## Best Practices

### 1. Use Full Refs When Possible

```typescript
// ✅ Good: Use full ref when you know it
await checkout({ fs, dir, ref: 'refs/heads/main' })

// ⚠️ Also works: Expand short ref
const fullRef = await expandRef({ fs, gitdir, ref: 'main' })
await checkout({ fs, dir, ref: fullRef })
```

### 2. Handle Ambiguity

```typescript
try {
  const fullRef = await expandRef({ fs, gitdir, ref: 'test' })
  // Use fullRef
} catch (error) {
  if (error.code === 'AmbiguousError') {
    // Use full ref path instead
    const fullRef = 'refs/heads/test'  // Explicit
    await checkout({ fs, dir, ref: fullRef })
  }
}
```

### 3. Check if Already Full

```typescript
// Check if ref is already full
const isFull = ref.startsWith('refs/')

if (isFull) {
  // Already full, use directly
  await checkout({ fs, dir, ref })
} else {
  // Expand first
  const fullRef = await expandRef({ fs, gitdir, ref })
  await checkout({ fs, dir, ref: fullRef })
}
```

## Limitations

1. **Ambiguity**: Short names may match multiple refs
2. **Performance**: Searching all refs can be slow for repositories with many refs
3. **Not Found**: Ref may not exist

## Troubleshooting

### Ambiguous Ref

If you get an ambiguous ref error:

```typescript
try {
  await expandRef({ fs, gitdir, ref: 'test' })
} catch (error) {
  if (error.code === 'AmbiguousError') {
    // Use full ref path
    const matches = error.data.matches
    console.log('Matches:', matches)
    // ['refs/heads/test', 'refs/tags/test']
    
    // Use explicit full ref
    const fullRef = 'refs/heads/test'
  }
}
```

### Ref Not Found

If ref doesn't exist:

```typescript
try {
  await expandRef({ fs, gitdir, ref: 'nonexistent' })
} catch (error) {
  if (error.code === 'NotFoundError') {
    console.log('Ref not found')
    // List available refs
    const refs = await listRefs({ fs, gitdir })
    console.log('Available refs:', refs)
  }
}
```

## See Also

- [Expand OID](./expand-oid.md) - Expand object IDs
- [Resolve Ref](./resolve-ref.md) - Resolve refs to OIDs
- [List Refs](./list-refs.md) - List all refs

