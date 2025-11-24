---
title: Submodules
sidebar_label: Submodules
---

# Submodules

Git submodules allow you to include one Git repository as a subdirectory of another Git repository.

## Overview

Submodules enable you to:
- Include external repositories in your project
- Track specific commits of submodule repositories
- Keep submodule repositories separate and independent
- Manage dependencies on other Git projects

**Note**: Submodule support is fully implemented. All standard Git submodule operations are available and tested.

## Basic Usage

### List Submodules

```typescript
import { submodule } from 'universal-git'

// List all submodules
const submodules = await submodule({
  fs,
  dir: '/path/to/repo'
})

console.log(submodules)
// [
//   { name: 'submodule-name', path: 'path/to/submodule', url: 'https://...' }
// ]
```

### Initialize Submodule

```typescript
// Initialize a submodule
await submodule({
  fs,
  dir: '/path/to/repo',
  init: true,
  name: 'submodule-name'
})
```

### Update Submodule

```typescript
// Update submodule to the commit specified in parent repository
await submodule({
  fs,
  dir: '/path/to/repo',
  update: true,
  name: 'submodule-name',
  http  // Required for cloning submodule
})
```

### Get Submodule Status

```typescript
// Get status of all submodules
const statuses = await submodule({
  fs,
  dir: '/path/to/repo',
  status: true
})

console.log(statuses)
// [
//   {
//     name: 'submodule-name',
//     path: 'path/to/submodule',
//     url: 'https://...',
//     expectedOid: 'abc123...',
//     actualOid: 'def456...',
//     status: 'mismatch'
//   }
// ]
```

### Sync Submodule URLs

```typescript
// Sync all submodule URLs from .gitmodules to .git/config
await submodule({
  fs,
  dir: '/path/to/repo',
  sync: true
})

// Sync a specific submodule URL
await submodule({
  fs,
  dir: '/path/to/repo',
  sync: true,
  name: 'submodule-name'
})
```

### Update Submodule URL

```typescript
// Update a submodule URL in .gitmodules
await submodule({
  fs,
  dir: '/path/to/repo',
  name: 'submodule-name',
  url: 'https://new-url.com/repo.git'
})
```

## Examples

### Example 1: Initialize All Submodules

```typescript
import { submodule, clone } from 'universal-git'

// List submodules
const submodules = await submodule({ fs, dir: '/path/to/repo' })

// Initialize each submodule
for (const sub of submodules) {
  await submodule({
    fs,
    dir: '/path/to/repo',
    init: true,
    name: sub.name
  })
}
```

### Example 2: Update All Submodules

```typescript
// Update all submodules
const submodules = await submodule({ fs, dir: '/path/to/repo' })

for (const sub of submodules) {
  await submodule({
    fs,
    dir: '/path/to/repo',
    update: true,
    name: sub.name,
    http
  })
}
```

### Example 3: Recursive Update

```typescript
// Update a specific submodule recursively (including nested submodules)
await submodule({
  fs,
  dir: '/path/to/repo',
  update: true,
  name: 'submodule-name',
  recursive: true,
  http
})

// Update all submodules recursively
const submodules = await submodule({ fs, dir: '/path/to/repo' })
for (const sub of submodules) {
  await submodule({
    fs,
    dir: '/path/to/repo',
    update: true,
    name: sub.name,
    recursive: true,
    http
  })
}
```

### Example 4: Sync Submodule URLs

```typescript
// Sync all submodule URLs from .gitmodules to .git/config
await submodule({
  fs,
  dir: '/path/to/repo',
  sync: true
})

// Sync a specific submodule URL
await submodule({
  fs,
  dir: '/path/to/repo',
  sync: true,
  name: 'submodule-name'
})
```

### Example 5: Check Submodule Status

```typescript
// Check if submodules are up to date
const statuses = await submodule({
  fs,
  dir: '/path/to/repo',
  status: true
})

for (const status of statuses) {
  if (status.status === 'mismatch') {
    console.log(`${status.name} is out of date`)
    console.log(`Expected: ${status.expectedOid}`)
    console.log(`Actual: ${status.actualOid}`)
  }
}
```

## API Reference

### `submodule(options)`

Manages Git submodules.

**Parameters:**

- `fs` - File system client (required)
- `dir` - Working tree directory (required)
- `gitdir` - Git directory (optional, defaults to `join(dir, '.git')`)
- `init` - Initialize submodule (boolean)
- `update` - Update submodule (boolean)
- `status` - Get submodule status (boolean)
- `sync` - Sync submodule URLs (boolean)
- `recursive` - Recursive operation (boolean, optional, for update)
- `name` - Submodule name (optional, for specific operations)
- `url` - Submodule URL (optional, for updating URL in .gitmodules)
- `http` - HTTP client (required for update operation)
- `cache` - Cache object (optional)

