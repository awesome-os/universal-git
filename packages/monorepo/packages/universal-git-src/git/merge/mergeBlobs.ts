import diff3Merge from 'diff3'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

const LINEBREAKS = /^.*(\r?\n|$)/gm

type MergeBlobsResult = {
  mergedContent: UniversalBuffer
  hasConflict: boolean
}

/**
 * Performs a three-way merge on blobs (text files)
 * 
 * This is a pure algorithm capability module - no file system operations.
 * Use this when you have raw content (strings/buffers) to merge.
 * 
 * **When to use this function:**
 * - You have raw content (strings/buffers) to merge
 * - You need a pure algorithm capability module (no file system operations)
 * - You're implementing a new merge operation (e.g., in cherryPick, rebase)
 * - You want to merge content without writing to the Git object database
 * 
 * **When NOT to use this function:**
 * - You need to merge trees (use `mergeTrees()` instead)
 * - You need index management or worktree operations (use `mergeTree()` from `GitWorktreeBackend` instead)
 * - You have `WalkerEntry` objects (use `mergeTree()`'s `mergeBlobs()` helper instead)
 * 
 * **Example:**
 * ```typescript
 * import { mergeBlobs } from 'universal-git/git/merge'
 * 
 * const result = mergeBlobs({
 *   base: 'line1\nline2\nline3',
 *   ours: 'line1\nline2-modified\nline3',
 *   theirs: 'line1\nline2\nline3-added',
 *   ourName: 'main',
 *   theirName: 'feature'
 * })
 * 
 * if (result.hasConflict) {
 *   console.log('Conflict detected:', result.mergedContent.toString('utf8'))
 * } else {
 *   console.log('Clean merge:', result.mergedContent.toString('utf8'))
 * }
 * ```
 * 
 * @param base - Base content (UniversalBuffer or string)
 * @param ours - Our content (UniversalBuffer or string)
 * @param theirs - Their content (UniversalBuffer or string)
 * @param ourName - Name to use in conflict markers for our side (default: 'ours')
 * @param theirName - Name to use in conflict markers for their side (default: 'theirs')
 * @returns Merge result with merged content and conflict flag
 */
export const mergeBlobs = ({
  base,
  ours,
  theirs,
  ourName = 'ours',
  theirName = 'theirs',
}: {
  base: UniversalBuffer | string
  ours: UniversalBuffer | string
  theirs: UniversalBuffer | string
  ourName?: string
  theirName?: string
}): MergeBlobsResult => {
  const baseContent = typeof base === 'string' ? base : base.toString('utf8')
  const ourContent = typeof ours === 'string' ? ours : ours.toString('utf8')
  const theirContent = typeof theirs === 'string' ? theirs : theirs.toString('utf8')

  const oursLines = ourContent.match(LINEBREAKS) || []
  const baseLines = baseContent.match(LINEBREAKS) || []
  const theirsLines = theirContent.match(LINEBREAKS) || []

  // Use diff3 library for the heavy lifting
  const result = diff3Merge(oursLines, baseLines, theirsLines)

  const markerSize = 7
  let mergedText = ''
  let hasConflict = false

  for (const item of result) {
    if ('ok' in item && item.ok) {
      mergedText += item.ok.join('')
    }
    if ('conflict' in item && item.conflict) {
      hasConflict = true
      mergedText += `${'<'.repeat(markerSize)} ${ourName}\n`
      mergedText += item.conflict.a.join('')
      mergedText += `${'='.repeat(markerSize)}\n`
      mergedText += item.conflict.b.join('')
      mergedText += `${'>'.repeat(markerSize)} ${theirName}\n`
    }
  }

  return {
    mergedContent: UniversalBuffer.from(mergedText, 'utf8'),
    hasConflict,
  }
}

