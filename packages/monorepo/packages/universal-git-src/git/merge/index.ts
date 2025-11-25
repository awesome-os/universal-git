/**
 * Merge capability modules
 * 
 * This module provides merge algorithms and utilities:
 * - `mergeBlobs()` - Pure algorithm for merging blob content
 * - `mergeTrees()` - Pure algorithm for merging tree structures
 * - `mergeTree()` - Higher-level utility for merging trees with index management
 * - `mergeFile()` - Merge driver callback
 */

export { mergeBlobs } from './mergeBlobs.ts'
export { mergeTrees } from './mergeTrees.ts'
export { mergeTree, mergeBlobs as mergeBlobsUtility } from './mergeTree.ts'
export { mergeFile } from './mergeFile.ts'
export type { MergeDriverParams, MergeDriverCallback } from './types.ts'

