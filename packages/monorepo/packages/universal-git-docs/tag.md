---
title: Tag
sidebar_label: tag
---

# tag

Create lightweight tags pointing to specific commits.

## Overview

The `tag` command:
- Creates lightweight tags
- Points tags to specific commits
- Supports force creation (overwrite existing)
- Can tag any commit, not just HEAD

## Basic Usage

```typescript
import { tag } from 'universal-git'

// Create a tag
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})
```

## Examples

### Example 1: Create Tag from HEAD

```typescript
// Create a tag pointing to current HEAD
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})
```

### Example 2: Tag Specific Commit

```typescript
// Tag a specific commit
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  object: 'abc123...'  // Tag this commit
})
```

### Example 3: Force Tag

```typescript
// Overwrite existing tag
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0',
  force: true  // Overwrite if exists
})
```

### Example 4: Tag from Branch

```typescript
// Tag the tip of a branch
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'release-1.0.0',
  object: 'main'  // Tag main branch tip
})
```

### Example 5: Tag Previous Commit

```typescript
// Tag a previous commit
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v0.9.0',
  object: 'HEAD~1'  // Tag previous commit
})
```

## API Reference

### `tag(options)`

Create a lightweight tag.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Tag name (required)
- `object` - Commit OID or ref to tag (optional, default: `'HEAD'`)
- `force` - Overwrite existing tag (optional, default: `false`)

**Returns:**

- `Promise<void>` - Resolves when tag is created

## How Tag Works

1. **Resolves the object** to a commit OID (default: HEAD)
2. **Validates tag name** (must be valid ref name)
3. **Checks if tag exists** (throws error unless `force: true`)
4. **Creates tag ref** in `refs/tags/` pointing to the commit
5. **Records in reflog** (if enabled)

## Tag Types

### Lightweight Tags

Lightweight tags are simple refs pointing to commits:

```typescript
// Create lightweight tag
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})
```

**Note**: Universal-git currently supports lightweight tags. Annotated tags (with messages) are created using `writeTag` command.

## Tag Naming

Tag names must be valid Git ref names:

```typescript
// ✅ Valid tag names
await tag({ fs, dir, ref: 'v1.0.0' })
await tag({ fs, dir, ref: 'release-1.0.0' })
await tag({ fs, dir, ref: 'beta-1' })

// ❌ Invalid tag names
await tag({ fs, dir, ref: 'v1.0.0 tag' })  // Spaces not allowed
await tag({ fs, dir, ref: 'v1..0' })  // Double dots not allowed
```

## Best Practices

### 1. Use Semantic Versioning

```typescript
// ✅ Good: Semantic versioning
await tag({ fs, dir, ref: 'v1.0.0' })
await tag({ fs, dir, ref: 'v1.1.0' })
await tag({ fs, dir, ref: 'v2.0.0' })

// ⚠️ Also works: Custom naming
await tag({ fs, dir, ref: 'release-2024-01-15' })
```

### 2. Tag Releases

```typescript
// Tag after creating release commit
await commit({ fs, dir, message: 'Release v1.0.0' })
await tag({ fs, dir, ref: 'v1.0.0' })
```

### Example 3: Tag Specific Commits

```typescript
// Tag important commits
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'milestone-alpha',
  object: 'abc123...'  // Tag specific commit
})
```

## Common Patterns

### Tag Current Release

```typescript
// Tag the current HEAD as a release
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v1.0.0'
})
```

### Tag Previous Release

```typescript
// Tag a previous commit as a release
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'v0.9.0',
  object: 'HEAD~5'  // Tag 5 commits ago
})
```

### Tag Branch Tip

```typescript
// Tag the tip of a branch
await tag({
  fs,
  dir: '/path/to/repo',
  ref: 'release-candidate',
  object: 'feature-branch'
})
```

## Limitations

1. **Lightweight Only**: Currently supports lightweight tags only
2. **Tag Name Validation**: Must be valid Git ref name
3. **Existing Tags**: Cannot create if exists (unless `force: true`)

## Troubleshooting

### Tag Already Exists

If tag already exists:

```typescript
try {
  await tag({ fs, dir, ref: 'v1.0.0' })
} catch (error) {
  if (error.code === 'AlreadyExistsError') {
    // Use force to overwrite
    await tag({ fs, dir, ref: 'v1.0.0', force: true })
    // Or use a different tag name
    await tag({ fs, dir, ref: 'v1.0.1' })
  }
}
```

### Invalid Tag Name

If tag name is invalid:

```typescript
try {
  await tag({ fs, dir, ref: 'invalid tag name' })
} catch (error) {
  if (error.code === 'InvalidRefNameError') {
    console.log('Tag name is invalid')
    // Use valid name
    await tag({ fs, dir, ref: 'valid-tag-name' })
  }
}
```

## See Also

- [List Tags](./list-tags.md) - List all tags
- [Delete Tag](./delete-tag.md) - Delete tags
- [Write Tag](./write-tag.md) - Create annotated tags


