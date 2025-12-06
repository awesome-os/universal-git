# HTTP Clone Requirements Analysis

## Overview

This document analyzes what features are missing to support HTTP clone operations in the `uvgit/typescript` implementation.

## ✅ What We Already Have

### Core Infrastructure
- ✅ **GitDir** - Main coordinator for Git directory access
- ✅ **Providers** - Modular provider system (FsProvider, ObjectsProvider, etc.)
- ✅ **Object Reading** - Can read loose objects and packed objects
- ✅ **Object Writing** - `GitDirObjectsProvider.write()` can write loose objects
- ✅ **Ref Reading** - `GitRefHandle` can read refs
- ✅ **Ref Writing** - `GitRefHandle.updateOid()` and `updateSymbolicRef()` exist
- ✅ **Packfile Reading** - Can read and parse packfiles, pack indices, MIDX
- ✅ **Config Reading** - Can read config via `GitDir.resolve('config')`

### Advanced Features
- ✅ **MIDX Support** - Multi-pack index for efficient lookups
- ✅ **Alternates** - Support for alternate object databases
- ✅ **Object Format Detection** - SHA-1 vs SHA-256 detection
- ✅ **Promisor Objects** - Partial clone support infrastructure

## ❌ What's Missing for HTTP Clone

### 1. HTTP Transport Layer (CRITICAL)

**Status**: ❌ Not Implemented

**What's Needed**:
- HTTP client integration for Git protocol over HTTP
- Support for Git HTTP protocol (smart HTTP)
- Capabilities negotiation (`git-upload-pack` service)
- Authentication handling (Basic Auth, OAuth, etc.)
- CORS proxy support
- Progress callbacks

**Reference**: `universal-git-src/remote/GitRemoteHTTP.ts`

**Files to Create**:
- `transport/GitHttpTransport.ts` - HTTP transport implementation
- `transport/GitProtocol.ts` - Protocol parsing utilities
- `transport/types.ts` - Transport types and interfaces

### 2. Packfile Writing (CRITICAL)

**Status**: ⚠️ Partial - Can write loose objects, but not packfiles

**What's Needed**:
- **Packfile Writing** - Write received packfiles to `objects/pack/pack-*.pack`
- **Pack Index Creation** - Generate `.idx` files from packfiles (`indexPack` equivalent)
- **Packfile Streaming** - Stream packfile data from HTTP response to disk
- **Delta Resolution** - Resolve deltas in packfiles (base objects, ref deltas)

**Current State**:
- ✅ Can read packfiles
- ✅ Can parse pack indices
- ❌ Cannot write packfiles
- ❌ Cannot create pack indices
- ❌ No delta resolution during write

**Reference**: `universal-git-src/git/backends/GitBackendFs/commands/indexPack.ts`

**Files to Create/Modify**:
- `handles/GitPackWriter.ts` - Write packfiles and create indices
- `utils/packWriter.ts` - Packfile writing utilities
- `utils/deltaResolver.ts` - Delta resolution logic
- Modify `GitDirObjectsProvider` - Add `writePackfile()` method

### 3. Ref Advertisement Parsing (HIGH PRIORITY)

**Status**: ❌ Not Implemented

**What's Needed**:
- Parse `git-upload-pack` ref advertisement
- Parse capabilities from server
- Extract refs and their OIDs from advertisement
- Handle protocol version 1 and 2

**Reference**: `universal-git-src/wire/parseListRefsResponse.ts`

**Files to Create**:
- `wire/parseRefAdvertisement.ts` - Parse ref advertisement
- `wire/parseCapabilities.ts` - Parse server capabilities

### 4. Upload Pack Request/Response (HIGH PRIORITY)

**Status**: ❌ Not Implemented

**What's Needed**:
- **Request Generation** - Build `git-upload-pack` request with wanted refs
- **Response Parsing** - Parse `git-upload-pack` response (acks, packfile, progress)
- **Side-band Demuxing** - Separate packfile data from progress messages
- **Shallow Clone Support** - Handle shallow/unshallow operations

**Reference**: 
- `universal-git-src/wire/writeUploadPackRequest.ts`
- `universal-git-src/wire/parseUploadPackResponse.ts`

**Files to Create**:
- `wire/writeUploadPackRequest.ts` - Build upload-pack requests
- `wire/parseUploadPackResponse.ts` - Parse upload-pack responses
- `wire/GitSideBand.ts` - Side-band demuxing

### 5. Config Writing (MEDIUM PRIORITY)

**Status**: ⚠️ Partial - Can read config, but writing needs verification

**What's Needed**:
- Write config file (create/update sections)
- Add remote configuration
- Set branch tracking information
- Write `FETCH_HEAD` after fetch

