---
title: mergeDriver
sidebar_label: mergeDriver
---
The merge driver is a callback which is called for each conflicting file during a merge. It takes the file contents on each branch as an array and returns the merged result.

By default the [merge](./merge.md) command uses the diff3 algorithm to try to solve merge conflicts, and throws an error if the conflict cannot be resolved. This is not always ideal, so universal-git implements merge drivers so that users may implement their own merging algorithm.

## Default Merge Driver: `mergeFile()`

The default merge driver is `mergeFile()`, which is an **adapter function** that bridges the `MergeDriverCallback` interface to the `mergeBlobs()` capability module.

### How `mergeFile()` Works

`mergeFile()` serves as an adapter between two different interfaces:

1. **Input**: `MergeDriverCallback` format
   - `{ branches: [baseName, ourName, theirName], contents: [baseContent, ourContent, theirContent], path: string }`

2. **Output**: Calls `mergeBlobs()` capability module
   - Converts to: `{ base, ours, theirs, ourName, theirName }`
   - Gets back: `{ mergedContent: UniversalBuffer, hasConflict: boolean }`

3. **Return**: Converts to `MergeDriverCallback` format
   - `{ cleanMerge: boolean, mergedText: string }`

### Why an Adapter is Needed

The `MergeDriverCallback` interface uses array-based parameters (`branches[]`, `contents[]`), while the `mergeBlobs()` capability module uses individual parameters (`base`, `ours`, `theirs`, `ourName`, `theirName`). The adapter function:

- **Eliminates code duplication**: Delegates to the single source of truth (`mergeBlobs()` capability module)
- **Bridges interface mismatch**: Converts between different parameter formats
- **Converts return format**: Transforms `{ hasConflict }` to `{ cleanMerge }`

### Using the Default Merge Driver

When you don't provide a custom `mergeDriver`, the default `mergeFile()` adapter is used:

```typescript
// Uses default mergeFile() adapter internally
const result = await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch'
  // mergeDriver not specified - uses mergeFile() adapter
})
```

The `mergeFile()` adapter internally calls `mergeBlobs()` capability module, which uses the diff3 algorithm to perform the merge.

### Direct Use of `mergeBlobs()` Capability Module

If you want to use the merge algorithm directly (without the adapter), you can import and use `mergeBlobs()`:

```typescript
import { mergeBlobs } from '@awesome-os/universal-git-src/git/merge/mergeBlobs.ts'

// Direct use of capability module (no adapter needed)
const result = mergeBlobs({
  base: 'base content',
  ours: 'our content',
  theirs: 'their content',
  ourName: 'main',
  theirName: 'feature'
})

if (result.hasConflict) {
  console.log('Conflict:', result.mergedContent.toString('utf8'))
} else {
  console.log('Clean merge:', result.mergedContent.toString('utf8'))
}
```

**Note**: `mergeBlobs()` returns `{ hasConflict: boolean }`, while `MergeDriverCallback` expects `{ cleanMerge: boolean }`. The `mergeFile()` adapter handles this conversion.

A merge driver implements the following API:

#### async ({ branches, contents, path }) => { cleanMerge, mergedText }
| param         | type [= default]                                  | description                                               |
| ------------- | ------------------------------------------------- | --------------------------------------------------------- |
| branches      | Array\<string\>                                   | an array of human readable branch names                   |
| contents      | Array\<string\>                                   | an array of the file's contents on each respective branch |
| path          | string                                            | the file's path relative to the git repository            |
| return        | Promise\<{cleanMerge: bool, mergedText: string}\> | Whether merge was successful, and the merged text         |


If `cleanMerge` is true, then the `mergedText` string will be written to the file. If `cleanMerge` is false, a `MergeConflictError` will be thrown and no merge commit will be created.

If `merge` was called with `abortOnConflict: false`, the mergedText string will be written to the file even if there is a merge conflict. Otherwise, in the event of a merge conflict, no changes will be written to the worktree or index.

### MergeDriverParams#path
The `path` parameter refers to the path of the conflicted file, relative to the root of the git repository.
### MergeDriverParams#branches
The `branches` array contains the human-readable names of the branches we are merging. The first index refers to the merge base, the second refers to the branch being merged into, and any subsequent indexes refer to the branches we are merging. For example, say we have a git history that looks like this:
```
	  A topic
	 /
    D---E main
```
If we were to merge `topic` into `main`, the `branches` array would look like: `['base', 'main', 'topic']`. In this case, the name `base` refers to commit `D` which is the common ancestor of our two branches. `base` will always be the name at the first index.

