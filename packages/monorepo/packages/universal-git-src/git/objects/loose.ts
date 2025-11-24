import { InternalError } from "../../errors/InternalError.ts"
import { toObjectPath } from '../../core-utils/GitPath.ts'
import { deflate, inflate } from '../../core-utils/Zlib.ts'
import { hashObject } from '../../core-utils/ShaHasher.ts'
import { GitObject } from "../../models/GitObject.ts"
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { ObjectFormat as HashObjectFormat } from '../../utils/detectObjectFormat.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

export type ObjectFormat = 'deflated' | 'wrapped' | 'content'

export type ReadResult = {
  object: UniversalBuffer
  format: string
  source: string
  type?: string
}

/**
 * Reads a loose object from the object database
 */
export async function read({
  fs,
  gitdir,
  oid,
  format = 'deflated',
  objectFormat = 'sha1',
}: {
  fs: FileSystemProvider
  gitdir: string
  oid: string
  format?: ObjectFormat
  objectFormat?: HashObjectFormat
}): Promise<ReadResult | null> {
  const source = toObjectPath(oid, objectFormat)
  const filepath = `${gitdir}/${source}`

  try {
    const file = await fs.read(filepath)
    if (!file) {
      return null
    }

    const fileBuffer = UniversalBuffer.from(file)

    // Loose objects are always stored deflated
    if (format === 'deflated') {
      return { object: fileBuffer, format: 'deflated', source }
    }

    // Inflate the object
    const inflated = await inflate(fileBuffer)

    // Always return wrapped format - let ObjectReader handle unwrapping and SHA verification
    // This ensures SHA checks happen on the wrapped object before unwrapping
    return { object: UniversalBuffer.from(inflated), format: 'wrapped', source }
  } catch {
    return null
  }
}

/**
 * Writes a loose object to the object database
 */
export async function write({
  fs,
  gitdir,
  type,
  content,
  format = 'content',
  oid,
  objectFormat = 'sha1',
}: {
  fs: FileSystemProvider
  gitdir: string
  type: string
  content: UniversalBuffer | Uint8Array
  format?: ObjectFormat
  oid?: string
  objectFormat?: HashObjectFormat
}): Promise<string> {
  let wrapped: UniversalBuffer
  let computedOid: string

  const contentBuffer = UniversalBuffer.from(content)

  // Convert to wrapped format
  if (format === 'content') {
    const wrappedUint8 = GitObject.wrap({ type, object: contentBuffer })
    wrapped = UniversalBuffer.from(wrappedUint8)
    computedOid = await hashObject({ type, content: contentBuffer, objectFormat })
  } else if (format === 'wrapped') {
    wrapped = contentBuffer
    // Extract type and content from wrapped object to compute OID
    const unwrapped = GitObject.unwrap(wrapped)
    computedOid = await hashObject({ type: unwrapped.type, content: unwrapped.object, objectFormat })
  } else {
    // format === 'deflated'
    if (!oid) {
      throw new InternalError('OID is required when writing deflated objects')
    }
    computedOid = oid
    // wrapped is not used in deflated format, but we need to assign it to satisfy TypeScript
    wrapped = contentBuffer
  }

  const finalOid = oid ?? computedOid

  // Deflate the wrapped object
  let deflated: UniversalBuffer
  if (format === 'deflated') {
    deflated = contentBuffer
  } else {
    deflated = UniversalBuffer.from(await deflate(wrapped))
  }

  // Write to disk
  const source = toObjectPath(finalOid, objectFormat)
  const filepath = `${gitdir}/${source}`

  // Don't overwrite existing git objects
  if (!(await fs.exists(filepath))) {
    await fs.write(filepath, deflated)
  }

  return finalOid
}

