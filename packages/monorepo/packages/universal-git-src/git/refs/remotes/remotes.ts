import { listRefs } from '../listRefs.ts'
import { resolveRef } from '../readRef.ts'
import type { FileSystemProvider } from '../../../models/FileSystem.ts'

const REMOTES_PREFIX = 'refs/remotes'

type BaseArgs = {
  fs: FileSystemProvider
  gitdir: string
  remote: string
}

export async function listRemoteRefs({
  fs,
  gitdir,
  remote,
}: BaseArgs): Promise<string[]> {
  return listRefs({
    fs,
    gitdir,
    filepath: `${REMOTES_PREFIX}/${remote}`,
  })
}

export async function readRemoteRef({
  fs,
  gitdir,
  remote,
  branch,
  depth,
}: BaseArgs & { branch: string; depth?: number }): Promise<string> {
  return resolveRef({
    fs,
    gitdir,
    ref: `${REMOTES_PREFIX}/${remote}/${branch}`,
    depth,
  })
}

