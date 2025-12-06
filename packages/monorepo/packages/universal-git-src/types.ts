// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================
// This file re-exports types from their decentralized locations.

// Filesystem types
export type {
  CallbackFsClient,
  PromiseFsClient,
  FileSystemProvider,
  Stat,
} from "./models/FileSystem.ts"

// HTTP and Auth types
export type {
  GitProgressEvent,
  ProgressCallback,
  GitHttpRequest,
  GitHttpResponse,
  HttpFetch,
  HttpClient,
  GitAuth,
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
} from "./git/remote/types.ts"

// Git Object types
export type { ObjectType } from "./models/GitObject.ts"
export type { Author, CommitObject, ReadCommitResult } from "./models/GitCommit.ts"
export type { TagObject, ReadTagResult } from "./models/GitAnnotatedTag.ts"
export type { TreeEntry, TreeObject, ReadTreeResult } from "./models/GitTree.ts"

// Ref types
export type { ServerRef, ClientRef, RefUpdateStatus } from "./git/refs/types.ts"

// Walker types
export type {
  Walker,
  WalkerEntry,
  WalkerMap,
  WalkerReduce,
  WalkerIterate,
  WalkerIterateCallback,
} from "./models/Walker.ts"

// Signing types
export type { SignParams, SignCallback } from "./core-utils/Signing.ts"

// Merge driver types
export type { MergeDriverParams, MergeDriverCallback } from "./git/merge/types.ts"

// API operation result types
export type { MessageCallback, PrePushParams, PrePushCallback, PushResult } from './git/backends/GitBackendFs/commands/push.ts'
export type { FetchResult } from './git/backends/GitBackendFs/commands/fetch.ts'
export type { MergeResult } from './git/backends/GitBackendFs/commands/merge.ts'
export type { CherryPickResult } from './git/backends/GitBackendFs/commands/cherryPick.ts'
export type { RebaseResult } from './git/backends/GitBackendFs/commands/rebase.ts'
export type { DiffEntry, DiffResult } from './git/backends/GitBackendFs/commands/diff.ts'
export type { ShowResult } from './git/backends/GitBackendFs/commands/show.ts'
export type { HeadStatus, WorkdirStatus, StageStatus, StatusRow } from './git/backends/GitBackendFs/commands/statusMatrix.ts'
export type { FileStatus } from './git/backends/GitBackendFs/commands/status.ts'
export type { PostCheckoutParams, PostCheckoutCallback } from './git/backends/GitBackendFs/commands/checkout.ts'
export type { StashOp, StashChangeType } from './git/backends/GitBackendFs/commands/stash.ts'
export type { ReadBlobResult } from './git/backends/GitBackendFs/commands/readBlob.ts'
export type { PackObjectsResult } from './git/backends/GitBackendFs/commands/packObjects.ts'
