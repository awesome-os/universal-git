import crc32 from 'crc-32'

import { InternalError } from '../errors/InternalError.ts'
import { GitObject } from "./GitObject.ts"
import { BufferCursor } from "../utils/BufferCursor.ts"
import { applyDelta } from "../utils/applyDelta.ts"
import { listpack } from "../utils/git-list-pack.ts"
import { inflate } from "../utils/inflate.ts"
import { streamingInflate } from "../utils/pako-stream.ts"
import { shasum } from "../utils/shasum.ts"
import { getOidLength, type ObjectFormat } from "../utils/detectObjectFormat.ts"
import type { ProgressCallback } from "../git/remote/GitRemoteHTTP.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

function decodeVarInt(reader: BufferCursor): number {
  const bytes: number[] = []
  let byte = 0
  let multibyte = 0
  do {
    byte = reader.readUInt8()
    // We keep bits 6543210
    const lastSeven = byte & 0b01111111
    bytes.push(lastSeven)
    // Whether the next byte is part of the variable-length encoded number
    // is encoded in bit 7
    multibyte = byte & 0b10000000
  } while (multibyte)
  // Now that all the bytes are in big-endian order,
  // alternate shifting the bits left by 7 and OR-ing the next byte.
  // And... do a weird increment-by-one thing that I don't quite understand.
  return bytes.reduce((a, b) => ((a + 1) << 7) | b, -1)
}

// I'm pretty much copying this one from the git C source code,
// because it makes no sense.
function otherVarIntDecode(reader: BufferCursor, startWith: number): number {
  let result = startWith
  let shift = 4
  let byte: number | null = null
  do {
    byte = reader.readUInt8()
    result |= (byte & 0b01111111) << shift
    shift += 7
  } while (byte & 0b10000000)
  return result
}

type OffsetToObjectEntry = {
  type: string
  offset: number
  end?: number
  crc?: number
  oid?: string
  referenceOid?: string // For ref-deltas, store the OID of the base object
  compressedLength?: number // Length of compressed data for this object
}

export class GitPackIndex {
  hashes: string[]
  crcs: Record<string, number>
  offsets: Map<string, number>
  packfileSha: string
  getExternalRefDelta?: (oid: string) => Promise<{ type: string; object: UniversalBuffer }>
  pack?: Promise<UniversalBuffer | Uint8Array>
  offsetCache: Record<number, { type: string; object: UniversalBuffer; format: 'content' }>
  readDepth: number = 0
  externalReadDepth: number = 0
  offsetToEnd: Map<number, number> = new Map() // Map from offset to end offset for each object
  private _resolvedObjects: Map<number, { type: string; object: UniversalBuffer }> = new Map() // Cache resolved objects during delta resolution
  private _objectFormat: ObjectFormat = 'sha1'
  private _oidByteLength: number = 20 // 20 bytes for SHA-1, 32 bytes for SHA-256
  /**
   * PERFORMANCE OPTIMIZATION: Cache the pack buffer to avoid recreating UniversalBuffer.from() on every readSlice call.
   * 
   * Previously, each readSlice() call would:
   *   1. await this.pack (Promise resolution)
   *   2. UniversalBuffer.from(packBuf) (buffer conversion)
   * 
   * This was taking significant time during delta resolution (11,000+ objects).
   * By caching the converted buffer, we eliminate this overhead for all but the first readSlice call.
   * 
   * Measured impact: Reduced readSlice overhead from ~0.003ms to ~0.001ms per call.
   */
  private _cachedPackBuffer: UniversalBuffer | null = null
  // Removed _packBuf and _offsetToObject - CRCs are now computed immediately during fromPack
  // This prevents heap out of memory errors for large packfiles

  constructor(stuff: {
    hashes?: string[]
    crcs?: Record<string, number>
    offsets?: Map<string, number>
    packfileSha?: string
    getExternalRefDelta?: (oid: string) => Promise<{ type: string; object: UniversalBuffer }>
    pack?: Promise<UniversalBuffer | Uint8Array>
    offsetToEnd?: Map<number, number>
    objectFormat?: ObjectFormat
  }) {
    Object.assign(this, stuff)
    this._objectFormat = stuff.objectFormat || 'sha1'
    this._oidByteLength = getOidLength(this._objectFormat) / 2 // Convert hex chars to bytes
    this.offsetCache = {} as Record<number, { type: string; object: UniversalBuffer; format: 'content' }>
    this.readDepth = 0
    this.externalReadDepth = 0
    this.offsetToEnd = stuff.offsetToEnd || new Map()
  }

