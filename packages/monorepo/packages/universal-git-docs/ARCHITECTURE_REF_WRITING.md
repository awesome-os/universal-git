# Ref Writing Architecture

**Status**: ✅ **COMPLETE** - Centralized ref writing architecture fully implemented  
**Last Updated**: 2025-01-XX

## Overview

All Git reference (ref) operations in `universal-git` must go through centralized functions in `src/git/refs/` to ensure consistency, reflog tracking, locking, validation, and state management.

## Architecture Principle

> **Single Source of Truth**: All ref operations (read, write, delete, list) must go through `src/git/refs/` functions. Backend abstractions are for Git object storage only, not ref management. This ensures reflog, locking, validation, and state tracking work consistently across all code paths.

## Centralized Functions

### Core Ref Functions

- **`src/git/refs/writeRef.ts`** - Main ref writing function
  - `writeRef()` - Writes a direct ref (OID) to a ref file
  - `writeSymbolicRef()` - Writes a symbolic ref (e.g., `ref: refs/heads/main`)
  - Automatically creates reflog entries via `logRefUpdate()`
  - Handles file locking to prevent concurrent writes
  - Validates OID format before writing

- **`src/git/refs/readRef.ts`** - Ref reading functions
  - `readRef()` - Reads a ref (handles both direct and symbolic refs)
  - `resolveRef()` - Resolves a ref to its final OID
  - `listRefs()` - Lists all refs in a repository

- **`src/git/refs/deleteRef.ts`** - Ref deletion function
  - `deleteRef()` - Deletes a ref and updates packed-refs if needed
  - Handles reflog cleanup

### Reflog Functions

- **`src/git/logs/logRefUpdate.ts`** - Reflog entry creation
  - `logRefUpdate()` - Creates reflog entries for ref updates
  - Called automatically by `writeRef()` and `writeSymbolicRef()`
  - Handles reflog configuration (enabled/disabled)

## Entry Points

All ref operations should use one of these entry points:

1. **Commands Layer** (`src/commands/`)
   - `src/commands/writeRef.ts` - Public API, delegates to centralized functions
   - `src/commands/clone.ts` - Uses `writeRef`/`writeSymbolicRef` directly
   - `src/commands/commit.ts` - Uses `repo.writeRef()` or `writeRef` directly
   - `src/commands/reset.ts` - Uses `writeRef` from commands
   - `src/commands/checkout.ts` - Uses `repo.writeRefDirect()`/`writeSymbolicRefDirect()`
   - And many more...

2. **Repository Layer** (`src/core-utils/Repository.ts`)
   - `writeRefDirect()` - Delegates to centralized `writeRef`
   - `writeSymbolicRefDirect()` - Delegates to centralized `writeSymbolicRef`

3. **RefManager** (`src/core-utils/refs/RefManager.ts`)
   - `writeRef()` - Delegates to centralized `writeRef`
   - `writeSymbolicRef()` - Delegates to centralized `writeSymbolicRef`

## Backend Abstraction

**Important**: Backend abstractions (`GitBackend`, `FilesystemBackend`, `SQLiteBackend`, `InMemoryBackend`) do **NOT** handle ref operations.

### Removed Methods

The following methods have been **removed** from the `GitBackend` interface:

- ❌ `readRef()` - Use `src/git/refs/readRef.ts` instead
- ❌ `writeRef()` - Use `src/git/refs/writeRef.ts` instead
- ❌ `deleteRef()` - Use `src/git/refs/deleteRef.ts` instead
- ❌ `listRefs()` - Use `src/git/refs/readRef.ts` instead
- ❌ `hasRef()` - Use `src/git/refs/readRef.ts` instead
- ❌ `readPackedRefs()` - Use `src/git/refs/readRef.ts` instead
- ❌ `writePackedRefs()` - Use `src/git/refs/deleteRef.ts` instead

### Why Backends Don't Handle Refs

1. **Reflog**: Reflog entries must be created for every ref update. Backend methods bypass this.
2. **Locking**: Ref writes need file locking to prevent concurrent modifications.
3. **Validation**: OID format validation must happen before writing.
4. **State Tracking**: Centralized functions maintain consistent state across all operations.

## Special Cases

### Packed Refs

The `packed-refs` file is a bulk storage format that doesn't require reflog entries. Direct writes to `packed-refs` are acceptable in these cases:

- `src/git/refs/deleteRef.ts:61` - Updates `packed-refs` when deleting refs
- `src/commands/clone.ts:342` - Copies `packed-refs` from source repository

### Bulk Ref Copy

When cloning from a local source with many refs, `clone.ts` uses `copyDirectory()` for performance:

- `src/commands/clone.ts:340` - Bulk copy of refs directory
- **Note**: This bypasses reflog creation, but native Git also doesn't create reflog entries during clone. Reflog entries are created on first update.

## Testing

### Reflog Verification

All ref-writing operations should verify reflog entries are created:

```typescript
import { verifyReflogEntry } from '../../packages/test-helpers/helpers/reflogHelpers.ts'

// After a ref write operation
await verifyReflogEntry({
  fs,
  gitdir,
  ref: 'refs/heads/main',
  oldOid: 'previous-oid',
  newOid: 'new-oid',
  message: 'commit: Update file',
})
```

### Backend Method Tests

Backend ref methods should verify they throw errors:

```typescript
await assert.rejects(
  async () => await backend.writeRef('refs/heads/main', 'abc123'),
  /Ref operations must use centralized functions/
)
```

## Migration Guide

If you're working with refs in existing code:

1. **Replace backend calls**:
   ```typescript
   // ❌ OLD - Don't use
   await backend.writeRef('refs/heads/main', oid)
   
   // ✅ NEW - Use centralized function
   import { writeRef } from '../git/refs/writeRef.ts'
   await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: oid })
   ```

2. **Replace direct filesystem writes**:
   ```typescript
   // ❌ OLD - Don't use
   await fs.write(join(gitdir, 'refs/heads/main'), oid)
   
   // ✅ NEW - Use centralized function
   await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: oid })
   ```

3. **Use Repository methods** (if available):
   ```typescript
   // ✅ GOOD - Repository delegates to centralized functions
   await repo.writeRefDirect('refs/heads/main', oid)
   ```

## Enforcement

### TypeScript

- Backend interface no longer includes ref methods
- TypeScript compilation will fail if you try to use removed methods

### Runtime

- Backend methods throw errors with helpful messages directing to centralized functions
- All ref operations are validated before execution

### Testing

- Tests verify reflog entries are created for ref operations
- Tests verify backend methods throw errors when called

## References

- Main ref writing function: `src/git/refs/writeRef.ts`
- Backend interface: `src/backends/GitBackend.ts`
- Reflog implementation: `src/git/logs/logRefUpdate.ts`
- Test helpers: `packages/test-helpers/helpers/reflogHelpers.ts`

