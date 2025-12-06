/**
 * Main entry point for the uvgit TypeScript package
 */

// Core classes
export { GitDir } from './GitDir.ts';

// Handles
export { GitBaseHandle } from './handles/GitBaseHandle.ts';
export { GitRefHandle } from './handles/GitRefHandle.ts';
export { VirtualRefHandle } from './handles/VirtualRefHandle.ts';
export { GitLooseObjectHandle } from './handles/GitLooseObjectHandle.ts';
export { GitPackHandle } from './handles/GitPackHandle.ts';
export { GitPackIndexHandle } from './handles/GitPackIndexHandle.ts';
export { GitMultiPackIndexHandle } from './handles/GitMultiPackIndexHandle.ts';
export { GitPackedObjectHandle } from './handles/GitPackedObjectHandle.ts';
export { GitIndexHandle } from './handles/GitIndexHandle.ts';
export type { GitObjectType, ParsedGitObject } from './handles/GitLooseObjectHandle.ts';
export type { PackIndexEntry } from './handles/GitPackIndexHandle.ts';
export type { MidxLookupResult } from './handles/GitMultiPackIndexHandle.ts';
export type { IndexEntry } from './handles/GitIndexHandle.ts';

// Providers
export { GitDirProvider } from './providers/GitDirProvider.ts';
export { GitDirFsProvider } from './providers/GitDirFsProvider.ts';
export { GitDirObjectsProvider } from './providers/GitDirObjectsProvider.ts';
export { GitDirWorktreeProvider } from './providers/GitDirWorktreeProvider.ts';
export { GitDirNamespaceProvider } from './providers/GitDirNamespaceProvider.ts';
export { GitDirWorktreeDirProvider } from './providers/GitDirWorktreeDirProvider.ts';

// Utils
export { SparseCheckoutManager } from './utils/SparseCheckoutManager.ts';
export type { SparseCheckoutMode } from './utils/SparseCheckoutManager.ts';
export { PromisorConfigReader } from './utils/PromisorConfig.ts';
export type { PromisorConfig } from './utils/PromisorConfig.ts';
export { LFSPointerParser } from './utils/LFSPointerParser.ts';
export type { LFSPointer } from './utils/LFSPointerParser.ts';
export { FilterManager } from './utils/FilterManager.ts';
export type { Filter, GitAttributesEntry } from './utils/FilterManager.ts';
export { ShallowBoundary } from './utils/ShallowBoundary.ts';
export { detectObjectFormat, getOidLength, validateOid } from './utils/detectObjectFormat.ts';
export type { ObjectFormat } from './utils/detectObjectFormat.ts';

// Handles (continued)
export { PromisorObjectHandle } from './handles/PromisorObjectHandle.ts';
export type { RemoteFetcher } from './handles/PromisorObjectHandle.ts';
export { LFSWorktreeHandle } from './handles/LFSWorktreeHandle.ts';
export type { LFSCache, LFSClient } from './handles/LFSWorktreeHandle.ts';
export { CommitGraphHandle } from './handles/CommitGraphHandle.ts';
export type { CommitGraphEntry } from './handles/CommitGraphHandle.ts';

// Algorithms
export { GraphWalker } from './algorithms/GraphWalker.ts';

// Commands
export { clone } from './commands/clone.ts';
export type { CloneOptions, CloneResult } from './commands/clone.ts';

// Transport
export { GitHttpTransport } from './transport/GitHttpTransport.ts';
export type {
  HttpClient,
  GitAuth,
  ProgressCallback,
  AuthCallback,
  AuthSuccessCallback,
  AuthFailureCallback,
  RemoteDiscoverOptions,
  RemoteDiscoverResult,
  RemoteConnectOptions,
  RemoteConnection,
} from './transport/types.ts';

// Wire Protocol
export { GitPktLine } from './wire/GitPktLine.ts';
export { GitSideBand } from './wire/GitSideBand.ts';
export { writeUploadPackRequest } from './wire/writeUploadPackRequest.ts';
export { parseUploadPackResponse } from './wire/parseUploadPackResponse.ts';
export { parseRefAdvertisement } from './wire/parseRefAdvertisement.ts';
export type { UploadPackResponse } from './wire/parseUploadPackResponse.ts';
export type { ServerRef, RefAdvertisement } from './wire/parseRefAdvertisement.ts';

// Utils
export { writeRef, writeRefs, writeFetchHead } from './utils/refWriter.ts';
export { addRemote, setConfig } from './utils/configWriter.ts';
