---
title: Reflog
sidebar_label: Reflog
---

# Reflog

The reflog is Git's safety net. It records every change to the tip of a branch or any other reference, allowing you to recover from mistakes and understand the history of your repository.

## Overview

Reflog features:
- **Automatic Logging**: Entries are created automatically for all ref updates
- **Recovery**: Recover lost commits and branches
- **History**: See the history of ref changes
- **Configurable**: Respects `core.logAllRefUpdates` setting

## Basic Usage

### Read Reflog

```typescript
import { readLog } from 'universal-git/git/logs'

// Read reflog as raw strings
const entries = await readLog({
  fs,
  gitdir: '/path/to/.git',
  ref: 'refs/heads/main'
})

console.log(entries)
// [
//   'abc123... def456... John Doe <john@example.com> 1262356920 -0500 commit: Initial commit',
//   ...
// ]

// Read reflog as parsed objects
const parsedEntries = await readLog({
  fs,
  gitdir: '/path/to/.git',
  ref: 'refs/heads/main',
  parsed: true
})

console.log(parsedEntries)
// [
//   {
//     oldOid: 'abc123...',
//     newOid: 'def456...',
//     author: 'John Doe <john@example.com>',
//     timestamp: 1262356920,
//     timezoneOffset: '-0500',
//     message: 'commit: Initial commit'
//   },
//   ...
// ]
```

### Recover Lost Commits

```typescript
import { recoverRef } from 'universal-git/git/logs'

// Recover a ref from reflog
const recoveredOid = await recoverRef({
  fs,
  gitdir: '/path/to/.git',
  ref: 'refs/heads/main',
  reflogIndex: 0  // 0 = most recent (HEAD@{0})
})

console.log('Recovered OID:', recoveredOid)
```

## Examples

### Example 1: View Reflog History

```typescript
import { readLog } from 'universal-git/git/logs'

// Read HEAD reflog
const entries = await readLog({
  fs,
  gitdir: '/path/to/.git',
  ref: 'HEAD',
  parsed: true
})

// Display in reverse order (newest first, like Git)
entries.reverse().forEach((entry, index) => {
  console.log(`HEAD@{${index}}: ${entry.message}`)
  console.log(`  Old: ${entry.oldOid}`)
  console.log(`  New: ${entry.newOid}`)
  console.log(`  Date: ${new Date(entry.timestamp * 1000).toLocaleString()}`)
})
```

### Example 2: Find Lost Commits

```typescript
import { listRecoverableRefs, recoverRef } from 'universal-git/git/logs'

// Find refs that can be recovered
const recoverableRefs = await listRecoverableRefs({
  fs,
  gitdir: '/path/to/.git'
})

console.log('Recoverable refs:', recoverableRefs)

// Recover a lost branch
if (recoverableRefs.includes('refs/heads/lost-branch')) {
  const oid = await recoverRef({
    fs,
    gitdir: '/path/to/.git',
    ref: 'refs/heads/lost-branch',
    reflogIndex: 0
  })
  
  // Restore the branch
  await writeRef({
    fs,
    gitdir: '/path/to/.git',
    ref: 'refs/heads/lost-branch',
    value: oid
  })
}
```

### Example 3: Expire Old Reflog Entries

```typescript
import { expireLog } from 'universal-git/git/logs'

// Expire old reflog entries
const result = await expireLog({
  fs,
  gitdir: '/path/to/.git',
  ref: 'refs/heads/main',
  expireDays: 90,              // Remove entries older than 90 days
  expireUnreachableDays: 30,   // Remove unreachable entries older than 30 days
  cache: {}
})

console.log(`Expired ${result.expired} entries`)
```

## API Reference

### `readLog(options)`

Reads reflog entries for a ref.

**Parameters:**
- `fs` - File system client (required)
- `gitdir` - Git directory (required)
- `ref` - Reference to read reflog for (required)
- `parsed` - Return parsed objects instead of strings (optional, default: `false`)
- `cache` - Cache object (optional)

**Returns:**
- `Promise<string[] | ReflogEntry[]>` - Array of reflog entries

**ReflogEntry:**
```typescript
{
  oldOid: string        // Previous OID (or '0000000...' for new refs)
  newOid: string        // New OID (or '0000000...' for deletions)
  author: string        // Author name and email
  timestamp: number      // Unix timestamp (seconds)
  timezoneOffset: string // Timezone offset (e.g., '-0500')
  message: string       // Descriptive message
}
```

### `recoverRef(options)`

Recovers a lost ref from a reflog entry.

**Parameters:**
- `fs` - File system client (required)
- `gitdir` - Git directory (required)
- `ref` - Reference to recover (required)
- `reflogIndex` - Index in reflog (0 = most recent) (required)
- `cache` - Cache object (optional)