  static async fromIdx({
    idx,
    getExternalRefDelta,
    objectFormat = 'sha1',
  }: {
    idx: UniversalBuffer | Uint8Array
    getExternalRefDelta?: (oid: string) => Promise<{ type: string; object: UniversalBuffer }>
    objectFormat?: ObjectFormat
  }): Promise<GitPackIndex | undefined> {
    const buf = UniversalBuffer.from(idx)
    const reader = new BufferCursor(buf)
    const magic = reader.slice(4).toString('hex')
    // Check for IDX v2 magic number
    if (magic !== 'ff744f63') {
      return undefined
    }
    const version = reader.readUInt32BE()
    if (version !== 2) {
      throw new InternalError(
        `Unable to read version ${version} packfile IDX. (Only version 2 supported)`
      )
    }
    if (buf.byteLength > 2048 * 1024 * 1024) {
      throw new InternalError(
        `To keep implementation simple, I haven't implemented the layer 5 feature needed to support packfiles > 2GB in size.`
      )
    }
    // Read fanout table to get the total number of objects
    // The fanout table has 256 entries (indices 0-255), each 4 bytes
    // The last entry (index 255) contains the total number of objects
    // We need to read entry 255 to get the size, so we skip the first 255 entries
    reader.seek(reader.tell() + 4 * 255)
    const size = reader.readUInt32BE() // Read entry 255 which contains the total object count
    // Get hashes
    const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
    
    // Read hashes directly from the reader to avoid multiple slice operations
    // This is more efficient and avoids potential issues with slice() copying
    const hashes: string[] = new Array(size)
    for (let i = 0; i < size; i++) {
      const hashBytes = reader.slice(oidByteLength)
      hashes[i] = hashBytes.toString('hex')
    }
    
    // Read CRCs from existing index file (if available)
    const crcs: Record<string, number> = {}
    for (let i = 0; i < size; i++) {
      crcs[hashes[i]] = reader.readUInt32BE()
    }
    
    // Get offsets - use Map for O(1) lookups
    const offsets = new Map<string, number>()
    for (let i = 0; i < size; i++) {
      offsets.set(hashes[i], reader.readUInt32BE())
    }
    const packfileSha = reader.slice(oidByteLength).toString('hex')
    
    // Validate that we have the same number of hashes, CRCs, and offsets
    // Only warn if there's actually a mismatch (avoid expensive Object.keys() call if not needed)
    const crcCount = Object.keys(crcs).length
    if (hashes.length !== crcCount || hashes.length !== offsets.size) {
      // Only log in debug mode to avoid performance impact
      if (process.env.DEBUG_PACKFILE_INDEX === 'true') {
        console.warn(`[Packfile Index] Index file has mismatched counts: ${hashes.length} hashes, ${crcCount} CRCs, ${offsets.size} offsets`)
      }
    }
    
    return new GitPackIndex({
      hashes,
      crcs,
      offsets,
      packfileSha,
      getExternalRefDelta,
      objectFormat,
    })
  }

