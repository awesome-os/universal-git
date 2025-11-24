import { resolveObject } from './resolveObject.ts'
import { parse as parseBlob } from "../core-utils/parsers/Blob.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

export type ResolveBlobResult = {
  oid: string
  blob: Uint8Array
}

export async function resolveBlob({
  fs,
  cache,
  gitdir,
  oid,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oid: string
}): Promise<ResolveBlobResult> {
  const { oid: resolvedOid, object } = await resolveObject({
    fs,
    cache,
    gitdir,
    oid,
    expectedType: 'blob',
    parser: (buf) => new Uint8Array(parseBlob(buf)),
  })
  return { oid: resolvedOid, blob: object }
}

