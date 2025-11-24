import { readMergeHead } from './MERGE_HEAD.ts'
import { readCherryPickHead } from './CHERRY_PICK_HEAD.ts'
import { isRebaseInProgress } from '../../core-utils/algorithms/SequencerManager.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Checks if a merge is in progress
 */
export const isMergeInProgress = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<boolean> => {
  const mergeHead = await readMergeHead({ fs, gitdir })
  return mergeHead !== null
}

/**
 * Checks if a cherry-pick is in progress
 */
export const isCherryPickInProgress = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<boolean> => {
  const cherryPickHead = await readCherryPickHead({ fs, gitdir })
  return cherryPickHead !== null
}

/**
 * Gets the current operation state
 */
export type OperationState = {
  merge: { head: string; mode: string | null; message: string | null } | null
  cherryPick: { head: string } | null
  rebase: boolean
  origHead: string | null
}

export const getOperationState = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<OperationState> => {
  const [
    mergeHead,
    cherryPickHead,
    origHead,
    rebaseInProgress,
    mergeMode,
    mergeMsg,
  ] = await Promise.all([
    readMergeHead({ fs, gitdir }),
    readCherryPickHead({ fs, gitdir }),
    import('./ORIG_HEAD.ts').then(m => m.readOrigHead({ fs, gitdir })),
    isRebaseInProgress({ fs, gitdir }),
    import('./MERGE_MODE.ts').then(m => m.readMergeMode({ fs, gitdir })),
    import('./MERGE_MSG.ts').then(m => m.readMergeMsg({ fs, gitdir })),
  ])

  return {
    merge: mergeHead ? { head: mergeHead, mode: mergeMode, message: mergeMsg } : null,
    cherryPick: cherryPickHead ? { head: cherryPickHead } : null,
    rebase: rebaseInProgress,
    origHead,
  }
}

/**
 * Clears all operation state
 */
export const clearOperationState = async ({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<void> => {
  await Promise.all([
    import('./MERGE_HEAD.ts').then(m => m.deleteMergeHead({ fs, gitdir })),
    import('./CHERRY_PICK_HEAD.ts').then(m => m.deleteCherryPickHead({ fs, gitdir })),
    import('./ORIG_HEAD.ts').then(m => m.deleteOrigHead({ fs, gitdir })),
  ])
  // Note: Rebase state is cleared via SequencerManager
}

