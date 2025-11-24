import { AmbiguousError } from '../../errors/AmbiguousError.ts'
import { NotFoundError } from '../../errors/NotFoundError.ts'
import { readObject } from './readObject.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { join } from '../../core-utils/GitPath.ts'
import { GitPackIndex } from '../../models/GitPackIndex.ts'
import { GitMultiPackIndex } from '../../models/GitMultiPackIndex.ts'
import { detectObjectFormat, getOidLength, validateOid, type ObjectFormat } from '../../utils/detectObjectFormat.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

const PackfileCache = Symbol('PackfileCache')
const MultiPackIndexCache = Symbol('MultiPackIndexCache')

type GetExternalRefDelta = (oid: string) => Promise<{ type: string; object: UniversalBuffer }>

/**
 * Loads a packfile index from disk or cache
 */
const loadIndex = async ({
  fs,
  cache,
  filename,
  getExternalRefDelta,
  objectFormat,
}: {
  fs: FileSystemProvider
  cache: Record<string | symbol, unknown>
  filename: string
  getExternalRefDelta: GetExternalRefDelta
  objectFormat: ObjectFormat
}): Promise<GitPackIndex | undefined> => {
  if (!cache[PackfileCache]) cache[PackfileCache] = new Map()
  const cacheMap = cache[PackfileCache] as Map<string, GitPackIndex>
  // Include objectFormat in cache key to avoid conflicts between different formats
  const cacheKey = `${filename}:${objectFormat}`
  let p = cacheMap.get(cacheKey)
  if (!p) {
    const idx = await fs.read(filename)
    const idxBuffer = UniversalBuffer.isBuffer(idx) ? idx : UniversalBuffer.from(idx as string | Uint8Array)
    p = await GitPackIndex.fromIdx({ idx: idxBuffer, getExternalRefDelta, objectFormat })
    if (p) {
      cacheMap.set(cacheKey, p)
    }
  }
  return p
}

/**
 * Loads the multi-pack-index from disk or cache
 */
const loadMultiPackIndex = async ({
  fs,
  cache,
  gitdir,
}: {
  fs: FileSystemProvider
  cache: Record<string | symbol, unknown>
  gitdir: string
}): Promise<GitMultiPackIndex | null> => {
  if (!cache[MultiPackIndexCache]) {
    cache[MultiPackIndexCache] = null
  }
  let midx = cache[MultiPackIndexCache] as GitMultiPackIndex | null

  if (!midx) {
    const midxPath = join(gitdir, 'objects', 'info', 'multi-pack-index')
    try {
      const midxData = await fs.read(midxPath)
      const midxBuffer = UniversalBuffer.isBuffer(midxData)
        ? midxData
        : UniversalBuffer.from(midxData as string | Uint8Array)
      midx = GitMultiPackIndex.fromBuffer(midxBuffer)
      cache[MultiPackIndexCache] = midx
    } catch {
      return null
    }
  }

  return midx
}

/**
 * Expand a short object ID to a full OID (SHA-1 or SHA-256), checking both loose and packed objects
 * 
 * @param fs - File system client
 * @param cache - Cache object for packfile indices
 * @param gitdir - Path to .git directory
 * @param oid - Short object ID (prefix)
 * @param objectFormat - Object format ('sha1' or 'sha256'), will be detected if not provided
 * @returns Promise resolving to the full OID, or throwing if ambiguous/not found
 */
export async function expandOid({
  fs,
  cache,
  gitdir,
  oid: short,
  objectFormat,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oid: string
  objectFormat?: ObjectFormat
}): Promise<string> {
  // Detect object format if not provided
  const format = objectFormat || await detectObjectFormat(fs, gitdir)
  const expectedLength = getOidLength(format)
  
  // If already full length, validate and return
  if (short.length === expectedLength) {
    if (validateOid(short, format)) {
      return short
    }
    throw new NotFoundError(`an object matching "${short}"`)
  }
  
  // Minimum prefix length is 4 characters
  if (short.length < 4) {
    throw new NotFoundError(`an object matching "${short}" (minimum 4 characters required)`)
  }
  // Curry the current read method so that the packfile un-deltification
  // process can acquire external ref-deltas.
  const getExternalRefDelta = async (oid: string): Promise<{ type: string; object: UniversalBuffer }> => {
    const result = await readObject({ fs, cache, gitdir, oid })
    return {
      type: result.type || '',
      object: result.object,
    }
  }

  const results: string[] = []

  // Check loose objects
  const normalizedFs = createFileSystem(fs)
  const prefix = short.slice(0, 2)
  try {
    const objectsSuffixes = await normalizedFs.readdir(`${gitdir}/objects/${prefix}`)
    if (objectsSuffixes) {
      const looseOids = objectsSuffixes
        .map(suffix => `${prefix}${suffix}`)
        .filter(_oid => {
          // Filter by prefix match and validate full OID length matches expected format
          if (!_oid.startsWith(short)) return false
          // Only include OIDs that match the expected length for the format
          return _oid.length === expectedLength && validateOid(_oid, format)
        })
      results.push(...looseOids)
    }
  } catch {
    // Directory doesn't exist, that's okay
  }

  // Check packed objects
  // First, try to use multi-pack-index if it exists
  const midx = await loadMultiPackIndex({ fs, cache, gitdir })
  if (midx) {
    // MIDX has a method to get all OIDs, but we need to iterate through them
    // For now, we'll fall through to the packfile iteration below
  }

  // Iterate through all packfiles
  try {
    let list = await fs.readdir(join(gitdir, 'objects/pack'))
    list = (list as string[]).filter(x => x.endsWith('.idx'))

    for (const filename of list) {
      const indexFile = `${gitdir}/objects/pack/${filename}`
      const p = await loadIndex({
        fs,
        cache,
        filename: indexFile,
        getExternalRefDelta,
        objectFormat: format,
      })

      if (!p) continue

      // Check all OIDs in this packfile index
      // Use offsets.keys() which contains all OIDs in the packfile as Map keys
      // This is more reliable than hashes array which might not be populated in all cases
      for (const oid of p.offsets.keys()) {
        // Filter by prefix match and validate OID matches expected format
        if (oid.startsWith(short) && oid.length === expectedLength && validateOid(oid, format) && results.indexOf(oid) === -1) {
          results.push(oid)
        }
      }
    }
  } catch {
    // No packfiles or error reading them, that's okay
  }

  if (results.length === 1) {
    return results[0]
  }
  if (results.length > 1) {
    throw new AmbiguousError('oids', short, results)
  }
  throw new NotFoundError(`an object matching "${short}"`)
}

