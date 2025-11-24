# Walker API Documentation

## Overview

The Walker API provides a functional, type-safe way to create and use Git tree walkers. It includes factory methods for creating walkers and wrapper functions for normalizing map, reduce, and iterate functions.

## WalkerFactory

The `WalkerFactory` class provides static methods for creating Walkers, similar to the `UniversalBuffer.from()` pattern.

### Methods

#### `WalkerFactory.from(factory)`

Creates a Walker from a factory function.

```typescript
const walker = WalkerFactory.from(async ({ repo }) => {
  // Custom walker implementation
  return new CustomWalker({ repo })
})
```

#### `WalkerFactory.tree({ ref? })`

Creates a TREE walker for walking Git tree objects.

```typescript
// Default to HEAD
const headWalker = WalkerFactory.tree()

// Specific ref
const branchWalker = WalkerFactory.tree({ ref: 'main' })
```

#### `WalkerFactory.workdir()`

Creates a WORKDIR walker for walking the working directory.

```typescript
const workdirWalker = WalkerFactory.workdir()
```

**Note:** Throws an error if used with a bare repository.

#### `WalkerFactory.stage()`

Creates a STAGE walker for walking the Git index (staging area).

```typescript
const stageWalker = WalkerFactory.stage()
```

## Wrapper Functions

Wrapper functions normalize function arguments and provide better type safety.

### WalkerMap Wrappers

#### `WalkerMap(fn)`

Basic wrapper for WalkerMap functions.

```typescript
const map = WalkerMap(async (filepath: string, entries: WalkerEntry[]) => {
  return entries[0] ? filepath : undefined
})
```

#### `WalkerMapWithNulls(fn)`

Handles null entries automatically. Useful for comparing multiple trees.

```typescript
const map = WalkerMapWithNulls(async (
  filepath: string, 
  [head, stage]: (WalkerEntry | null)[]
): Promise<string | undefined> => {
  if (!head && !stage) return undefined
  return filepath
})
```

#### `WalkerMapFiltered(fn)`

Filters out undefined results automatically.

```typescript
const map = WalkerMapFiltered(async (
  filepath: string, 
  entries: WalkerEntry[]
): Promise<string | undefined> => {
  // Return undefined for some files
  if (filepath.includes('test')) return undefined
  return filepath
})
```

### WalkerReduce Wrappers

#### `WalkerReduce(fn)`

Basic wrapper for WalkerReduce functions. Normalizes parent and children.

```typescript
const reduce = WalkerReduce(async (
  parent: string | undefined, 
  children: string[]
): Promise<string | undefined> => {
  if (!parent && children.length === 0) return undefined
  return parent || children.join(',')
})
```

#### `WalkerReduceTree(fn)`

Handles tree building. Automatically filters undefined children.

```typescript
const reduce = WalkerReduceTree(async (
  parent: TreeEntry | undefined, 
  children: TreeEntry[]
): Promise<TreeEntry | undefined> => {
  if (!parent) return undefined
  // Build tree structure
  return { ...parent, children }
})
```

#### `WalkerReduceFlat()`

Flattens results. Default behavior for most walk operations.

```typescript
const reduce = WalkerReduceFlat()
```

### WalkerIterate Wrapper

#### `WalkerIterate(fn)`

Wraps a WalkerIterate function to normalize iteration.

```typescript
const iterate = WalkerIterate(async (walk, children) => {
  return Promise.all([...children].map(walk))
})
```

## Usage Examples

### Basic Walker Creation

```typescript
import { WalkerFactory } from '@awesome-os/universal-git-src/models/Walker.ts'
import { walk } from '@awesome-os/universal-git-src/commands/walk.ts'

// Create walkers
const trees = [
  WalkerFactory.tree({ ref: 'HEAD' }),
  WalkerFactory.workdir(),
  WalkerFactory.stage()
]

// Use in walk
const result = await walk({
  repo,
  trees,
})
```

### Using Wrapper Functions

```typescript
import { 
  WalkerMapWithNulls, 
  WalkerReduceFlat 
} from '@awesome-os/universal-git-src/models/Walker.ts'

const result = await walk({
  repo,
  trees: [TREE({ ref: 'HEAD' }), STAGE()],
  map: WalkerMapWithNulls(async (filepath, [head, stage]) => {
    if (!head && !stage) return undefined
    return { filepath, hasHead: !!head, hasStage: !!stage }
  }),
  reduce: WalkerReduceFlat(),
})
```

### Custom Walker

```typescript
const customWalker = WalkerFactory.from(async ({ repo }) => {
  // Custom implementation
  return new MyCustomWalker({ repo })
})
```

## Migration from Old API

### Before

```typescript
// Manual object creation
export function TREE({ ref = 'HEAD' }: { ref?: string } = {}): Walker {
  const o = Object.create(null)
  Object.defineProperty(o, GitWalkSymbol, {
    value: async function ({ repo }: { repo: Repository }) {
      const gitdir = await repo.getGitdir()
      return new GitWalkerRepo({ fs: repo.fs, gitdir, ref, cache: repo.cache })
    },
  })
  Object.freeze(o)
  return o
}
```

### After

```typescript
// Using WalkerFactory
export function TREE({ ref = 'HEAD' }: { ref?: string } = {}): Walker {
  return WalkerFactory.tree({ ref })
}
```

### Before

```typescript
// Manual null checking
const map = async (filepath: string, [head, stage]: (WalkerEntry | null)[]): Promise<TreeEntry | undefined> => {
  if (!head && !stage) return undefined
  // ... implementation
}
```

### After

```typescript
// Using wrapper
const map = WalkerMapWithNulls(async (filepath: string, [head, stage]: (WalkerEntry | null)[]): Promise<TreeEntry | undefined> => {
  if (!head && !stage) return undefined
  // ... implementation
})
```

## Benefits

1. **Reduced Boilerplate**: Walker creation is now 3 lines instead of 20+
2. **Better Type Safety**: Wrapper functions provide better type inference
3. **Consistent Patterns**: All Walker creation uses the same factory pattern
4. **Backward Compatible**: Existing `Walker` type and function signatures maintained
5. **Cleaner API**: Similar to `UniversalBuffer.from()` pattern


