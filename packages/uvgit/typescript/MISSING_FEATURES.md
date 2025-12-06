# Missing Features Analysis

## Current Implementation Status

### ✅ Implemented
- **Loose Objects**: `GitLooseObjectHandle` - reads/writes loose objects
- **Pack Files**: `GitPackHandle` - reads pack files
- **Pack Index**: `GitPackIndexHandle` - parses `.idx` files for OID lookups
- **Packed Objects**: `GitPackedObjectHandle` - reads objects from pack files
- **Commit Graph Handle**: `CommitGraphHandle` - basic structure exists (simplified parser)
- **Promisor Objects**: `PromisorObjectHandle` - partial clone support
- **Object Writing**: `writeObject()` utility for creating Git objects

### ❌ Missing Critical Features

#### 1. **Multi-Pack Index (MIDX)** ⚠️ HIGH PRIORITY
**Status**: Not implemented  
**Location in reference**: `universal-git-src/models/GitMultiPackIndex.ts`  
**Usage in reference**: `universal-git-src/git/objects/pack.ts` (lines 146-173)

**What it does**:
- Provides a single index file (`objects/info/multi-pack-index`) that indexes multiple packfiles
- Enables O(1) lookup across all packfiles without checking each `.idx` individually
- Significantly improves performance for repositories with many packfiles

**Current implementation**:
- `GitDirObjectsProvider.findInPacks()` iterates through ALL pack indices sequentially
- No MIDX support - checks each pack index one by one

**What needs to be ported**:
1. Create `handles/GitMultiPackIndexHandle.ts` (similar to `GitPackIndexHandle`)
   - Parse MIDX format (version 1, SHA-1/SHA-256)
   - Implement `lookup(oid)` method using fanout table + binary search
   - Support chunks: PNAM, OIDF, OIDL, OOFF, LOFF, TYPE
2. Update `GitDirObjectsProvider.findInPacks()` to:
   - First check for MIDX at `objects/info/multi-pack-index`
   - Use MIDX lookup if available (much faster)
   - Fall back to individual pack indices if MIDX doesn't exist
3. Add MIDX caching (similar to pack index caching)

**Reference Implementation**:
- `GitMultiPackIndex.fromBuffer()` - static factory method
- `lookup(oid)` - returns `{ packfileIndex, offset, objectType? }`
- `getPackfileName(index)` - gets packfile name by index
- Supports large offsets (64-bit) for packfiles > 4GB

#### 2. **Object Database Alternates**
**Status**: Not implemented  
**Location in reference**: `git/backends/GitBackend.ts` (line 423)

**What it does**:
- Allows referencing objects from other Git repositories
- File: `objects/info/alternates` contains paths to alternate object databases
- Enables sharing objects across repositories (e.g., worktrees, submodules)

**What needs to be ported**:
1. Create `providers/GitDirAlternatesProvider.ts` or add to `GitDirObjectsProvider`
2. Read `objects/info/alternates` file
3. Resolve alternate paths and search them for objects
4. Integrate with `GitDirObjectsProvider.getHandle()` to check alternates when object not found locally

#### 3. **Commit Graph Full Implementation**
**Status**: Partially implemented (simplified parser)  
**Location**: `handles/CommitGraphHandle.ts`

**Current state**:
- Basic structure exists
- Parser is simplified/stubbed (doesn't actually parse chunks)

**What needs to be ported**:
- Full commit graph format parser (chunks: OIDF, OIDL, CDAT, etc.)
- Generation number calculation
- Parent OID extraction
- Integration with `GraphWalker` for efficient traversal

**Reference**: `universal-git-src/core-utils/algorithms/CommitGraphWalker.ts`

#### 4. **OID-to-Packfile Cache**
**Status**: Not implemented  
**Location in reference**: `git/objects/pack.ts` (lines 175-202)

**What it does**:
- Caches which packfile contains which OID after first lookup
- Avoids re-scanning all pack indices for previously found objects

**Current implementation**:
- `GitDirObjectsProvider` loads all pack indices but doesn't cache OID->packfile mapping
- Each lookup scans all pack indices

**What needs to be ported**:
- Add `oidToPackfileCache: Map<string, string>` to `GitDirObjectsProvider`
- Cache OID -> packfile name mapping after successful lookup
- Check cache before scanning pack indices

#### 5. **Object Format Detection (SHA-1 vs SHA-256)**
**Status**: Partially implemented  
**Location**: Need to check if we detect object format

**What it does**:
- Detects whether repository uses SHA-1 or SHA-256 object IDs
- Required for correct OID length (20 vs 32 bytes)

**Reference**: `universal-git-src/git/backends/GitBackendFs/utils/detectObjectFormat.ts`

### 🔄 Could Be Enhanced

#### 1. **Pack Index Caching Strategy**
**Current**: Loads all pack indices eagerly on first `findInPacks()` call  
**Enhancement**: Lazy loading - only load pack indices when needed, with LRU cache

#### 2. **Large Offset Support**
**Current**: `GitPackIndexHandle` uses 32-bit offsets  
**Enhancement**: Support 64-bit offsets for packfiles > 4GB (MIDX has this)

#### 3. **Pack Index Version 2 Support**
**Current**: Only supports pack index version 2  
**Enhancement**: Check if we need version 1 support (legacy)

#### 4. **Object Type Caching**
**Current**: Object type is parsed when reading object  
**Enhancement**: Cache object type from pack index/MIDX to avoid parsing

## Priority Recommendations

### High Priority (Performance Critical)
1. **MIDX Support** - Biggest performance win for multi-pack repositories
2. **OID-to-Packfile Cache** - Simple optimization with significant impact

### Medium Priority (Feature Completeness)
3. **Alternates Support** - Needed for worktrees and advanced use cases
4. **Full Commit Graph** - Enables efficient graph algorithms

### Low Priority (Nice to Have)
5. **Lazy Pack Index Loading** - Optimization for repositories with many packs
6. **64-bit Offset Support** - Only needed for very large packfiles

## Implementation Notes

### MIDX Implementation Strategy
1. Create `GitMultiPackIndexHandle` class extending `GitBaseHandle`
2. Add `parse()` method similar to `GitPackIndexHandle.parse()`
3. Implement binary search lookup using fanout table
4. Update `GitDirObjectsProvider.findInPacks()`:
   ```typescript
   // Pseudo-code
   async findInPacks(oid: string, context: GitDir): Promise<GitPackedObjectHandle | null> {
     // 1. Try MIDX first
     const midxHandle = await context.resolve('objects/info/multi-pack-index');
     if (midxHandle) {
       const midx = new GitMultiPackIndexHandle(midxHandle);
       const lookup = await midx.lookup(oid);
       if (lookup) {
         const packName = midx.getPackfileName(lookup.packfileIndex);
         // Load pack and return handle
       }
     }
     
     // 2. Fall back to individual pack indices (current implementation)
     // ...
   }
   ```

### Testing Strategy
- Test with repositories that have MIDX files
- Test fallback when MIDX is missing
- Test with repositories with many packfiles (performance comparison)
- Test with alternates (if implemented)
