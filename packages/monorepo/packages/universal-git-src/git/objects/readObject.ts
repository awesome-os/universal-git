import { InternalError } from "../../errors/InternalError.ts"
import { NotFoundError } from "../../errors/NotFoundError.ts"
import { GitObject } from "../../models/GitObject.ts"
import { read as readLoose } from './loose.ts'
import { read as readPacked, type GetExternalRefDelta } from './pack.ts'
import { shasum, shasum256 } from '../../core-utils/ShaHasher.ts'
import { inflate } from '../../core-utils/Zlib.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { detectObjectFormat, type ObjectFormat as HashObjectFormat } from '../../utils/detectObjectFormat.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

export type ReadResult = {
  type: string
  object: UniversalBuffer
  format: string
  source?: string
  oid?: string // Added by readObject command after reading
}

export type ObjectFormat = 'deflated' | 'wrapped' | 'content'

/**
 * High-level facade for reading objects from both loose and packed object stores
 * 
 * @param fs - File system client
 * @param cache - Cache object for packfile indices
 * @param gitdir - Path to .git directory
 * @param oid - Object ID (SHA-1 or SHA-256)
 * @param format - Format to return object in ('deflated', 'wrapped', or 'content')
 * @param objectFormat - Object format ('sha1' or 'sha256'), will detect if not provided
 * @returns Promise resolving to the read object result
 */
const ObjectCache = Symbol('ObjectCache')

export async function readObject({
  fs,
  cache,
  gitdir,
  oid,
  format = 'content',
  objectFormat,
}: {
  fs: FileSystemProvider
  cache: Record<string | symbol, unknown>
  gitdir: string
  oid: string
  format?: ObjectFormat
  objectFormat?: HashObjectFormat
}): Promise<ReadResult> {
  // OPTIMIZATION: Cache read objects to avoid re-reading the same object multiple times
  // This is especially beneficial during merge operations where the same tree objects
  // are read multiple times (ours, base, theirs)
  if (!cache[ObjectCache]) {
    cache[ObjectCache] = new Map<string, ReadResult>()
  }
  const objectCache = cache[ObjectCache] as Map<string, ReadResult>
  
  // Check cache first (only for 'content' format to avoid format conversion issues)
  if (format === 'content') {
    const cached = objectCache.get(oid)
    if (cached) {
      // Return cached result (already in 'content' format)
      return cached
    }
  }
  
  // Normalize fs to ensure consistent behavior
  const normalizedFs = createFileSystem(fs)
  
  // Detect object format if not provided (use cache to avoid repeated file reads)
  const formatToUse = objectFormat || await detectObjectFormat(normalizedFs, gitdir, cache)
  
  // Curry the current read method so that the packfile un-deltification
  // process can acquire external ref-deltas.
  // GetExternalRefDelta expects pack.ts ReadResult (with required source), but readObject returns readObject ReadResult
  // We need to convert to pack.ts ReadResult format
  const getExternalRefDelta: GetExternalRefDelta = async (oid: string): Promise<import('./pack.ts').ReadResult> => {
    const result = await readObject({ fs: normalizedFs, cache, gitdir, oid, format: 'content', objectFormat: formatToUse })
    // Convert to pack.ts ReadResult format (source is required, oid is not part of pack ReadResult)
    return {
      type: result.type || 'blob',
      object: result.object,
      format: result.format,
      source: result.source || 'loose', // Default to 'loose' if not specified
    }
  }

  let result: ReadResult | null = null

  // Empty tree - hard-coded so we can use it as a shorthand.
  // Note: I think the canonical git implementation must do this too because
  // `git cat-file -t 4b825dc642cb6eb9a060e54bf8d69288fbee4904` prints "tree" even in empty repos.
  // For SHA-256, the empty tree OID is 64 zeros
  const { getOidLength } = await import('../../utils/detectObjectFormat.ts')
  const emptyTreeOid = formatToUse === 'sha256' 
    ? '0'.repeat(getOidLength('sha256'))
    : '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  if (oid === emptyTreeOid) {
    result = { format: 'wrapped', object: UniversalBuffer.from(`tree 0\x00`), type: 'tree' }
  }

  // Look for it in the loose object directory.
  if (!result) {
    const looseResult = await readLoose({ fs: normalizedFs, gitdir, oid, format, objectFormat: formatToUse })
    if (looseResult) {
      // Convert loose ReadResult to readObject ReadResult (ensure type is always string)
      result = {
        ...looseResult,
        type: looseResult.type || 'blob', // Ensure type is always defined
      }
    }
  }

  // Check to see if it's in a packfile.
  if (!result) {
    result = await readPacked({
      objectFormat: formatToUse,
      fs: normalizedFs,
      cache,
      gitdir,
      oid,
      format,
      getExternalRefDelta,
    })

    if (!result) {
      throw new NotFoundError(oid)
    }

    // Directly return packed result, as specified: packed objects always return the 'content' format.
    return result
  }

  // Loose objects are always deflated, return early
  if (format === 'deflated') {
    return result
  }

  // All loose objects are deflated but the hard-coded empty tree is `wrapped` so we have to check if we need to inflate the object.
  if (result.format === 'deflated') {
    result.object = UniversalBuffer.from(await inflate(result.object))
    result.format = 'wrapped'
  }

  if (format === 'wrapped') {
    return result
  }

  // Verify SHA and unwrap - use correct hash function based on object format
  // The wrapped object is already in the format "type size\0content"
  // We need to hash the wrapped object directly (not wrap it again)
  const computedOid = formatToUse === 'sha256' 
    ? await shasum256(result.object)
    : await shasum(result.object)
  if (computedOid !== oid) {
    throw new InternalError(`SHA check failed! Expected ${oid}, computed ${computedOid}`)
  }
  const { object, type } = GitObject.unwrap(result.object)
  result.type = type
  result.object = object
  result.format = 'content'

  if (format === 'content') {
    // Cache the result for future reads
    objectCache.set(oid, result)
    return result
  }

  throw new InternalError(`invalid requested format "${format}"`)
}

