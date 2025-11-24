import { resolveObject } from './resolveObject.ts'
import { parse as parseTree } from "../core-utils/parsers/Tree.ts"
import { GitTree } from "../models/GitTree.ts"
import { detectObjectFormat, type ObjectFormat } from "./detectObjectFormat.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { TreeObject } from "../models/GitTree.ts"

export type ResolveTreeResult = {
  tree: TreeObject
  oid: string
}

export async function resolveTree({
  fs,
  cache,
  gitdir,
  oid,
  objectFormat,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oid: string
  objectFormat?: ObjectFormat
}): Promise<ResolveTreeResult> {
  // Detect object format if not provided
  const format = objectFormat || await detectObjectFormat(fs, gitdir)
  
  // Get empty tree OID based on format (SHA-1: 40 zeros, SHA-256: 64 zeros)
  const emptyTreeOid = format === 'sha256' 
    ? '0'.repeat(64) 
    : '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  
  const { oid: resolvedOid, object } = await resolveObject({
    fs,
    cache,
    gitdir,
    oid,
    expectedType: 'tree',
    parser: (buf) => {
      const gitTree = GitTree.from(parseTree(buf, format), format)
      return gitTree.entries()
    },
    emptyTreeOid,
  })
  return { tree: object, oid: resolvedOid }
}