### MergeDriverParams#contents
The `contents` array contains the file contents respective of each branch. Like the `branches` array, the first index always refers to the merge base. The second index always refers to the branch we are merging into, i.e. 'ours'. Subsequent indexes refer to the branches we are merging, i.e. 'theirs'.

For example, say we have a file `text.txt` which contains:
```
original
text
file
```

On the `main` branch, we modify the text file to read:
```
text
file
was
modified
```

However, on the `topic` branch, we modify the text file to read:
```
modified
text
file
```

In this case, when our merge driver is called on `text.txt`, the `contents` array will look like this:
```js
[
  'original\ntext\nfile',
  'text\n\file\nwas\nmodified',
  'modified\ntext\nfile',
]
```

## Examples
Below is an example of a very simple merge driver which always chooses the other branch's version of the file whenever it was modified by both branches.
```
const mergeDriver = ({ contents }) => {
  const mergedText = contents[2]
  return { cleanMerge: true, mergedText }
}
```

If we applied this algorithm to the conflict in the previous example, the resolved file would simply read:
```
modified
text
file
```

and if instead we wanted to chose *our* branch's version of the file, whenever it was modified by both branches,we simply change the line:
```
const mergedText = contents[2]
```
to read:
```
const mergedText = contents[1]
```
which results in the resolved file reading:
```
text
file
was
modified
```

As a more complex example, we use the `mergeBlobs()` capability module (which uses diff3 internally), but choose the other branch's changes whenever specific lines of the file conflict.

**Recommended approach** - Use `mergeBlobs()` capability module:
```typescript
import { mergeBlobs } from '@awesome-os/universal-git-src/git/merge/mergeBlobs.ts'

const mergeDriver = ({ branches, contents }) => {
  const [baseName, ourName, theirName] = branches
  const [baseContent, ourContent, theirContent] = contents

  // Use mergeBlobs capability module (uses diff3 internally)
  const result = mergeBlobs({
    base: baseContent,
    ours: ourContent,
    theirs: theirContent,
    ourName,
    theirName,
  })

  // Customize: prefer theirs on conflicts
  let mergedText = result.mergedContent.toString('utf8')
  if (result.hasConflict) {
    // Replace conflict markers with their version
    // (This is a simplified example - you'd need to parse conflict markers)
    mergedText = theirContent
  }

  return {
    cleanMerge: !result.hasConflict,
    mergedText,
  }
}
```

**Alternative approach** - Use diff3 directly (not recommended, as it bypasses the capability module):
```typescript
const diff3Merge = require('diff3')
const mergeDriver = ({ contents }) => {
  const baseContent = contents[0]
  const ourContent = contents[1]
  const theirContent = contents[2]

  const LINEBREAKS = /^.*(\r?\n|$)/gm
  const ours = ourContent.match(LINEBREAKS)
  const base = baseContent.match(LINEBREAKS)
  const theirs = theirContent.match(LINEBREAKS)
  const result = diff3Merge(ours, base, theirs)
  let mergedText = ''
  for (const item of result) {
    if (item.ok) {
      mergedText += item.ok.join('')
    }
    if (item.conflict) {
      mergedText += item.conflict.b.join('')
    }
  }
  return { cleanMerge: true, mergedText }
}
```

If we apply this algorithm to the conflict in the previous example, the resolved file reads:
```
modified
text
file
was
modified
```
and if we wanted to choose *our* branch's changes whenever specific lines of the file conflict, we simply change the above line:
```
mergedText += item.conflict.b.join('')
```
to read:
```
mergedText += item.conflict.a.join('')
```
which results in a resolved file that reads:
```
text
file
was
modified
```

### Custom Merge Driver Using `mergeBlobs()` Capability Module

If you want to customize the merge behavior but still use the `mergeBlobs()` capability module, you can create a custom merge driver that wraps it:

```typescript
import { mergeBlobs } from '@awesome-os/universal-git-src/git/merge/mergeBlobs.ts'

const customMergeDriver = ({ branches, contents, path }) => {
  const [baseName, ourName, theirName] = branches
  const [baseContent, ourContent, theirContent] = contents

  // Use mergeBlobs capability module directly
  const result = mergeBlobs({
    base: baseContent,
    ours: ourContent,
    theirs: theirContent,
    ourName,
    theirName,
  })

  // Convert to MergeDriverCallback format
  return {
    cleanMerge: !result.hasConflict,
    mergedText: result.mergedContent.toString('utf8'),
  }
}

// Use custom merge driver
await merge({
  fs,
  dir: '/path/to/repo',
  theirs: 'feature-branch',
  mergeDriver: customMergeDriver
})
```

### Modifying Default Merge Driver Behavior

