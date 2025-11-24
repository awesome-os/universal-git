# Performance Optimization Status

## Goal
Get merge tests under 20 seconds (currently ~24 seconds)

## Current Performance
- `merge-add-remove`: **24.25s** (target: <20s)
- `merge-remove-add`: **25.04s** (target: <20s)

## Optimizations Implemented

### 1. OID-to-Packfile Map ✅
- **Location**: `src/git/objects/pack.ts`
- **What**: Builds a reverse index (OID → packfile) for O(1) lookups
- **Impact**: Reduces packfile iteration from O(n*m) to O(1) per lookup
- **Status**: Implemented and active

### 2. Object Caching ✅
- **Location**: `src/git/objects/readObject.ts`, `src/git/objects/pack.ts`
- **What**: Caches read objects to avoid re-reading the same object
- **Impact**: Avoids redundant object reads during merge
- **Status**: Implemented and active

### 3. Packfile Map Pre-warming ✅
- **Location**: `src/commands/merge.ts`
- **What**: Pre-warms packfile map at start of merge
- **Impact**: Builds map upfront instead of during object reads
- **Status**: Implemented and active

## Remaining Bottlenecks

Based on profiling, likely bottlenecks:

1. **Tree Walking** - Recursive traversal of three trees (ours, base, theirs)
   - Each directory requires a `readObject` call
   - For small repos, objects may be loose (not packed), so packfile optimizations don't help

2. **Object Reading** - Even with caching, initial reads are slow
   - Loose object decompression
   - SHA verification

3. **Index Operations** - Reading/writing Git index
   - May be slow for large indexes

## Next Steps

### Option 1: Skip SHA Verification During Merge
- Skip SHA verification for tree objects during merge
- Verify at the end instead
- **Expected gain**: 5-10% (1-2 seconds)

### Option 2: Optimize Tree Parsing
- Cache parsed tree structures
- Avoid re-parsing the same tree
- **Expected gain**: 3-5% (0.5-1 second)

### Option 3: Parallel Tree Reading
- Read tree objects in parallel where possible
- **Expected gain**: 10-15% (2-3 seconds)

### Option 4: Optimize Index Operations
- Batch index writes
- Cache index reads
- **Expected gain**: 5-10% (1-2 seconds)

## Recommendation

**Try Option 1 (Skip SHA Verification)** first because:
- Easiest to implement
- Low risk (we verify at the end)
- Good expected gain (5-10%)

If that's not enough, combine with **Option 3 (Parallel Tree Reading)** for maximum impact.

## Testing

Run performance tests:
```bash
node performance/profile-timing.mjs
```

Target: Both tests should complete in < 20 seconds.