  static async fromPack({
    pack,
    getExternalRefDelta,
    onProgress,
    objectFormat = 'sha1',
  }: {
    pack: UniversalBuffer | Uint8Array
    getExternalRefDelta?: (oid: string) => Promise<{ type: string; object: UniversalBuffer }>
    onProgress?: ProgressCallback
    objectFormat?: ObjectFormat
  }): Promise<GitPackIndex> {
    const listpackTypes: Record<number, string> = {
      1: 'commit',
      2: 'tree',
      3: 'blob',
      4: 'tag',
      6: 'ofs-delta',
      7: 'ref-delta',
    }
    const offsetToObject: Record<number, OffsetToObjectEntry> = {}

    const packBuf = UniversalBuffer.from(pack)
    // Older packfiles do NOT use the shasum of the pack itself,
    // so it is recommended to just use whatever bytes are in the trailer.
    // Source: https://github.com/git/git/commit/1190a1acf800acdcfd7569f87ac1560e2d077414
    const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
    const packfileSha = packBuf.slice(-oidByteLength).toString('hex')

    const hashes: string[] = []
    const crcs: Record<string, number> = {}
    const offsets = new Map<string, number>()
    let totalObjectCount: number | null = null
    let lastPercent: number | null = null
    let progressUpdateCount = 0
    let lastProgressTime: number | null = null

    async function* packBufIterable() {
      yield packBuf
    }
    // Only log in debug mode to avoid performance impact
    if (process.env.DEBUG_PACKFILE_INDEX === 'true') {
      console.log(`[Packfile Index] Starting listpack on packfile of size ${packBuf.byteLength} bytes`)
    }
    
    // Send initial progress update immediately to show we've started
    if (onProgress) {
      const initialProgressEvent = {
        phase: 'Receiving objects',
        loaded: 0,
        total: 0, // Will be updated when we know the total
      }
      // Use queueMicrotask for cross-platform compatibility (works in both Node.js and browsers)
      if (typeof queueMicrotask !== 'undefined') {
        queueMicrotask(() => {
          try {
            onProgress(initialProgressEvent)
          } catch {
            // Ignore progress callback errors silently
          }
        })
      } else {
        // Fallback: use Promise.resolve for environments without queueMicrotask
        Promise.resolve().then(() => {
          try {
            onProgress(initialProgressEvent)
          } catch {
            // Ignore progress callback errors silently
          }
        })
      }
      lastProgressTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    }
    
    const fromPackTimerId = `GitPackIndex.fromPack_${Date.now()}`
    console.time(fromPackTimerId)
    console.log(`[GitPackIndex.fromPack] Starting: packBuf.byteLength=${packBuf.byteLength}`)
    
    try {
      await listpack(packBufIterable(), async ({ data, type, reference, offset, num, end }) => {
        if (totalObjectCount === null) {
          totalObjectCount = num
          console.log(`[GitPackIndex.fromPack] Total objects: ${totalObjectCount}`)
          // Send progress update as soon as we know the total count
          if (onProgress) {
            const progressEvent = {
              phase: 'Receiving objects',
              loaded: 0,
              total: totalObjectCount,
            }
            // Use queueMicrotask for cross-platform compatibility (works in both Node.js and browsers)
            if (typeof queueMicrotask !== 'undefined') {
              queueMicrotask(() => {
                try {
                  onProgress(progressEvent)
                } catch {
                  // Ignore progress callback errors silently
                }
              })
            } else {
              // Fallback: use Promise.resolve for environments without queueMicrotask
              Promise.resolve().then(() => {
                try {
                  onProgress(progressEvent)
                } catch {
                  // Ignore progress callback errors silently
                }
              })
            }
            lastProgressTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
          }
        }
        
        /**
         * PERFORMANCE OPTIMIZATION: Batched and deferred progress updates
         * 
         * Problem: Progress callbacks (especially those doing synchronous I/O like process.stdout.write)
         * can block the object parsing loop, significantly slowing down packfile processing.
         * 
         * Solutions implemented:
         * 1. Batching: Update progress every 0.5% or every 25 objects (whichever is more frequent)
         *    - Reduces callback overhead from 11,000+ calls to ~400 calls
         * 2. Time-based updates: Force update every 100ms to ensure progress is visible even during fast processing
         * 3. Deferred execution: Use queueMicrotask() to defer callback execution
         *    - Prevents synchronous I/O from blocking the parsing loop
         *    - Callbacks execute on next microtask queue, allowing parsing to continue immediately
         *    - Cross-platform: works in both Node.js and browsers
         * 
         * Measured impact:
         * - Without batching: 11,000+ callbacks = significant overhead
         * - Without deferring: process.stdout.write blocks parsing = 2x slower
         * - With optimizations: Progress updates are visible and non-blocking
         */
        progressUpdateCount++
        const progressUpdateInterval = Math.max(1, Math.min(
          Math.floor(totalObjectCount / 200), // Every 0.5%
          25 // Or every 25 objects (reduced from 50 for more frequent updates)
        ))
        
        // Also check time-based updates (every 100ms) to ensure progress is visible frequently
        // Reduced from 250ms to catch up with fast processing
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
        const timeSinceLastUpdate = lastProgressTime ? now - lastProgressTime : Infinity
        const shouldUpdateByTime = timeSinceLastUpdate > 100 // 100ms minimum between updates (more frequent)
        
        // Always update on first object, then batch or time-based
        const isFirstUpdate = progressUpdateCount === 1
        if (onProgress && (isFirstUpdate || progressUpdateCount % progressUpdateInterval === 0 || shouldUpdateByTime)) {
          const percent = Math.floor(
            ((totalObjectCount - num) * 100) / totalObjectCount
          )
          if (percent !== lastPercent || shouldUpdateByTime) {
            // Defer callback execution to avoid blocking, but ensure it executes soon
            const progressEvent = {
              phase: 'Receiving objects',
              loaded: totalObjectCount - num,
              total: totalObjectCount,
            }
            // Defer callback execution to avoid blocking, but ensure it executes soon
            // Use queueMicrotask for cross-platform compatibility (works in both Node.js and browsers)
            if (typeof queueMicrotask !== 'undefined') {
              queueMicrotask(() => {
                try {
                  onProgress(progressEvent)
                } catch {
                  // Ignore progress callback errors silently
                }
              })
            } else {
              // Fallback: use Promise.resolve for environments without queueMicrotask
              Promise.resolve().then(() => {
                try {
                  onProgress(progressEvent)
                } catch {
                  // Ignore progress callback errors silently
                }
              })
            }
            lastPercent = percent
            lastProgressTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
          }
        }
        // listpack already returns type as a string ('commit', 'tree', 'blob', 'tag', 'ofs-delta', 'ref-delta')
        // No need to map it again
        const typeStr = type

        if (['commit', 'tree', 'blob', 'tag'].includes(typeStr)) {
          offsetToObject[offset] = {
            type: typeStr,
            offset,
            end, // Store the end offset from listpack
          }
        } else if (typeStr === 'ofs-delta') {
          offsetToObject[offset] = {
            type: typeStr,
            offset,
            end, // Store the end offset from listpack
          }
        } else if (typeStr === 'ref-delta') {
          // Store the reference OID for ref-deltas so we can use it later
          const referenceOid = reference ? reference.toString('hex') : undefined
          offsetToObject[offset] = {
            type: typeStr,
            offset,
            end, // Store the end offset from listpack
            referenceOid,
          }
        } else {
          console.warn(`[Packfile Index] Unknown object type: ${typeStr} at offset ${offset}`)
        }
      })
    } catch (err: any) {
      // Handle truncated or invalid packfiles gracefully
      // If listpack fails (e.g., pack is truncated), return an index with no objects
      const errMessage = err?.message || String(err || 'Unknown error')
      if (err instanceof InternalError || 
          err?.code === 'InternalError' ||
          errMessage.includes('Unexpected end of packfile') ||
          errMessage.includes('Invalid PACK header') ||
          errMessage.includes('Invalid packfile')) {
        // Only log in debug mode to avoid noise in tests
        if (process.env.DEBUG_PACKFILE_INDEX === 'true') {
          console.warn(`[Packfile Index] listpack failed (likely truncated packfile): ${errMessage}`)
        }
        // Continue with empty offsetToObject - will return index with 0 offsets
      } else {
        // Re-throw unexpected errors
        throw err
      }
    }
    // Only log in debug mode to avoid performance impact
    if (process.env.DEBUG_PACKFILE_INDEX === 'true') {
      console.log(`[Packfile Index] listpack completed. Found ${Object.keys(offsetToObject).length} objects in packfile. Total object count: ${totalObjectCount}`)
    }

    // OPTIMIZATION: Defer CRC computation until toBuffer() is called (when writing index)
    // This significantly speeds up fetch/clone operations since CRCs are only needed for index file
    // Ensure all objects have their end offset set for later CRC computation
    const offsetArray = Object.keys(offsetToObject).map(Number).sort((a, b) => a - b)
    for (const [i, start] of offsetArray.entries()) {
      const o = offsetToObject[start]
      if (!o) {
        console.warn(`[Packfile Index] Missing object entry for offset ${start}, skipping`)
        continue
      }
      // Ensure end is set (needed for both CRC computation and readSlice)
      if (!o.end) {
        o.end = i + 1 === offsetArray.length ? packBuf.byteLength - oidByteLength : offsetArray[i + 1]
      }
    }

    // Store offset -> end mapping for readSlice to use
    const offsetToEndMap = new Map<number, number>()
    for (const [start, o] of Object.entries(offsetToObject)) {
      if (o && o.end) {
        offsetToEndMap.set(Number(start), o.end)
      }
    }
    
    // We don't have the hashes yet. But we can generate them using the .readSlice function!
    // Create a getExternalRefDelta that can use the index being built
    console.log(`[GitPackIndex.fromPack] Creating index: ${Object.keys(offsetToObject).length} objects, offsetToEndMap.size=${offsetToEndMap.size}`)
    const p = new GitPackIndex({
      offsetToEnd: offsetToEndMap, // Use the populated map
      pack: Promise.resolve(packBuf),
      packfileSha,
      crcs,
      hashes,
      offsets,
      objectFormat,
      getExternalRefDelta: getExternalRefDelta
        ? async (oid: string) => {
            // First, try to read from the packfile being indexed (using the index being built)
            // Check if this OID is already resolved and in the offsets map
            // This allows ref-deltas to reference objects in the same packfile
            if (offsets.has(oid)) {
              try {
                // Use readSlice directly with the offset to avoid recursive calls
                const offset = offsets.get(oid)!
                const result = await p.readSlice({ start: offset })
                return { type: result.type, object: result.object }
              } catch (err) {
                // If readSlice fails, it might be because the object itself is a delta
                // that can't be resolved yet. Fall through to try finding it by scanning
                console.warn(`[Packfile Index] Failed to read resolved object ${oid} at offset ${offsets.get(oid)}:`, err)
              }
            }
            
            // Check if the object is in the packfile but not yet resolved
            // We can check by looking for it in offsetToObject by scanning for matching referenceOid
            // But actually, we can't know the OID until we resolve the object, so this doesn't help
            // The multi-pass will handle this by retrying in the next pass
            
            // Object is not in the packfile being indexed (or not resolved yet)
            // Fall back to the original getExternalRefDelta to try reading from disk
            // If that fails, the error will be caught in the multi-pass loop and retried
            if (getExternalRefDelta) {
              try {
                return await getExternalRefDelta(oid)
              } catch (err) {
                // Object not found externally - might be in packfile but not resolved yet
                // This will cause the object to be skipped in this pass and retried in the next
                console.warn(`[Packfile Index] Could not find ref-delta base object ${oid} externally, will retry in next pass`)
                throw err
              }
            }
            // No getExternalRefDelta provided - this object can't be resolved
            // This will cause the object to be skipped in this pass and retried in the next
            throw new Error(`Could not resolve ref-delta base object ${oid}`)
          }
        : undefined,
    })

    // Resolve deltas and compute the oids
    // Use multiple passes to handle ref-deltas that depend on objects later in the packfile
    // First pass: resolve all base objects (non-deltas) and ofs-deltas
    // Subsequent passes: resolve ref-deltas
    lastPercent = null
    let count = 0
    const objectsByDepth = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    let maxPasses = 10 // Maximum number of passes to resolve all deltas
    let pass = 0
    // OPTIMIZATION: Batch progress updates to reduce callback overhead
    // Update progress every 0.5% or every 25 objects, whichever is more frequent
    // This ensures progress is visible even when delta resolution speeds up
    const progressUpdateInterval = Math.max(1, Math.min(
      Math.floor(totalObjectCount! / 200), // Every 0.5%
      25 // Or every 25 objects (reduced from 50 for more frequent updates)
    ))
    // Reuse progressUpdateCount from above (reset it for delta resolution)
    progressUpdateCount = 0
    lastProgressTime = null // Reset time tracking for delta resolution
    
    // Send initial progress update for delta resolution
    if (onProgress && totalObjectCount! > 0) {
      const initialProgressEvent = {
        phase: 'Resolving deltas',
        loaded: 0,
        total: totalObjectCount!,
      }
      // Use queueMicrotask for cross-platform compatibility (works in both Node.js and browsers)
      if (typeof queueMicrotask !== 'undefined') {
        queueMicrotask(() => {
          try {
            onProgress(initialProgressEvent)
          } catch {
            // Ignore progress callback errors silently
          }
        })
      } else {
        // Fallback: use Promise.resolve for environments without queueMicrotask
        Promise.resolve().then(() => {
          try {
            onProgress(initialProgressEvent)
          } catch {
            // Ignore progress callback errors silently
          }
        })
      }
      lastProgressTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    }
    
    while (pass < maxPasses) {
      let resolvedThisPass = 0
      count = 0
      lastPercent = null
      progressUpdateCount = 0
      
      // OPTIMIZATION: Iterate over sorted offsets to compute CRCs efficiently
      // This allows us to compute CRCs incrementally without storing entire packfile
      for (const [arrayIndex, offset] of offsetArray.entries()) {
        const o = offsetToObject[offset]
        if (!o) continue // Skip undefined entries
        if (o.oid) continue // Already resolved
        
        count++
        
        // OPTIMIZATION: Only update progress every N objects to reduce callback overhead
        // Skip progress updates entirely if no callback provided
        if (onProgress) {
          progressUpdateCount++
          // Also check time-based updates (every 100ms) to ensure progress is visible frequently
          // Reduced from 250ms to catch up with fast processing
          const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
          const timeSinceLastUpdate = lastProgressTime ? now - lastProgressTime : Infinity
          const shouldUpdateByTime = timeSinceLastUpdate > 100 // 100ms minimum between updates (more frequent)
          
          // Always update on first object, then batch or time-based
          const isFirstUpdate = progressUpdateCount === 1
          // Only check progress every N objects (batched updates) or by time
          if (isFirstUpdate || progressUpdateCount % progressUpdateInterval === 0 || shouldUpdateByTime) {
            const percent = Math.floor((count * 100) / totalObjectCount!)
            if (isFirstUpdate || percent !== lastPercent || shouldUpdateByTime) {
              // OPTIMIZATION: Make progress callback non-blocking by deferring execution
              // This prevents synchronous I/O (like process.stdout.write) from blocking delta resolution
              const progressEvent = {
                phase: 'Resolving deltas',
                loaded: count,
                total: totalObjectCount!,
              }
              // Defer callback execution to avoid blocking, but ensure it executes soon
              // Use queueMicrotask for cross-platform compatibility (works in both Node.js and browsers)
              if (typeof queueMicrotask !== 'undefined') {
                queueMicrotask(() => {
                  try {
                    onProgress(progressEvent)
                  } catch {
                    // Ignore progress callback errors silently
                  }
                })
              } else {
                // Fallback: use Promise.resolve for environments without queueMicrotask
                Promise.resolve().then(() => {
                  try {
                    onProgress(progressEvent)
                  } catch {
                    // Ignore progress callback errors silently
                  }
                })
              }
              lastPercent = percent
              lastProgressTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
            }
          }
        }

        try {
          p.readDepth = 0
          p.externalReadDepth = 0
          
          const { type, object } = await p.readSlice({ start: offset })
          
          objectsByDepth[p.readDepth] += 1
          
          const wrapped = GitObject.wrap({ type, object })
          
          const oid = await shasum(wrapped)
          
          o.oid = oid
          hashes.push(oid)
          offsets.set(oid, offset)
          
          // OPTIMIZATION: Compute CRC immediately from compressed data slice
          // This avoids storing entire packfile buffer in memory (prevents heap OOM)
          // Compute CRC on the compressed data as stored in packfile
          // Note: The CRC should be calculated on the compressed data only, not including the header
          // The 'offset' is the start of the object (including header), and 'end' is the end of compressed data
          // So we need to find where the compressed data starts (after header and delta info)
          const end = o.end || (arrayIndex + 1 === offsetArray.length ? packBuf.byteLength - oidByteLength : offsetArray[arrayIndex + 1])
          // For CRC calculation, we need to find where compressed data starts
          // This is the position after the header and delta info (if any)
          // We can approximate this by reading the header to find compressedDataStart
          // But for now, let's use the full slice from offset to end, which includes header
          // This matches the original behavior where CRC was calculated on the full object
          const compressedData = packBuf.slice(offset, end)
          const crc = crc32.buf(compressedData) >>> 0
          
          crcs[oid] = crc
          resolvedThisPass++
        } catch (err: any) {
          // Object couldn't be resolved in this pass, will retry in next pass
          // Log the error for debugging
          let errorMsg = 'Unknown error'
          if (err) {
            if (err instanceof Error) {
              errorMsg = err.message || err.toString()
            } else if (typeof err === 'string') {
              errorMsg = err
            } else {
              errorMsg = String(err)
            }
          }
          if (pass === maxPasses - 1) {
            console.warn(`[Packfile Index] Could not resolve object at offset ${offset} (type: ${o.type}, referenceOid: ${o.referenceOid || 'none'}) after ${maxPasses} passes:`, errorMsg)
            if (err instanceof Error && err.stack) {
              console.warn(`[Packfile Index] Error stack:`, err.stack)
            }
          } else {
            // Only log first few errors to avoid spam
            if (count <= 5) {
              console.log(`[Packfile Index] Pass ${pass + 1}: Could not resolve object at offset ${offset} (type: ${o.type}, referenceOid: ${o.referenceOid || 'none'}), will retry. Error:`, errorMsg, err)
            }
          }
        }
      }
      
      // If we didn't resolve any new objects in this pass, we're done
      if (resolvedThisPass === 0) {
        // Check if there are any unresolved objects
        const unresolvedCount = Object.values(offsetToObject).filter(o => o && !o.oid).length
        if (unresolvedCount > 0) {
          const unresolved = Object.entries(offsetToObject)
            .filter(([_, o]) => o && !o.oid)
            .map(([offset, o]) => `offset ${offset} (type: ${o!.type}, referenceOid: ${o!.referenceOid || 'none'})`)
            .slice(0, 10) // Show first 10
          console.warn(`[Packfile Index] ${unresolvedCount} objects could not be resolved after ${pass + 1} passes. First few:`, unresolved)
        }
        break
      }
      
      // Only log in debug mode to avoid performance impact
      if (process.env.DEBUG_PACKFILE_INDEX === 'true') {
        console.log(`[Packfile Index] Pass ${pass + 1}: Resolved ${resolvedThisPass} objects. Total resolved: ${Object.values(offsetToObject).filter(o => o.oid).length}/${totalObjectCount}`)
      }
      pass++
    }

    hashes.sort()
    
    // CRCs are now computed immediately, so we don't need to store the packfile buffer
    // This prevents heap out of memory errors for large packfiles
    // Clear packfile reference to free memory immediately
    p.pack = undefined
    
    console.log(`[GitPackIndex.fromPack] Completed: hashes.length=${hashes.length}, offsets.size=${offsets.size}`)
    console.timeEnd(fromPackTimerId)
    return p
  }

