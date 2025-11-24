---
title: List Tags
sidebar_label: listTags
---

# listTags

List all tags in the repository.

## Overview

The `listTags` command:
- Lists all tags
- Returns tag names (not full ref paths)
- Works with lightweight and annotated tags

## Basic Usage

```typescript
import { listTags } from 'universal-git'

// List all tags
const tags = await listTags({
  fs,
  dir: '/path/to/repo'
})

console.log(tags)
// ['v1.0.0', 'v1.1.0', 'v2.0.0']
```

## Examples

### Example 1: List All Tags

```typescript
// List all tags
const tags = await listTags({
  fs,
  dir: '/path/to/repo'
})

console.log('Tags:', tags)
// ['v1.0.0', 'v1.1.0', 'v2.0.0']
```

### Example 2: Check if Tag Exists

```typescript
// Check if a tag exists
const tags = await listTags({ fs, dir: '/path/to/repo' })

if (tags.includes('v1.0.0')) {
  console.log('Tag exists')
} else {
  console.log('Tag does not exist')
}
```

### Example 3: Filter Tags

```typescript
// Filter tags by pattern
const tags = await listTags({ fs, dir: '/path/to/repo' })
const versionTags = tags.filter(tag => tag.startsWith('v'))

console.log('Version tags:', versionTags)
// ['v1.0.0', 'v1.1.0', 'v2.0.0']
```

### Example 4: Sort Tags

```typescript
// List and sort tags
const tags = await listTags({ fs, dir: '/path/to/repo' })
const sortedTags = tags.sort()

console.log('Sorted tags:', sortedTags)
```

## API Reference

### `listTags(options)`

List all tags in the repository.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)

**Returns:**

- `Promise<string[]>` - Array of tag names

## How It Works

1. **Lists refs** under `refs/tags/`
2. **Returns tag names** (without `refs/tags/` prefix)
3. **Includes all tags** (lightweight and annotated)

## Best Practices

### 1. Check Before Creating

```typescript
// Check if tag exists before creating
const tags = await listTags({ fs, dir: '/path/to/repo' })

if (!tags.includes('v1.0.0')) {
  await tag({ fs, dir: '/path/to/repo', ref: 'v1.0.0' })
} else {
  console.log('Tag already exists')
}
```

### 2. Use for Release Management

```typescript
// List tags to find latest release
const tags = await listTags({ fs, dir: '/path/to/repo' })
const versionTags = tags
  .filter(tag => /^v\d+\.\d+\.\d+$/.test(tag))
  .sort()
  .reverse()

const latestTag = versionTags[0]
console.log('Latest version:', latestTag)
```

## Limitations

1. **No Tags**: Returns empty array if no tags exist
2. **No Sorting**: Tags are returned in filesystem order (not sorted)

## Troubleshooting

### No Tags Found

If no tags are returned:

```typescript
const tags = await listTags({ fs, dir: '/path/to/repo' })
if (tags.length === 0) {
  console.log('Repository has no tags')
  // Create a tag
  await tag({ fs, dir: '/path/to/repo', ref: 'v1.0.0' })
}
```

## See Also

- [Tag](./tag.md) - Create tags
- [List Branches](./list-branches.md) - List branches
- [List Refs](./list-refs.md) - List all refs


