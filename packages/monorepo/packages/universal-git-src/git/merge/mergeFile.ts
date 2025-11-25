import { mergeBlobs } from './mergeBlobs.ts'

/**
 * Adapter function that bridges the `MergeDriverCallback` interface to the `mergeBlobs()` capability module.
 * 
 * This function serves as an adapter between two different interfaces:
 * - **Input**: `MergeDriverCallback` format with `{ branches: string[], contents: string[], path: string }`
 * - **Output**: Calls `mergeBlobs()` capability module with individual parameters `{ base, ours, theirs, ourName, theirName }`
 * 
 * **Purpose:**
 * - Eliminates code duplication by delegating to the single source of truth (`mergeBlobs()` capability module)
 * - Provides a bridge between the `MergeDriverCallback` interface and the pure algorithm capability module
 * - Converts between different parameter formats (array-based vs. individual parameters)
 * - Converts between different return formats (`hasConflict` vs. `cleanMerge`)
 * 
 * **When to use this function:**
 * - You need a `MergeDriverCallback` for `mergeTree()` operations
 * - You want the default merge behavior (uses `mergeBlobs()` capability module)
 * - You're implementing a custom merge driver that wraps `mergeBlobs()`
 * - You need to adapt the `MergeDriverCallback` interface to use the `mergeBlobs()` capability module
 * 
 * **When NOT to use this function:**
 * - You have raw content and want to merge directly (use `mergeBlobs()` instead)
 * - You need to merge trees (use `mergeTrees()` instead)
 * - You need worktree operations (use `mergeTree()` from `GitWorktreeBackend` instead)
 * 
 * **Interface Bridging:**
 * This adapter function bridges the interface mismatch:
 * - `MergeDriverCallback` expects: `{ branches: [baseName, ourName, theirName], contents: [baseContent, ourContent, theirContent], path: string }`
 * - `mergeBlobs()` expects: `{ base, ours, theirs, ourName, theirName }`
 * - `mergeBlobs()` returns: `{ mergedContent: UniversalBuffer, hasConflict: boolean }`
 * - This function returns: `{ cleanMerge: boolean, mergedText: string }` (MergeDriverCallback format)
 * 
 * **Example:**
 * ```typescript
 * import { mergeFile } from 'universal-git/git/merge'
 * 
 * // Use as a merge driver callback (adapter bridges the interface)
 * const result = await mergeFile({
 *   branches: ['base', 'main', 'feature'],
 *   contents: [
 *     'base content',
 *     'main content',
 *     'feature content'
 *   ],
 *   path: 'file.txt'
 * })
 * 
 * if (result.cleanMerge) {
 *   console.log('Clean merge:', result.mergedText)
 * } else {
 *   console.log('Conflict:', result.mergedText)
 * }
 * ```
 * 
 * @param branches - Branch names: [baseName, ourName, theirName]
 * @param contents - File contents: [baseContent, ourContent, theirContent]
 * @param path - File path (unused in merge algorithm, but part of MergeDriverCallback interface)
 * @returns Merge result with cleanMerge flag and merged text (MergeDriverCallback format)
 */
export function mergeFile({
  branches,
  contents,
  path,
}: {
  branches: [string, string, string]
  contents: [string, string, string]
  path?: string // Part of MergeDriverCallback interface, but unused in merge algorithm
}): { cleanMerge: boolean; mergedText: string } {
  const baseName = branches[0]
  const ourName = branches[1]
  const theirName = branches[2]

  const baseContent = contents[0]
  const ourContent = contents[1]
  const theirContent = contents[2]

  // Use the mergeBlobs capability module as the single source of truth
  const result = mergeBlobs({
    base: baseContent,
    ours: ourContent,
    theirs: theirContent,
    ourName,
    theirName,
  })

  // Convert the result to the MergeDriverCallback format
  return {
    cleanMerge: !result.hasConflict,
    mergedText: result.mergedContent.toString('utf8'),
  }
}

