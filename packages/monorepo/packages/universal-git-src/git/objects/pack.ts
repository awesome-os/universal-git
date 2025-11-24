import { GitPackIndex } from "../../models/GitPackIndex.ts"
import { GitMultiPackIndex } from "../../models/GitMultiPackIndex.ts"
import { join } from '../../core-utils/GitPath.ts'
import { detectObjectFormat, type ObjectFormat as HashObjectFormat } from "../../utils/detectObjectFormat.ts"
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { ProgressCallback } from "../remote/GitRemoteHTTP.ts"
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

const PackfileCache = Symbol('PackfileCache')
const MultiPackIndexCache = Symbol('MultiPackIndexCache')
const OidToPackfileCache = Symbol('OidToPackfileCache')
const ObjectCache = Symbol('ObjectCache')

export type ReadResult = {
  type: string
  object: UniversalBuffer
  format: string
  source: string
}

export type ObjectFormat = 'deflated' | 'wrapped' | 'content'

export type GetExternalRefDelta = (oid: string) => Promise<ReadResult>

/**
 * Helper to get filename from path
 */
const getBasename = (path: string) => path.split(/[/\\]/).pop()!

/**
 * Loads a packfile index from disk or cache
 */
const loadIndex = async ({
  fs,
  cache,
  filename,
  getExternalRefDelta,
  objectFormat,
  gitdir,
}: {
  fs: FileSystemProvider
  cache: Record<string | symbol, unknown>
  filename: string
  getExternalRefDelta: GetExternalRefDelta
  objectFormat?: HashObjectFormat
  gitdir?: string
}): Promise<GitPackIndex> => {
  // Try to get the packfile index from the in-memory cache
  if (!cache[PackfileCache]) cache[PackfileCache] = new Map()
  const cacheMap = cache[PackfileCache] as Map<string, GitPackIndex>
  let p = cacheMap.get(filename)
  
  if (!p) {
    const idx = await fs.read(filename)
    const idxBuffer = UniversalBuffer.from(idx as string | Uint8Array)
    // Detect object format if not provided (use cache to avoid repeated file reads)
    const format = objectFormat || (gitdir ? await detectObjectFormat(fs, gitdir, cache) : 'sha1')
    p = await GitPackIndex.fromIdx({ idx: idxBuffer, getExternalRefDelta, objectFormat: format })
    if (p) {
      cacheMap.set(filename, p)
    }
  }
  
  if (!p) {
    throw new Error(`Failed to load pack index: ${filename}`)
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
  objectFormat,
}: {
  fs: FileSystemProvider
  cache: Record<string | symbol, unknown>
  gitdir: string
  objectFormat?: HashObjectFormat
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
 * Loads a packfile index from a packfile (creates index on-the-fly)
 */
export async function loadIndexFromPack({
  pack,
  getExternalRefDelta,
  onProgress,
  objectFormat = 'sha1',
}: {
  pack: UniversalBuffer | Uint8Array
  getExternalRefDelta: GetExternalRefDelta
  onProgress?: ProgressCallback
  objectFormat?: HashObjectFormat
}): Promise<GitPackIndex> {
  const packBuffer = UniversalBuffer.isBuffer(pack) ? pack : UniversalBuffer.from(pack)
  return GitPackIndex.fromPack({ pack: packBuffer, getExternalRefDelta, onProgress, objectFormat })
}

/**
 * Reads an object from a packfile
 */
export async function read({
  fs,
  cache,
  gitdir,
  oid,
  format = 'content',
  getExternalRefDelta,
  objectFormat,
}: {
  fs: FileSystemProvider
  cache: Record<string | symbol, unknown>
  gitdir: string
  oid: string
  format?: ObjectFormat
  getExternalRefDelta: GetExternalRefDelta
  objectFormat?: HashObjectFormat
}): Promise<ReadResult | null> {
  const formatToUse = objectFormat || await detectObjectFormat(fs, gitdir, cache)
  
  // 1. Try Multi-Pack-Index (MIDX)
  const midx = await loadMultiPackIndex({ fs, cache, gitdir, objectFormat: formatToUse })
  if (midx) {
    const lookup = midx.lookup(oid)
    if (lookup) {
      const packfileName = midx.getPackfileName(lookup.packfileIndex)
      if (packfileName) {
        const packfilePath = join(gitdir, 'objects', 'pack', packfileName)
        const indexFile = packfilePath.replace(/\.pack$/, '.idx')
        try {
          const p = await loadIndex({
            fs, cache, filename: indexFile, getExternalRefDelta, objectFormat: formatToUse, gitdir,
          })
          
          if (!p.pack) {
            p.pack = fs.read(packfilePath) as Promise<UniversalBuffer>
          }

          const result = await p.read({ oid }) as ReadResult
          result.format = format === 'content' ? 'content' : 'wrapped'
          result.source = `objects/pack/${packfileName}`
          return result
        } catch {
          // Fallback if MIDX points to a corrupted/missing file
        }
      }
    }
  }

  // 2. Check OID Cache
  if (!cache[OidToPackfileCache]) {
    cache[OidToPackfileCache] = new Map<string, string>()
  }
  const oidToPackfileMap = cache[OidToPackfileCache] as Map<string, string>
  const cachedIndexFile = oidToPackfileMap.get(oid)

  if (cachedIndexFile) {
    try {
      const p = await loadIndex({
        fs, cache, filename: cachedIndexFile, getExternalRefDelta, objectFormat: formatToUse, gitdir,
      })

      if (p.offsets.has(oid)) {
        if (!p.pack) {
          const packFile = cachedIndexFile.replace(/idx$/, 'pack')
          p.pack = fs.read(packFile) as Promise<UniversalBuffer>
        }

        const result = await p.read({ oid }) as ReadResult
        result.format = format === 'content' ? 'content' : 'wrapped'
        result.source = `objects/pack/${getBasename(cachedIndexFile).replace(/idx$/, 'pack')}`
        
        if (format === 'content') {
          if (!cache[ObjectCache]) cache[ObjectCache] = new Map()
          ;(cache[ObjectCache] as Map<string, ReadResult>).set(oid, result)
        }
        
        return result
      } else {
        // Stale cache entry
        oidToPackfileMap.delete(oid)
      }
    } catch {
      // Corrupted index, remove from cache
      oidToPackfileMap.delete(oid)
    }
  }

  // 3. Scan Directory (Fallback)
  let list: string[] = []
  try {
    list = (await fs.readdir(join(gitdir, 'objects/pack'))) as string[]
    list = list.filter(x => x.endsWith('.idx'))
  } catch {
    return null
  }

  for (const filename of list) {
    const indexFile = `${gitdir}/objects/pack/${filename}`
    let p: GitPackIndex | null = null
    
    try {
      p = await loadIndex({
        fs, cache, filename: indexFile, getExternalRefDelta, objectFormat: formatToUse, gitdir,
      })
    } catch {
      continue
    }

    // Optimization: Since we paid the cost to load this index, map ALL its OIDs to this file.
    // This populates the cache lazily as we scan files, avoiding future scans for these objects.
    // We verify if the cache already has it to avoid unnecessary writes.
    if (p) {
      for (const packOid of p.offsets.keys()) {
        if (!oidToPackfileMap.has(packOid)) {
          oidToPackfileMap.set(packOid, indexFile)
        }
      }

      // Now check if this was the pack we needed
      if (p.offsets.has(oid)) {
        if (!p.pack) {
          const packFile = indexFile.replace(/idx$/, 'pack')
          p.pack = fs.read(packFile) as Promise<UniversalBuffer>
        }

        const result = await p.read({ oid }) as ReadResult
        result.format = format === 'content' ? 'content' : 'wrapped'
        result.source = `objects/pack/${filename.replace(/idx$/, 'pack')}`
        
        if (format === 'content') {
          if (!cache[ObjectCache]) cache[ObjectCache] = new Map()
          ;(cache[ObjectCache] as Map<string, ReadResult>).set(oid, result)
        }
        
        return result
      }
    }
  }

  return null
}

/**
 * Finds which packfile contains a given OID
 */
export async function findPackfile({
  fs,
  cache,
  gitdir,
  oid,
  getExternalRefDelta,
  objectFormat,
}: {
  fs: FileSystemProvider
  cache: Record<string | symbol, unknown>
  gitdir: string
  oid: string
  getExternalRefDelta: GetExternalRefDelta
  objectFormat?: HashObjectFormat
}): Promise<{ index: GitPackIndex; filename: string } | null> {
  const formatToUse = objectFormat || await detectObjectFormat(fs, gitdir, cache)
  
  // 1. Try MIDX
  const midx = await loadMultiPackIndex({ fs, cache, gitdir, objectFormat: formatToUse })
  if (midx) {
    const lookup = midx.lookup(oid)
    if (lookup) {
      const packfileName = midx.getPackfileName(lookup.packfileIndex)
      if (packfileName) {
        const packfilePath = join(gitdir, 'objects', 'pack', packfileName)
        const indexFile = packfilePath.replace(/\.pack$/, '.idx')
        try {
          const p = await loadIndex({
            fs, cache, filename: indexFile, getExternalRefDelta, objectFormat: formatToUse, gitdir,
          })
          if (p.offsets.has(oid)) {
            return { index: p, filename: indexFile }
          }
        } catch { /* ignore */ }
      }
    }
  }

  // 2. Try OID Cache (Fix: Added this step which was missing)
  if (!cache[OidToPackfileCache]) cache[OidToPackfileCache] = new Map()
  const oidToPackfileMap = cache[OidToPackfileCache] as Map<string, string>
  const cachedIndexFile = oidToPackfileMap.get(oid)

  if (cachedIndexFile) {
    try {
      const p = await loadIndex({
        fs, cache, filename: cachedIndexFile, getExternalRefDelta, objectFormat: formatToUse, gitdir,
      })
      if (p.offsets.has(oid)) {
        return { index: p, filename: cachedIndexFile }
      }
    } catch {
      oidToPackfileMap.delete(oid)
    }
  }

  // 3. Scan Directory
  let list: string[] = []
  try {
    list = (await fs.readdir(join(gitdir, 'objects/pack'))) as string[]
    list = list.filter(x => x.endsWith('.idx'))
  } catch {
    return null
  }

  for (const filename of list) {
    const indexFile = `${gitdir}/objects/pack/${filename}`
    try {
      const p = await loadIndex({
        fs, cache, filename: indexFile, getExternalRefDelta, objectFormat: formatToUse, gitdir,
      })
      
      // Populate cache lazily
      for (const packOid of p.offsets.keys()) {
        if (!oidToPackfileMap.has(packOid)) {
          oidToPackfileMap.set(packOid, indexFile)
        }
      }

      if (p.offsets.has(oid)) {
        return { index: p, filename: indexFile }
      }
    } catch {
      continue
    }
  }

  return null
}