---
title: Annotated Tag
sidebar_label: annotatedTag
---

# annotatedTag

Create an annotated tag (higher-level than `writeTag`).

## Overview

The `annotatedTag` command:
- Creates annotated tags with a simpler API than `writeTag`
- Automatically creates the tag ref
- Supports signing
- Can overwrite existing tags

## Basic Usage

```typescript
import { annotatedTag } from 'universal-git'

// Create an annotated tag
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  message: 'Release version 1.0.0'
})
```

## Examples

### Example 1: Create Simple Tag

```typescript
// Create annotated tag
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  message: 'Release version 1.0.0'
})
```

### Example 2: Tag Specific Commit

```typescript
// Tag a specific commit
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  object: 'abc123...',  // Commit OID
  message: 'Release version 1.0.0'
})
```

### Example 3: Tag with Tagger Info

```typescript
// Tag with custom tagger
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  message: 'Release version 1.0.0',
  tagger: {
    name: 'John Doe',
    email: 'john@example.com',
    timestamp: Math.floor(Date.now() / 1000),
    timezoneOffset: new Date().getTimezoneOffset()
  }
})
```

### Example 4: Signed Tag

```typescript
// Create signed tag
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  message: 'Release version 1.0.0',
  signingKey: privateKey,
  onSign: signCallback
})
```

### Example 5: Force Overwrite

```typescript
// Overwrite existing tag
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  message: 'Updated release',
  force: true  // Overwrite existing
})
```

## API Reference

### `annotatedTag(options)`

Create an annotated tag.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Tag name (required)
- `message` - Tag message (optional, default: tag name)
- `object` - Object to tag (optional, default: `'HEAD'`)
- `tagger` - Tagger information (optional)
- `gpgsig` - GPG signature (optional, mutually exclusive with `signingKey`)
- `signingKey` - Signing key (optional, mutually exclusive with `gpgsig`)
- `onSign` - Sign callback (optional)
- `force` - Overwrite existing tag (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<void>` - Resolves when tag is created

## Comparison with writeTag

### annotatedTag (Higher-Level)

```typescript
// ✅ Simpler API
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  message: 'Release'
})
// Automatically creates tag object and ref
```

### writeTag (Lower-Level)

```typescript
// ⚠️ More control, more complex
const tagOid = await writeTag({
  fs,
  dir: '/path/to/repo',
  tag: {
    object: commitOid,
    type: 'commit',
    tag: 'v1.0.0',
    tagger: {...},
    message: 'Release'
  }
})
// Then create ref separately
await writeRef({
  fs,
  dir: '/path/to/repo',
  ref: 'refs/tags/v1.0.0',
  value: tagOid
})
```

## Best Practices

### 1. Use for Release Tags

```typescript
// ✅ Good: Use annotatedTag for releases
await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  message: 'Release version 1.0.0'
})
```

### 2. Tag After Commit

```typescript
// ✅ Good: Tag after creating release commit
const commitOid = await commit({
  fs,
  dir: '/path/to/repo',
  message: 'Release v1.0.0'
})

await annotatedTag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  object: commitOid,
  message: 'Release version 1.0.0'
})
```

## Limitations

1. **Annotated Only**: Creates annotated tags (not lightweight)
2. **Single Tag**: Creates one tag at a time

## See Also

- [Tag](./tag.md) - Create lightweight tags
- [Write Tag](./write-tag.md) - Lower-level tag creation
- [Read Tag](./read-tag.md) - Read annotated tags

