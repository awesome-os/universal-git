import { resolveObject } from './resolveObject.ts'
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { GitCommit } from "../models/GitCommit.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommitObject } from "../models/GitCommit.ts"

export type ResolveCommitResult = {
  commit: CommitObject
  oid: string
}

export async function resolveCommit({
  fs,
  cache,
  gitdir,
  oid,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oid: string
}): Promise<ResolveCommitResult> {
  const { oid: resolvedOid, object } = await resolveObject({
    fs,
    cache,
    gitdir,
    oid,
    expectedType: 'commit',
    parser: (buf) => parseCommit(buf),
  })
  return { commit: object, oid: resolvedOid }
}

