import * as Errors from './git/errors/index.ts'
export { Errors }

export * from './git/backends/GitBackendFs/commands/listCommitsAndTags.ts'
export * from './git/backends/GitBackendFs/commands/listObjects.ts'
export * from './git/backends/GitBackendFs/commands/pack.ts'
export * from './git/backends/GitBackendFs/commands/uploadPack.ts'

// Manager classes removed - use src/git/ functions directly
// RefManager export removed - use capability modules from git/refs/ directly
// For backward compatibility, import functions directly:
// import { resolveRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'

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

export * from './git/backends/GitBackendFs/utils/calculateBasicAuthHeader.ts'
export * from './git/backends/GitBackendFs/utils/collect.ts'
export * from './git/backends/GitBackendFs/utils/comparePath.ts'
export * from './git/backends/GitBackendFs/utils/flatFileListToDirectoryStructure.ts'
export * from './git/backends/GitBackendFs/utils/isBinary.ts'
export * from './git/backends/GitBackendFs/utils/join.ts'
export * from './git/merge/index.ts'
export * from './git/backends/GitBackendFs/utils/modified.ts'
export * from './git/backends/GitBackendFs/utils/normalizeAuthorObject.ts'
export * from './git/backends/GitBackendFs/utils/normalizeCommitterObject.ts'
export * from './git/backends/GitBackendFs/utils/padHex.ts'
export * from './git/backends/GitBackendFs/utils/pkg.ts'
export * from './git/backends/GitBackendFs/utils/resolveTree.ts'
export * from './git/backends/GitBackendFs/utils/shasum.ts'
export * from './git/backends/GitBackendFs/utils/sleep.ts'
export * from './git/backends/GitBackendFs/utils/symbols.ts'

export * from './wire/parseReceivePackResponse.ts'
export * from './wire/parseRefsAdResponse.ts'
export * from './wire/parseUploadPackResponse.ts'
export * from './wire/parseUploadPackRequest.ts'
export * from './wire/writeReceivePackRequest.ts'
export * from './wire/writeRefsAdResponse.ts'
export * from './wire/writeUploadPackRequest.ts'