**Returns:**

- `Promise<SubmoduleInfo[] | SubmoduleStatus[] | { initialized: string } | { updated: string, commitOid?: string, url?: string } | { synced: Array<{ name: string, url: string }> } | void>` - Operation result

**Operations:**

1. **List** (default) - List all submodules
   - Returns array of submodule information
   - Reads from `.gitmodules` file
   - No operation flag needed (default behavior)

2. **`init`** - Initialize submodule
   - Copies submodule URL from `.gitmodules` to `.git/config`
   - Creates submodule directory structure
   - Does not clone the submodule repository
   - Requires `name` parameter

3. **`update`** - Update submodule to commit specified in parent
   - Clones submodule if it doesn't exist
   - Checks out the commit OID specified in parent's tree
   - Updates submodule to match parent's expected commit
   - Requires `name` and `http` parameters
   - Use `recursive: true` to update nested submodules

4. **`status`** - Get submodule status
   - Compares expected commit (from parent tree) with actual commit (from submodule HEAD)
   - Returns status: `'match'`, `'mismatch'`, `'uninitialized'`, or `'missing'`
   - Can check all submodules or a specific one (with `name`)

5. **`sync`** - Sync submodule URLs
   - Updates URLs in `.git/config` from `.gitmodules`
   - Also updates remote URL in initialized submodules
   - Can sync all submodules or a specific one (with `name`)

6. **Update URL** - Update submodule URL in `.gitmodules`
   - Updates the URL in `.gitmodules` file
   - Requires both `name` and `url` parameters

**SubmoduleInfo:**
```typescript
{
  name: string    // Submodule name
  path: string   // Path to submodule directory
  url: string    // Submodule repository URL
  branch?: string // Optional branch specification
}
```

**SubmoduleStatus:**
```typescript
{
  name: string
  path: string
  url: string
  expectedOid: string      // Commit OID expected by parent repository
  actualOid: string | null // Actual commit OID in submodule (null if uninitialized)
  status: 'uninitialized' | 'mismatch' | 'match' | 'missing'
}
```

**Status Values:**
- `'match'` - Submodule is at the correct commit
- `'mismatch'` - Submodule is at a different commit than expected
- `'uninitialized'` - Submodule directory or gitdir doesn't exist
- `'missing'` - Submodule entry not found in parent's tree

## How Submodules Work

### Directory Structure

When a submodule is initialized and updated:

```
/path/to/repo/
├── .git/
│   ├── modules/                    # Submodule repositories
│   │   └── path/
│   │       └── to/
│   │           └── submodule/     # Submodule's .git directory
│   │               ├── objects/
│   │               ├── refs/
│   │               └── config
│   ├── config                      # Parent repository config
│   └── index                       # Contains submodule entry
├── .gitmodules                     # Submodule configuration
└── path/
    └── to/
        └── submodule/              # Submodule working directory
            ├── .git                # File pointing to .git/modules/path/to/submodule
            └── ...                 # Submodule files
```

### .gitmodules File

Submodules are configured in `.gitmodules` at the repository root:

```ini
[submodule "submodule-name"]
    path = path/to/submodule
    url = https://github.com/user/repo.git
    branch = main                    # Optional: branch to track
```

The `.gitmodules` file:
- Defines all submodules in the repository
- Contains the canonical URL for each submodule
- Is version controlled (committed to the repository)
- Can be edited manually or via the API

### Submodule Storage

