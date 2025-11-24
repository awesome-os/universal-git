// @ts-check
import { GitTree } from "../models/GitTree.ts"
import { readObject } from "../git/objects/readObject.ts"
import { join } from './join.ts'
import { resolveTree } from './resolveTree.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { TreeEntry } from "../models/GitTree.ts"

// the empty file content object id
const EMPTY_OID = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'

export async function resolveFileIdInTree({
  fs,
  cache,
  gitdir,
  oid,
  fileId,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oid: string
  fileId: string
}): Promise<string | string[] | undefined> {
  if (fileId === EMPTY_OID) return
  const _oid = oid
  let filepath: string | string[] | undefined
  const result = await resolveTree({ fs, cache, gitdir, oid })
  const tree = result.tree
  if (fileId === result.oid) {
    filepath = ''
  } else {
    filepath = await _resolveFileId({
      fs,
      cache,
      gitdir,
      tree,
      fileId,
      oid: _oid,
    })
    if (Array.isArray(filepath)) {
      if (filepath.length === 0) filepath = undefined
      else if (filepath.length === 1) filepath = filepath[0]
    }
  }
  return filepath
}

async function _resolveFileId({
  fs,
  cache,
  gitdir,
  tree,
  fileId,
  oid,
  filepaths = [],
  parentPath = '',
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  tree: TreeEntry[]
  fileId: string
  oid: string
  filepaths?: string[]
  parentPath?: string
}): Promise<string[]> {
  const walks = tree.map(function (entry) {
    let result: Promise<string[]> | string | undefined
    if (entry.oid === fileId && entry.path) {
      result = join(parentPath, entry.path)
      filepaths.push(result)
    } else if (entry.type === 'tree') {
      result = readObject({
        fs,
        cache,
        gitdir,
        oid: entry.oid,
      }).then(async function ({ object }) {
        // Parse tree object to TreeEntry[] array
        const TreeParser = await import('../core-utils/parsers/Tree.ts')
        const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
        const format = await detectObjectFormat(fs, gitdir)
        const treeEntries = GitTree.from(TreeParser.parse(object, format), format).entries()
        return _resolveFileId({
          fs,
          cache,
          gitdir,
          tree: treeEntries,
          fileId,
          oid,
          filepaths,
          parentPath: join(parentPath, entry.path),
        })
      })
    }
    return result
  })

  const promises: Promise<string[]>[] = []
  for (const w of walks) {
    if (w instanceof Promise) {
      promises.push(w)
    }
  }
  await Promise.all(promises)
  return filepaths
}

