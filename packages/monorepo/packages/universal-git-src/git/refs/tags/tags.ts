import { listRefs } from '../listRefs.ts'
import { resolveRef } from '../readRef.ts'
import { writeRef } from '../writeRef.ts'
import { deleteRef } from '../deleteRef.ts'
import type { FileSystemProvider } from '../../../models/FileSystem.ts'

const TAGS_PREFIX = 'refs/tags'

type BaseArgs = {
  fs: FileSystemProvider
  gitdir: string
}

export async function listTagRefs({
  fs,
  gitdir,
}: BaseArgs): Promise<string[]> {
  return listRefs({ fs, gitdir, filepath: TAGS_PREFIX })
}

export async function readTagRef({
  fs,
  gitdir,
  tag,
  depth,
}: BaseArgs & { tag: string; depth?: number }): Promise<string> {
  return resolveRef({
    fs,
    gitdir,
    ref: `${TAGS_PREFIX}/${tag}`,
    depth,
  })
}

export async function writeTagRef({
  fs,
  gitdir,
  tag,
  value,
}: BaseArgs & { tag: string; value: string }): Promise<void> {
  await writeRef({
    fs,
    gitdir,
    ref: `${TAGS_PREFIX}/${tag}`,
    value,
  })
}

export async function deleteTagRef({
  fs,
  gitdir,
  tag,
}: BaseArgs & { tag: string }): Promise<void> {
  await deleteRef({
    fs,
    gitdir,
    ref: `${TAGS_PREFIX}/${tag}`,
  })
}