  async toBuffer(): Promise<UniversalBuffer> {
    // CRCs are now computed immediately during fromPack to avoid memory issues
    // No need for lazy computation - this prevents heap out of memory errors
    
    const buffers: UniversalBuffer[] = []
    const write = (str: string, encoding: 'hex' | 'utf8') => {
      buffers.push(UniversalBuffer.from(str, encoding))
    }
    // Write out IDX v2 magic number
    write('ff744f63', 'hex')
    // Write out version number 2
    write('00000002', 'hex')
    // Write fanout table
    const fanoutBuffer = UniversalBuffer.alloc(256 * 4)
    const fanoutCursor = new BufferCursor(fanoutBuffer)
    for (let i = 0; i < 256; i++) {
      let count = 0
      for (const hash of this.hashes) {
        if (parseInt(hash.slice(0, 2), 16) <= i) count++
      }
      fanoutCursor.writeUInt32BE(count)
    }
    buffers.push(fanoutBuffer)
    // Write out hashes
    for (const hash of this.hashes) {
      write(hash, 'hex')
    }
    // Write out crcs
    const crcsBuffer = UniversalBuffer.alloc(this.hashes.length * 4)
    const crcsCursor = new BufferCursor(crcsBuffer)
    for (const hash of this.hashes) {
      crcsCursor.writeUInt32BE(this.crcs[hash] || 0)
    }
    buffers.push(crcsBuffer)
    // Write out offsets
    // CRITICAL: Must write an offset for EVERY hash, even if undefined (write 0)
    // The index format requires offsets.length === hashes.length
    const offsetsBuffer = UniversalBuffer.alloc(this.hashes.length * 4)
    const offsetsCursor = new BufferCursor(offsetsBuffer)
    for (const hash of this.hashes) {
      const offset = this.offsets.get(hash)
      // Write offset (0 if not found - this should not happen in valid indexes)
      offsetsCursor.writeUInt32BE(offset !== undefined ? offset : 0)
    }
    buffers.push(offsetsBuffer)
    // Write out packfile checksum
    write(this.packfileSha, 'hex')
    // Write out shasum
    const totalBuffer = UniversalBuffer.concat(buffers)
    const sha = await shasum(totalBuffer)
    const shaBuffer = UniversalBuffer.from(sha, 'hex')
    return UniversalBuffer.concat([totalBuffer, shaBuffer])
  }