**Returns:**
- `Promise<string>` - Recovered OID

### `expireLog(options)`

Expires old reflog entries.

**Parameters:**
- `fs` - File system client (required)
- `gitdir` - Git directory (required)
- `ref` - Reference to expire (required)
- `expireDays` - Days before expiration (optional, default: 90)
- `expireUnreachableDays` - Days for unreachable entries (optional, default: 30)
- `cache` - Cache object (optional)

**Returns:**
- `Promise<{ expired: number }>` - Number of expired entries

### `listRecoverableRefs(options)`

Lists refs that can be recovered from reflog.

**Parameters:**
- `fs` - File system client (required)
- `gitdir` - Git directory (required)

**Returns:**
- `Promise<string[]>` - Array of recoverable ref paths

## When Reflog Entries Are Created

Reflog entries are automatically created for:
- ✅ Commits (`commit:`)
- ✅ Branch creation (`branch: Created from...`)
- ✅ Branch deletion (`branch: Deleted...`)
- ✅ Checkout operations (`checkout: moving from...`)
- ✅ Merge operations (`merge: Merged...`)
- ✅ Rebase operations (`rebase: rebasing...`)
- ✅ Reset operations (`reset: moving to...`)
- ✅ Tag operations (`tag: tagging...`)
- ✅ And more...

## Configuration

### Enable/Disable Reflog

Reflog is controlled by `core.logAllRefUpdates`:

```typescript
import { setConfig } from 'universal-git'

// Enable reflog (default for non-bare repos)
await setConfig({
  fs,
  gitdir,
  path: 'core.logAllRefUpdates',
  value: 'true'
})

// Disable reflog
await setConfig({
  fs,
  gitdir,
  path: 'core.logAllRefUpdates',
  value: 'false'
})
```

### Expiration Configuration

```typescript
// Configure expiration
await setConfig({
  fs,
  gitdir,
  path: 'gc.reflogExpire',
  value: '90.days'
})

await setConfig({
  fs,
  gitdir,
  path: 'gc.reflogExpireUnreachable',
  value: '30.days'
})
```

## Reflog Format

Each reflog entry is a single line:

```
<old-oid> <new-oid> <author> <timestamp> <timezone-offset> <message>
```

**Example:**
```
0000000000000000000000000000000000000000 abc123def4567890123456789012345678901234 John Doe <john@example.com> 1262356920 -0500 commit: Initial commit
```

## Best Practices

### 1. Use Reflog for Recovery

```typescript
// Before deleting a branch, check reflog
const reflog = await readLog({ fs, gitdir, ref: 'refs/heads/feature-branch' })
console.log('Branch history:', reflog)

// Then delete if safe
await deleteRef({ fs, gitdir, ref: 'refs/heads/feature-branch' })
```

### 2. Expire Old Entries Periodically

```typescript
// Expire old reflog entries to save space
const result = await expireLog({
  fs,
  gitdir,
  ref: 'refs/heads/main',
  expireDays: 90
})
```

### 3. Check Reflog Before Force Operations

```typescript
// Check reflog before force push
const reflog = await readLog({ fs, gitdir, ref: 'refs/heads/main' })
console.log('Current state:', reflog[reflog.length - 1])

// Then proceed with force operation
```

## Limitations

1. **Bare Repositories**: Reflog may be disabled by default
2. **Storage**: Reflog files can grow large over time
3. **Expiration**: Old entries are automatically expired by Git GC

## Troubleshooting

### Reflog Not Found

If reflog doesn't exist:

1. Check if reflog is enabled:
   ```typescript
   const enabled = await getConfig({ fs, gitdir, path: 'core.logAllRefUpdates' })
   console.log('Reflog enabled:', enabled)
   ```

2. Verify ref exists:
   ```typescript
   const oid = await readRef({ fs, gitdir, ref: 'refs/heads/main' })
   console.log('Ref OID:', oid)
   ```

### Cannot Recover Ref

If recovery fails:

1. Check reflog has entries:
   ```typescript
   const entries = await readLog({ fs, gitdir, ref: 'refs/heads/lost-branch' })
   console.log('Entries:', entries.length)
   ```

2. Verify reflogIndex is valid:
   ```typescript
   // Use valid index (0 to entries.length - 1)
   await recoverRef({ fs, gitdir, ref: 'refs/heads/lost-branch', reflogIndex: 0 })
   ```

## See Also

- [Ref Writing Architecture](./ARCHITECTURE_REF_WRITING.md) - How refs work
- [Reset](./reset.md) - Reset operations
- [Checkout](./checkout.md) - Checkout operations

