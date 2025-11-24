export { FileSystem } from './FileSystem.ts'
export type { CallbackFsClient, PromiseFsClient, FileSystemProvider, RawFileSystemProvider, Stat } from './FileSystem.ts'
export { GitAnnotatedTag } from './GitAnnotatedTag.ts'
export type { TagObject, ReadTagResult } from './GitAnnotatedTag.ts'
export { GitConfig } from './GitConfig.ts'
export { GitCommit } from './GitCommit.ts'
export type { Author, CommitObject, ReadCommitResult } from './GitCommit.ts'
export { GitIndex } from '../git/index/GitIndex.ts'
export { GitMultiPackIndex } from './GitMultiPackIndex.ts'
export { GitObject } from './GitObject.ts'
export type { ObjectType } from './GitObject.ts'
export { GitPackIndex } from './GitPackIndex.ts'
export { GitPktLine } from './GitPktLine.ts'
export { GitRefSpec } from './GitRefSpec.ts'
export { GitRefSpecSet } from './GitRefSpecSet.ts'
export { GitRefStash } from './GitRefStash.ts'
export { GitSideBand } from './GitSideBand.ts'
export { GitTree } from './GitTree.ts'
export type { TreeEntry, TreeObject, ReadTreeResult } from './GitTree.ts'
export { GitWalkerFs } from './GitWalkerFs.ts'
export { GitWalkerIndex } from './GitWalkerIndex.ts'
export { GitWalkerRepo } from './GitWalkerRepo.ts'
export type {
  Walker,
  WalkerEntry,
  WalkerIterateCallback,
} from './Walker.ts'
export { 
  createWalkerEntry,
  WalkerFactory,
  WalkerMap,
  WalkerMapWithNulls,
  WalkerMapFiltered,
  WalkerReduce,
  WalkerReduceTree,
  WalkerReduceFlat,
  WalkerIterate,
} from './Walker.ts'
// Types are already exported as values above, no need to re-export as types
export { RunningMinimum } from './RunningMinimum.ts'