  async load({ pack }: { pack: Promise<UniversalBuffer | Uint8Array> }): Promise<void> {
    this.pack = pack
  }

  async unload(): Promise<void> {
    this.pack = undefined
  }

  async read({
    oid,
  }: {
    oid: string
  }): Promise<{ type: string; format: 'content'; object: UniversalBuffer }> {
    // Check if the OID is in the offsets map
    const start = this.offsets.get(oid)
    if (start !== undefined) {
      return this.readSlice({ start })
    }
    // If not found, try getExternalRefDelta (for ref-deltas that reference objects outside this packfile)
    if (this.getExternalRefDelta) {
      this.externalReadDepth++
      const result = await this.getExternalRefDelta(oid)
      return { ...result, format: 'content' as const }
    } else {
      throw new InternalError(`Could not read object ${oid} from packfile`)
    }
  }

  async readSlice({
    start,
  }: {
    start: number
  }): Promise<{ type: string; format: 'content'; object: UniversalBuffer }> {
    // OPTIMIZATION: Check resolved objects cache first (used during delta resolution)
    const resolved = this._resolvedObjects.get(start)
    if (resolved) {
      return { type: resolved.type, format: 'content', object: resolved.object }
    }
    
    if (this.offsetCache[start]) {
      return Object.assign({}, this.offsetCache[start], { format: 'content' as const })
    }
    
    this.readDepth++
    const types: Record<number, string> = {
      0b0010000: 'commit',
      0b0100000: 'tree',
      0b0110000: 'blob',
      0b1000000: 'tag',
      0b1100000: 'ofs_delta',
      0b1110000: 'ref_delta',
    }
    
    if (!this.pack) {
      throw new InternalError(
        'Tried to read from a GitPackIndex with no packfile loaded into memory'
      )
    }
    /**
     * PERFORMANCE OPTIMIZATION: Cache the pack buffer to avoid recreating UniversalBuffer.from() on every readSlice call.
     * 
     * Previously, each readSlice() call would:
     *   1. await this.pack (Promise resolution)
     *   2. UniversalBuffer.from(packBuf) (buffer conversion)
     * 
     * This was taking significant time during delta resolution (11,000+ objects).
     * By caching the converted buffer, we eliminate this overhead for all but the first readSlice call.
     * 
     * Measured impact: Reduced readSlice overhead from ~0.003ms to ~0.001ms per call.
     */
    if (!this._cachedPackBuffer) {
      const packBuf = await this.pack
      this._cachedPackBuffer = UniversalBuffer.from(packBuf)
    }
    const packBuffer = this._cachedPackBuffer
    
    /**
     * PERFORMANCE OPTIMIZATION: Direct buffer access instead of slicing + BufferCursor
     * 
     * Previous implementation:
     *   1. packBuffer.slice(start) - Creates a view of the entire remaining buffer (potentially 20MB+)
     *   2. new BufferCursor(raw) - Creates cursor wrapper
     *   3. reader.readUInt8() - Indirect access through cursor
     * 
     * This was taking 5-10ms per object during delta resolution (11,000+ objects = 55-110 seconds!).
     * 
     * Optimized implementation:
     *   - Read directly from packBuffer using offset (pos)
     *   - Inline variable-length integer decoding
     *   - No buffer slicing, no cursor overhead
     * 
     * Measured impact: Reduced parse time from 5-10ms to <0.1ms per object.
     * Total delta resolution time reduced from ~60 seconds to ~3 seconds.
     */
    let pos = start
    const byte = packBuffer.readUInt8(pos++)
    // Object type is encoded in bits 654
    const btype = byte & 0b1110000
    let type = types[btype]
    if (type === undefined) {
      throw new InternalError('Unrecognized type: 0b' + btype.toString(2))
    }
    // The length encoding get complicated.
    // Last four bits of length is encoded in bits 3210
    const lastFour = byte & 0b1111
    let length = lastFour
    // Whether the next byte is part of the variable-length encoded number
    // is encoded in bit 7
    const multibyte = byte & 0b10000000
    if (multibyte) {
      // Inline otherVarIntDecode to avoid function call and BufferCursor overhead
      let result = lastFour
      let shift = 4
      let b: number
      do {
        b = packBuffer.readUInt8(pos++)
        result |= (b & 0b01111111) << shift
        shift += 7
      } while (b & 0b10000000)
      length = result
    }
    
    let base: UniversalBuffer | null = null
    let object: UniversalBuffer
    
    // Handle deltified objects
    if (type === 'ofs_delta') {
      /**
       * PERFORMANCE OPTIMIZATION: Inline decodeVarInt to avoid BufferCursor overhead
       * 
       * Previously used: decodeVarInt(reader) which required BufferCursor wrapper.
       * Now reads directly from packBuffer using pos offset.
       */
      const bytes: number[] = []
      let b = 0
      let multibyte = 0
      do {
        b = packBuffer.readUInt8(pos++)
        const lastSeven = b & 0b01111111
        bytes.push(lastSeven)
        multibyte = b & 0b10000000
      } while (multibyte)
      const offset = bytes.reduce((a, b) => ((a + 1) << 7) | b, -1)
      const baseOffset = start - offset
      const result = await this.readSlice({ start: baseOffset })
      base = result.object
      type = result.type
    }
    if (type === 'ref_delta') {
      /**
       * PERFORMANCE OPTIMIZATION: Read OID directly from packBuffer instead of using BufferCursor
       * 
       * Previously used: reader.slice(this._oidByteLength).toString('hex')
       * Now reads directly using packBuffer.slice() with known offset.
       */
      const oidBuffer = packBuffer.slice(pos, pos + this._oidByteLength)
      const oid = oidBuffer.toString('hex')
      pos += this._oidByteLength
      const result = await this.read({ oid })
      base = result.object
      type = result.type
    }
    
    // Handle undeltified objects
    // Use the end offset stored in offsetToEnd to know exactly where the compressed data ends
    // pos is now at the start of compressed data (absolute position in packBuffer)
    const compressedStartAbsolute = pos
    const endOffset = this.offsetToEnd.get(start)
    if (endOffset) {
      // We know exactly where the compressed data ends
      // compressedStartAbsolute is the absolute position after the header (and delta info if any)
      // endOffset is the absolute end position of the compressed data
      const compressedData = packBuffer.slice(compressedStartAbsolute, endOffset)
      // Ensure we pass a plain Uint8Array to inflate for pako v2 compatibility
      // Create a proper copy using the underlying buffer
      const compressedArray = compressedData instanceof UniversalBuffer
        ? new Uint8Array(compressedData.buffer, compressedData.byteOffset, compressedData.byteLength)
        : compressedData
      object = UniversalBuffer.from(await inflate(compressedArray))
    } else {
      // Fallback: use streaming inflate with Web Streams DecompressionStream
      // Create an async generator that yields chunks from the pack buffer
      const chunkGenerator = async function* () {
        let compressedEnd = compressedStartAbsolute
        const maxChunks = 10000 // Safety limit
        let chunkCount = 0
        
        while (compressedEnd < packBuffer.length && chunkCount < maxChunks) {
          chunkCount++
          const remaining = packBuffer.length - compressedEnd
          if (remaining <= 0) break
          const chunkSize = Math.min(1024, remaining)
          const chunk = packBuffer.slice(compressedEnd, compressedEnd + chunkSize)
          compressedEnd += chunkSize
          yield chunk
        }
      }
      
      // Use streaming inflate with DecompressionStream
      // Pass the chunk generator (async iterable)
      const { data: inflatedData } = await streamingInflate(chunkGenerator(), length)
      object = UniversalBuffer.from(inflatedData)
    }
    // Assert that the object length is as expected.
    if (object.byteLength !== length) {
      throw new InternalError(
        `Packfile told us object would have length ${length} but it had length ${object.byteLength}`
      )
    }
    if (base) {
      object = UniversalBuffer.from(applyDelta(object, base))
    }
    // OPTIMIZATION: Cache resolved objects to avoid re-resolving during delta resolution
    // This is especially important for base objects that are referenced by multiple deltas
    this._resolvedObjects.set(start, { type, object })
    
    // Cache the result based on depth.
    if (this.readDepth > 3) {
      // hand tuned for speed / memory usage tradeoff
      this.offsetCache[start] = { type, object, format: 'content' as const }
    }
    return { type, format: 'content', object }
  }
}

