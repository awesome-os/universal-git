import { GitObject } from "../../models/GitObject.ts"
import { write as writeLoose } from './loose.ts'
import { deflate } from '../../core-utils/Zlib.ts'
import { hashObject, shasum, shasum256, type ObjectFormat as HashObjectFormat } from '../../core-utils/ShaHasher.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

export type ObjectFormat = 'deflated' | 'wrapped' | 'content'

/**
 * High-level facade for writing objects to the object database
 * Currently only supports writing to loose objects (packfiles are read-only in this implementation)
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param type - Object type ('blob', 'tree', 'commit', 'tag')
 * @param object - Object content
 * @param format - Format of the input object ('deflated', 'wrapped', or 'content')
 * @param oid - Optional OID (required if format is 'deflated')
 * @param dryRun - If true, don't actually write to disk
 * @param objectFormat - Object format ('sha1' or 'sha256'), will detect if not provided
 * @returns Promise resolving to the OID of the written object
 */
export async function writeObject({
  fs,
  gitdir,
  type,
  object,
  format = 'content',
  oid,
  dryRun = false,
  objectFormat,
}: {
  fs: FileSystemProvider
  gitdir: string
  type: string
  object: UniversalBuffer | Uint8Array
  format?: ObjectFormat
  oid?: string
  dryRun?: boolean
  objectFormat?: HashObjectFormat
}): Promise<string> {
  let wrapped: UniversalBuffer
  let computedOid: string

  if (format !== 'deflated') {
    if (format !== 'wrapped') {
      const wrappedUint8 = GitObject.wrap({ type, object: UniversalBuffer.from(object) })
      wrapped = UniversalBuffer.from(wrappedUint8)
    } else {
      wrapped = UniversalBuffer.from(object)
    }
    // Hash the wrapped object directly (it's already wrapped, don't wrap again)
    // The wrapped object is in format "type size\0content"
    const formatToUse = objectFormat || 'sha1'
    computedOid = formatToUse === 'sha256' 
      ? await shasum256(wrapped)
      : await shasum(wrapped)
    object = UniversalBuffer.from(await deflate(wrapped))
  } else {
    computedOid = oid ?? ''
  }

  const finalOid = oid ?? computedOid

  if (!dryRun) {
    await writeLoose({ 
      fs, 
      gitdir, 
      type, 
      content: object, 
      format: 'deflated', 
      oid: finalOid,
      objectFormat: objectFormat || 'sha1'
    })
  }

  return finalOid
}

