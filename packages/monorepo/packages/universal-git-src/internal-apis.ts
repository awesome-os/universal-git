import * as Errors from './errors/index.ts'
export { Errors }

export * from './commands/listCommitsAndTags.ts'
export * from './commands/listObjects.ts'
export * from './commands/pack.ts'
export * from './commands/uploadPack.ts'

// Manager classes removed - use src/git/ functions directly
// RefManager export - GitRefManager alias for compatibility
export { RefManager as GitRefManager } from './core-utils/refs/RefManager.ts'

export * from './models/FileSystem.ts'
export * from './models/GitAnnotatedTag.ts'
export * from './models/GitCommit.ts'
export * from './models/GitConfig.ts'
export * from './git/index/GitIndex.ts'
export * from './models/GitObject.ts'
export * from './models/GitPackIndex.ts'
export * from './models/GitPktLine.ts'
export * from './models/GitRefSpec.ts'
export * from './models/GitRefSpecSet.ts'
export * from './models/GitSideBand.ts'
export * from './models/GitTree.ts'

// Storage functions exported from src/git/objects/:
export { readObject } from './git/objects/readObject.ts'
export { writeObject } from './git/objects/writeObject.ts'

export * from './utils/calculateBasicAuthHeader.ts'
export * from './utils/collect.ts'
export * from './utils/comparePath.ts'
export * from './utils/flatFileListToDirectoryStructure.ts'
export * from './utils/isBinary.ts'
export * from './utils/join.ts'
export * from './utils/mergeFile.ts'
export * from './utils/mergeTree.ts'
export * from './utils/modified.ts'
export * from './utils/normalizeAuthorObject.ts'
export * from './utils/normalizeCommitterObject.ts'
export * from './utils/padHex.ts'
export * from './utils/pkg.ts'
export * from './utils/resolveTree.ts'
export * from './utils/shasum.ts'
export * from './utils/sleep.ts'
export * from './utils/symbols.ts'

export * from './wire/parseReceivePackResponse.ts'
export * from './wire/parseRefsAdResponse.ts'
export * from './wire/parseUploadPackResponse.ts'
export * from './wire/parseUploadPackRequest.ts'
export * from './wire/writeReceivePackRequest.ts'
export * from './wire/writeRefsAdResponse.ts'
export * from './wire/writeUploadPackRequest.ts'
