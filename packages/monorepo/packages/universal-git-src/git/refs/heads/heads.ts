import { listRefs } from '../listRefs.ts'
import { resolveRef } from '../readRef.ts'
import { writeRef } from '../writeRef.ts'
import { deleteRef } from '../deleteRef.ts'
import type { FileSystemProvider } from '../../../models/FileSystem.ts'

const HEADS_PREFIX = 'refs/heads'

type BaseArgs = {
  fs: FileSystemProvider
  gitdir: string
}

export async function listHeadRefs({
  fs,
  gitdir,
}: BaseArgs): Promise<string[]> {
  return listRefs({ fs, gitdir, filepath: HEADS_PREFIX })
}

export async function readHeadRef({
  fs,
  gitdir,
  branch,
  depth,
}: BaseArgs & { branch: string; depth?: number }): Promise<string> {
  return resolveRef({
    fs,
    gitdir,
    ref: `${HEADS_PREFIX}/${branch}`,
    depth,
  })
}

export async function writeHeadRef({
  fs,
  gitdir,
  branch,
  value,
}: BaseArgs & { branch: string; value: string }): Promise<void> {
  await writeRef({
    fs,
    gitdir,
    ref: `${HEADS_PREFIX}/${branch}`,
    value,
  })
}

export async function deleteHeadRef({
  fs,
  gitdir,
  branch,
}: BaseArgs & { branch: string }): Promise<void> {
  await deleteRef({
    fs,
    gitdir,
    ref: `${HEADS_PREFIX}/${branch}`,
  })
}