**Submodule Repository:**
- Stored in `.git/modules/<path>/` (where `<path>` is the submodule's path)
- Contains the complete Git repository for the submodule
- Includes objects, refs, config, and all Git data

**Working Directory:**
- Checked out in the parent repository at the submodule's path
- Contains the actual files from the submodule
- Has a `.git` file (not directory) pointing to `.git/modules/<path>/`

**Commit Reference:**
- Stored in the parent's index as a special entry (mode `160000`)
- The index entry's OID is the commit SHA that the submodule should be at
- Updated when you commit changes that include submodule updates

### Submodule Lifecycle

1. **Add Submodule** (manual or via external tool)
   - Add entry to `.gitmodules`
   - Add submodule entry to index (as special entry with commit OID)
   - Commit the changes

2. **Initialize** (`init: true`)
   - Copies URL from `.gitmodules` to `.git/config`
   - Creates directory structure
   - Does not clone the repository

3. **Update** (`update: true`)
   - Clones submodule repository if it doesn't exist
   - Checks out the commit OID specified in parent's tree
   - Creates `.git` file pointing to submodule's gitdir
   - If `recursive: true`, also updates nested submodules

4. **Status Check** (`status: true`)
   - Reads expected commit OID from parent's tree
   - Reads actual commit OID from submodule's HEAD
   - Compares and reports status

5. **Sync URLs** (`sync: true`)
   - Updates URLs in `.git/config` from `.gitmodules`
   - Updates remote URL in initialized submodules
   - Ensures URLs are consistent

### Submodule Entry in Index

Submodules are stored in the index with:
- **Mode**: `160000` (special mode for submodules)
- **OID**: The commit SHA that the submodule should be at
- **Path**: The submodule's path relative to repository root

This allows the parent repository to track which commit each submodule should be at.

## Best Practices

### 1. Initialize Before Update

```typescript
// ✅ Good: Initialize then update
await submodule({ fs, dir, init: true, name: 'submodule-name' })
await submodule({ fs, dir, update: true, name: 'submodule-name', http })

// ❌ Bad: Update without init
await submodule({ fs, dir, update: true, name: 'submodule-name', http })
```

### 2. Check Status Regularly

```typescript
// Check submodule status
const statuses = await submodule({ fs, dir, status: true })
for (const status of statuses) {
  if (status.status !== 'match') {
    console.warn(`${status.name} needs attention`)
  }
}
```

### 3. Use Recursive for Nested Submodules

```typescript
// Update all submodules including nested ones
await submodule({
  fs,
  dir: '/path/to/repo',
  update: true,
  recursive: true,
  http
})
```

## Behavior Details

### Initialization Behavior

When you initialize a submodule:
- The URL is copied from `.gitmodules` to `.git/config`
- Directory structure is created (but repository is not cloned)
- The submodule is ready to be updated

**Note**: Initialization does not clone the submodule. Use `update` to clone and checkout.

### Update Behavior

When you update a submodule:
- If submodule doesn't exist: clones it into `.git/modules/<path>/`
- Checks out the commit OID specified in parent's HEAD tree
- Creates `.git` file in submodule working directory
- If `recursive: true`: recursively updates nested submodules

**Important**: The submodule is checked out to the commit specified in the parent's current HEAD, not to the latest commit in the submodule's repository.

### Status Behavior

Status checking:
- Reads the expected commit OID from parent's HEAD tree
- Reads the actual commit OID from submodule's HEAD (if initialized)
- Compares them and reports:
  - `'match'` - Submodule is at correct commit
  - `'mismatch'` - Submodule is at different commit
  - `'uninitialized'` - Submodule not cloned/initialized
  - `'missing'` - Submodule entry not in parent's tree

### Recursive Behavior

When `recursive: true` is used with `update`:
- Updates the specified submodule
- Checks if submodule has its own `.gitmodules` file
- Recursively updates all nested submodules
- Continues even if nested submodule update fails (matches Git behavior)

### URL Sync Behavior

When syncing URLs:
- Updates `.git/config` from `.gitmodules` (overwrites existing)
- If submodule is initialized, also updates its `remote.origin.url`
- Ensures URLs are consistent across configuration files

## Troubleshooting

### Submodule Not Found

If a submodule is not found:

1. Check `.gitmodules` file:
   ```typescript
   const content = await fs.read(`${dir}/.gitmodules`, 'utf8')
   console.log(content)
   ```

2. Verify submodule name:
   ```typescript
   const submodules = await submodule({ fs, dir })
   console.log('Available submodules:', submodules.map(s => s.name))
   ```

### Submodule Out of Date

If submodule is out of date:

```typescript
// Check status
const statuses = await submodule({ fs, dir, status: true })

// Update if needed
for (const status of statuses) {
  if (status.status === 'mismatch' || status.status === 'uninitialized') {
    await submodule({
      fs,
      dir,
      update: true,
      name: status.name,
      http
    })
  }
}
```

### Submodule Update Fails

If update fails:

1. Check HTTP client is provided:
   ```typescript
   await submodule({
     fs,
     dir,
     update: true,
     name: 'submodule-name',
     http  // Must be provided
   })
   ```

2. Verify submodule URL is accessible

3. Check network connectivity

## See Also

- [Clone](./clone.md) - Clone repositories
- [Checkout](./checkout.md) - Checkout operations
- [Status](./status.md) - Check repository status