**Current State**:
- ✅ Can read config via `GitDir.resolve('config')`
- ❓ Can write via `FileSystemFileHandle.createWritable()` (needs verification)
- ❌ No high-level config writing API

**Reference**: `universal-git-src/git/config.ts`

**Files to Create**:
- `utils/configWriter.ts` - High-level config writing utilities
- `handles/GitConfigHandle.ts` - Smart config handle with write methods

### 6. Ref Writing Infrastructure (MEDIUM PRIORITY)

**Status**: ⚠️ Partial - Basic ref writing exists, but needs enhancement

**What's Needed**:
- **Bulk Ref Writing** - Write multiple refs efficiently
- **Ref Creation** - Create ref files and parent directories
- **FETCH_HEAD Writing** - Write `FETCH_HEAD` after fetch
- **Remote Tracking Refs** - Write `refs/remotes/origin/*` refs
- **Ref Logging** - Write reflog entries (optional but recommended)

**Current State**:
- ✅ `GitRefHandle.updateOid()` - Can update single ref
- ✅ `GitRefHandle.updateSymbolicRef()` - Can update symbolic refs
- ❌ No bulk operations
- ❌ No directory creation helpers
- ❌ No FETCH_HEAD writing

**Reference**: `universal-git-src/git/refs/writeRef.ts`

**Files to Create/Modify**:
- `utils/refWriter.ts` - Bulk ref writing utilities
- Modify `GitDirFsProvider` - Add helper for creating ref directories

### 7. Clone Command Implementation (HIGH PRIORITY)

**Status**: ❌ Not Implemented

**What's Needed**:
- High-level `clone()` function that orchestrates:
  1. Initialize repository (`init`)
  2. Add remote configuration
  3. Fetch from remote (HTTP)
  4. Write refs
  5. Checkout worktree (optional)

**Reference**: `universal-git-src/commands/clone.ts`

**Files to Create**:
- `commands/clone.ts` - Clone command implementation
- `commands/fetch.ts` - Fetch command (used by clone)

### 8. Progress Reporting (LOW PRIORITY)

**Status**: ❌ Not Implemented

**What's Needed**:
- Progress callbacks for packfile download
- Progress callbacks for object indexing
- Progress callbacks for ref writing

**Reference**: `universal-git-src/types.ts` - `ProgressCallback` type

**Files to Create**:
- `types/progress.ts` - Progress callback types

## Implementation Priority

### Phase 1: Core HTTP Clone (Minimum Viable)
1. **HTTP Transport Layer** - Basic HTTP client for Git protocol
2. **Packfile Writing** - Write packfiles and create indices
3. **Upload Pack Protocol** - Request/response parsing
4. **Ref Writing** - Write refs after fetch
5. **Clone Command** - High-level clone function

### Phase 2: Enhanced Features
6. **Config Writing** - Remote configuration
7. **Ref Advertisement** - Parse server capabilities
8. **Progress Reporting** - User feedback

### Phase 3: Advanced Features
9. **Shallow Clone** - Depth-limited clones
10. **Partial Clone** - Filter support (already have promisor infrastructure)
11. **Ref Logging** - Reflog support

## Dependencies

### External Dependencies Needed
- HTTP client (fetch API or similar)
- Stream handling for packfile data
- Possibly: zlib for compression (if not already available)

### Internal Dependencies
- All existing providers and handles
- Object format detection (✅ done)
- MIDX support (✅ done)

## Testing Requirements

### Unit Tests Needed
- HTTP transport layer tests
- Packfile writing tests
- Upload pack request/response parsing tests
- Ref writing tests
- Config writing tests

### Integration Tests Needed
- Full clone from test server
- Clone with authentication
- Clone with progress callbacks
- Clone with shallow depth

## Estimated Complexity

- **HTTP Transport**: Medium (3-5 days)
- **Packfile Writing**: High (5-7 days) - Complex delta resolution
- **Upload Pack Protocol**: Medium (3-4 days)
- **Ref Writing Infrastructure**: Low (1-2 days)
- **Config Writing**: Low (1-2 days)
- **Clone Command**: Medium (2-3 days)

**Total Estimated Time**: 15-23 days of focused development

## Notes

- The current implementation has excellent **read** capabilities
- The main gap is **write** capabilities, especially for packfiles
- HTTP transport is a new layer that doesn't exist yet
- Most of the infrastructure (providers, handles) is in place
- The reference implementation (`universal-git-src`) provides excellent examples

## Quick Start Recommendations

1. **Start with Packfile Writing** - This is the most critical missing piece
2. **Then HTTP Transport** - Can test packfile writing with local files first
3. **Then Protocol Parsing** - Wire up the pieces
4. **Finally Clone Command** - High-level API that uses everything
