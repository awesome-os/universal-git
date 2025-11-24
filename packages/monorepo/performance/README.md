# Performance Testing Suite

This directory contains isolated performance tests for the slowest merge operations identified in the performance analysis.

## Critical Operations

These are the most essential merge operations that are currently timing out:

1. **`merge 'add-files' and 'remove-files'`** - 28.63s (timeout)
2. **`merge 'remove-files' and 'add-files'`** - 23.93s (timeout)

## Test Files

- `merge-add-remove.test.ts` - Isolated test for "merge 'add-files' and 'remove-files'"
- `merge-remove-add.test.ts` - Isolated test for "merge 'remove-files' and 'add-files'"

## Profiling Tools

### 1. Heat Map / Flame Graph (Recommended)

Generate a CPU profile heat map to visualize where time is being spent:

```bash
# Generate heat map for all tests
node performance/profile-heatmap.mjs

# Generate heat map for specific test
node performance/profile-heatmap.mjs merge-add-remove
node performance/profile-heatmap.mjs merge-remove-add
```

**Output:** `.cpuprofile` files in `performance/results/`

**To view the heat map:**
1. Open Google Chrome
2. Open DevTools (F12)
3. Go to "Performance" tab
4. Click "Load profile..." (up arrow icon)
5. Select the `.cpuprofile` file from `performance/results/`
6. Analyze the flame graph:
   - **Wider bars** = more time spent
   - **Red/orange colors** = hot paths (CPU intensive)
   - **Stack height** = call depth
   - **Look for functions called many times** = potential optimization targets

**Analyze programmatically:**
```bash
# Analyze the most recent profile
node performance/analyze-hot-path.mjs

# Analyze specific profile
node performance/analyze-hot-path.mjs performance/results/merge-add-remove-heatmap-1234567890.cpuprofile
```

### 2. CPU Profiling (Chrome DevTools)

Generate CPU profiles that can be analyzed in Chrome DevTools:

```bash
# Profile all tests
node performance/profile.mjs

# Profile specific test
node performance/profile.mjs merge-add-remove
node performance/profile.mjs merge-remove-add
```

**Output:** `.cpuprofile` files in `performance/results/`

**To analyze:**
1. Open Google Chrome
2. Open DevTools (F12)
3. Go to "Performance" tab
4. Click "Load profile..." (up arrow icon)
5. Select the `.cpuprofile` file from `performance/results/`
6. Analyze the flame chart and call tree

### 2. Timing Profiling

Get detailed timing information:

```bash
# Time all tests
node performance/profile-timing.mjs

# Time specific test
node performance/profile-timing.mjs merge-add-remove
node performance/profile-timing.mjs merge-remove-add
```

## NPM Scripts

Add these to `package.json` for convenience:

```json
{
  "scripts": {
    "perf": "node performance/profile.mjs",
    "perf:timing": "node performance/profile-timing.mjs",
    "perf:add-remove": "node performance/profile.mjs merge-add-remove",
    "perf:remove-add": "node performance/profile.mjs merge-remove-add"
  }
}
```

## Running Tests Directly

You can also run the tests directly with Node.js:

```bash
# Run specific test
node --experimental-strip-types --test performance/merge-add-remove.test.ts
node --experimental-strip-types --test performance/merge-remove-add.test.ts
```

## Performance Goals

- **Target:** < 5 seconds per test
- **Current:** 20-28 seconds (timeout)
- **Improvement needed:** 4-5x speedup

## Analysis Workflow

1. **Baseline:** Run profiling to establish current performance
2. **Identify bottlenecks:** Analyze CPU profiles in Chrome DevTools
3. **Optimize:** Implement fixes based on profiling data
4. **Verify:** Re-run profiling to measure improvement
5. **Iterate:** Repeat until target performance is achieved

## Expected Bottlenecks

Based on analysis, likely bottlenecks include:

1. **Packfile lookups** - O(n*m) iteration through packfiles
2. **Tree walking** - Recursive traversal of three trees
3. **Object reading** - Delta resolution and object decompression
4. **Index operations** - Reading and writing Git index

## Results Directory

Profiling results are saved to `performance/results/`. This directory is gitignored to avoid committing large profile files.

---

**Note:** These tests require native git to be available. If git is not available, the tests will skip with a warning.

