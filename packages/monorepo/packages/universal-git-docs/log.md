---
title: Log
sidebar_label: log
---

# log

Get commit history, walking backwards through the commit graph.

## Overview

The `log` command:
- Walks backwards through commit history
- Returns commit information (OID, message, author, date)
- Can filter by file path
- Supports depth limiting
- Supports date filtering
- Can follow file renames

## Basic Usage

```typescript
import { log } from 'universal-git'

// Get recent commits
const commits = await log({
  fs,
  dir: '/path/to/repo',
  depth: 10
})

console.log(commits)
// [
//   {
//     oid: 'abc123...',
//     message: 'Initial commit',
//     author: { name: 'John Doe', email: 'john@example.com' },
//     ...
//   },
//   ...
// ]
```

## Examples

### Example 1: Recent Commits

```typescript
// Get last 10 commits
const commits = await log({
  fs,
  dir: '/path/to/repo',
  depth: 10
})

for (const commit of commits) {
  console.log(`${commit.oid.substring(0, 7)}: ${commit.message}`)
}
```

### Example 2: Commits for Specific Branch

```typescript
// Get commits from a specific branch
const commits = await log({
  fs,
  dir: '/path/to/repo',
  ref: 'feature-branch',
  depth: 20
})
```

### Example 3: Commits for Specific File

```typescript
// Get commit history for a file
const commits = await log({
  fs,
  dir: '/path/to/repo',
  filepath: 'src/index.ts',
  depth: 10
})

// Shows commits that modified src/index.ts
```

### Example 4: Follow File Renames

```typescript
// Follow file through renames
const commits = await log({
  fs,
  dir: '/path/to/repo',
  filepath: 'src/index.ts',
  follow: true  // Follow renames
})
```

### Example 5: Commits Since Date

```typescript
// Get commits since a specific date
const commits = await log({
  fs,
  dir: '/path/to/repo',
  since: new Date('2024-01-01'),
  depth: 100
})

// Shows commits from 2024 onwards
```

### Example 6: All Commits

```typescript
// Get all commits (no depth limit)
const commits = await log({
  fs,
  dir: '/path/to/repo',
  ref: 'HEAD'
})

console.log(`Total commits: ${commits.length}`)
```

## API Reference

### `log(options)`

Get commit history.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `ref` - Starting point for log walk (optional, default: `'HEAD'`)
- `filepath` - Filter commits by file path (optional)
- `depth` - Limit number of commits returned (optional)
- `since` - Return commits newer than this date (optional)
- `follow` - Follow file renames (optional, default: `false`, only for single file)
- `force` - Don't throw error if filepath doesn't exist (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<ReadCommitResult[]>` - Array of commit information

**ReadCommitResult:**
```typescript
{
  oid: string                    // Commit OID
  message: string                // Commit message
  tree: string                   // Tree OID
  parent: string[]               // Parent commit OIDs
  author: {
    name: string
    email: string
    timestamp: number
    timezoneOffset: string
  }
  committer: {
    name: string
    email: string
    timestamp: number
    timezoneOffset: string
  }
  gpgsig?: string                // GPG signature (if signed)
}
```

## How Log Works

1. **Starts from the ref** (default: HEAD)
2. **Walks backwards** through parent commits
3. **Filters by file path** (if provided)
4. **Stops when**:
   - Depth limit reached (if specified)
   - Date limit reached (if `since` specified)
   - No more parents (reached root commit)
5. **Returns commits** in chronological order (oldest first)

## Common Patterns

### Get Latest Commit

```typescript
// Get the most recent commit
const commits = await log({
  fs,
  dir: '/path/to/repo',
  depth: 1
})

const latest = commits[0]
console.log('Latest commit:', latest.oid)
```

### Get Commit Range

```typescript
// Get commits between two refs
const allCommits = await log({ fs, dir, ref: 'main' })
const featureCommits = await log({ fs, dir, ref: 'feature-branch' })

// Find commits in feature-branch but not in main
const uniqueCommits = featureCommits.filter(
  fc => !allCommits.some(ac => ac.oid === fc.oid)
)
```

### Find Commits by Author

```typescript
// Get commits and filter by author
const commits = await log({ fs, dir, depth: 100 })
const myCommits = commits.filter(
  c => c.author.email === 'john@example.com'
)
```

### Find Commits by Message

```typescript
// Search commit messages
const commits = await log({ fs, dir, depth: 100 })
const bugfixCommits = commits.filter(
  c => c.message.toLowerCase().includes('fix')
)
```

## Best Practices

### 1. Use Depth Limit for Performance

```typescript
// ✅ Good: Limit depth for better performance
const commits = await log({ fs, dir, depth: 50 })

// ⚠️ Careful: No limit can be slow for large repos
const commits = await log({ fs, dir })
```

### 2. Filter by File When Needed

```typescript
// ✅ Good: Filter by file for specific history
const commits = await log({
  fs,
  dir,
  filepath: 'src/index.ts',
  depth: 20
})

// ❌ Less efficient: Get all commits then filter
const allCommits = await log({ fs, dir, depth: 1000 })
const fileCommits = allCommits.filter(/* ... */)
```

### 3. Use Since for Date Ranges

```typescript
// Get commits from last week
const weekAgo = new Date()
weekAgo.setDate(weekAgo.getDate() - 7)

const commits = await log({
  fs,
  dir,
  since: weekAgo
})
```

## Limitations

1. **Performance**: Walking entire history can be slow for large repositories
2. **Memory**: Large commit lists consume memory
3. **Rename Following**: Basic rename detection, may miss complex renames

## Troubleshooting

### No Commits Found

If no commits are returned:

```typescript
// Check if repository has commits
const commits = await log({ fs, dir, depth: 1 })
if (commits.length === 0) {
  console.log('Repository has no commits')
}
```

### File Not Found

If filepath doesn't exist:

```typescript
// Use force to avoid error
const commits = await log({
  fs,
  dir,
  filepath: 'nonexistent.txt',
  force: true
})

// Returns empty array if file never existed
```

## See Also

- [Commit](./commit.md) - Create commits
- [Diff](./diff.md) - Show differences
- [Show](./show.md) - Show commit details