Finally, what if we wanted to make a slight modification to the behavior of the default merge driver, like changing the size of conflict markers? The code for the default merge driver is located in `src/git/merge/mergeFile.ts`. We can create a custom merge driver based on it like so:
```
const diff3Merge = require('diff3')
const mergeDriver = ({ contents, branches }) => {
  const ourName = branches[1]
  const theirName = branches[2]

  const baseContent = contents[0]
  const ourContent = contents[1]
  const theirContent = contents[2]

  const ours = ourContent.match(LINEBREAKS)
  const base = baseContent.match(LINEBREAKS)
  const theirs = theirContent.match(LINEBREAKS)

  const result = diff3Merge(ours, base, theirs)

  const markerSize = 7

  let mergedText = ''
  let cleanMerge = true

  for (const item of result) {
    if (item.ok) {
      mergedText += item.ok.join('')
    }
    if (item.conflict) {
      cleanMerge = false
      mergedText += `${'<'.repeat(markerSize)} ${ourName}\n`
      mergedText += item.conflict.a.join('')

      mergedText += `${'='.repeat(markerSize)}\n`
      mergedText += item.conflict.b.join('')
      mergedText += `${'>'.repeat(markerSize)} ${theirName}\n`
    }
  }
  return { cleanMerge, mergedText }
}
```

If we want larger conflict markers, we can simply change the line
```
const markerSize = 7
```
to
```
const markerSize = 14
```
Which will give us conflict markers that are 14 characters wide instead of the default 7.

Now if we use this merge driver when merging the branch 'topic' into 'main', and if we have `abortOnConflict` set to `false`, the worktree will be updated with a `text.txt` file that looks like this:
```
<<<<<<<<<<<<<< main
modified
==============
>>>>>>>>>>>>>> topic
text
file
was
modified
```

## Relationship Between `mergeFile()` and `mergeBlobs()`

### Architecture Overview

The merge system uses a layered architecture:

1. **`mergeBlobs()` capability module** (`src/git/merge/mergeBlobs.ts`)
   - Pure algorithm for merging blob content
   - Single source of truth for merge algorithm logic
   - Uses diff3 algorithm internally
   - Returns: `{ mergedContent: UniversalBuffer, hasConflict: boolean }`

2. **`mergeFile()` adapter** (`src/git/merge/mergeFile.ts`)
   - Bridges `MergeDriverCallback` interface to `mergeBlobs()` capability module
   - Converts parameter formats (array-based → individual parameters)
   - Converts return format (`hasConflict` → `cleanMerge`)
   - Returns: `{ cleanMerge: boolean, mergedText: string }`

3. **`mergeTree()` utility** (`src/git/merge/mergeTree.ts`)
   - Higher-level utility with index management
   - Uses `mergeFile()` adapter (or custom merge driver) for blob merging
   - Manages GitIndex and writes conflicted files to worktree

### Why the Adapter Pattern?

The adapter pattern is used because:

- **Interface Mismatch**: `MergeDriverCallback` uses array-based parameters, while `mergeBlobs()` uses individual parameters
- **Return Format Difference**: `mergeBlobs()` returns `{ hasConflict }`, while `MergeDriverCallback` expects `{ cleanMerge }`
- **Single Source of Truth**: Ensures all merge operations use the same algorithm (`mergeBlobs()` capability module)
- **Code Reuse**: Eliminates duplication by delegating to the capability module

### Flow Diagram

```
User provides mergeDriver (optional)
         │
         ├─→ Not provided → Uses default mergeFile() adapter
         │                    │
         │                    ▼
         │              mergeFile() adapter
         │                    │
         │                    ▼
         └─→ Provided → Custom mergeDriver ──┐
                                              │
                                              ▼
                                    mergeBlobs() capability module
                                    (Single source of truth)
                                              │
                                              ▼
                                    diff3 algorithm
```

### Best Practices

1. **Use `mergeBlobs()` capability module** when creating custom merge drivers
   - Ensures consistent behavior with default merge
   - Benefits from any improvements to the merge algorithm
   - Maintains single source of truth

2. **Use `mergeFile()` adapter** when you need a `MergeDriverCallback`
   - Handles interface conversion automatically
   - Provides default merge behavior
   - Can be used as a reference for custom merge drivers

3. **Avoid duplicating merge algorithm logic**
   - Don't reimplement diff3 algorithm
   - Use `mergeBlobs()` capability module instead
   - Customize behavior by post-processing the result

For more details, see:
- [Merge](./merge.md#merge-architecture) - Merge architecture overview
- [Architecture](./architecture.md#5-merge-capability-modules) - Merge capability modules
