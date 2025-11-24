# Hot Path Analysis Guide

## Quick Start

1. **Generate heat map:**
   ```bash
   npm run perf:heatmap merge-add-remove
   ```

2. **View in Chrome DevTools:**
   - Open Chrome → DevTools (F12) → Performance tab
   - Click "Load profile..." → Select the `.cpuprofile` file
   - Analyze the flame graph

3. **Analyze programmatically:**
   ```bash
   npm run perf:analyze
   ```

## Understanding the Flame Graph

### Visual Indicators

- **Width of bars** = Time spent in that function
- **Height of stack** = Call depth
- **Color intensity** = CPU usage (red/orange = hot)
- **Multiple narrow bars** = Function called many times (potential optimization)

### What to Look For

1. **Wide bars at the top level** = Main bottlenecks
2. **Deep stacks** = Complex call chains (may indicate unnecessary work)
3. **Repeated patterns** = Functions called in loops (caching opportunity)
4. **Long flat sections** = Waiting/idle time (I/O operations)

## Common Hot Paths in Merge Operations

Based on analysis, likely hot paths include:

1. **Tree Walking** (`_walk`, `GitWalkerRepo.readdir`)
   - Recursively traverses three trees
   - Each directory = one `readObject` call
   - **Optimization**: Cache tree objects, parallel reads

2. **Object Reading** (`readObject`, `readPacked`)
   - Packfile index lookups
   - Delta resolution
   - SHA verification
   - **Optimization**: Object caching, skip SHA verification during merge

3. **Index Operations** (`readIndexDirect`, `writeIndex`)
   - Reading/writing Git index
   - **Optimization**: Batch writes, cache reads

4. **Tree Parsing** (`parseTree`, `GitTree.from`)
   - Parsing tree objects
   - **Optimization**: Cache parsed trees

## Next Steps After Analysis

1. Identify the top 3-5 functions by time spent
2. Check if they're called unnecessarily
3. Look for caching opportunities
4. Consider parallelization
5. Measure improvement after optimization

