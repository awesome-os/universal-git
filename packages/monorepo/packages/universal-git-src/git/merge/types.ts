/**
 * Merge driver types
 */

/**
 * Merge driver parameters
 */
export type MergeDriverParams = {
  branches: string[]
  contents: string[]
  path: string
}

/**
 * Merge driver callback
 */
export type MergeDriverCallback = (
  args: MergeDriverParams
) => { cleanMerge: boolean; mergedText: string } | Promise<{ cleanMerge: boolean; mergedText: string }>

