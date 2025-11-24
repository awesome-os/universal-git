/**
 * Git Bundle Format Writer
 * 
 * Creates bundle files in the Git bundle format
 */

import { GitPktLine } from '../../models/GitPktLine.ts'
import { writeRefsAdResponse } from '../../wire/writeRefsAdResponse.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

export interface BundleRef {
  ref: string
  oid: string
  capabilities?: string[]
}

/**
 * Writes a bundle file header and refs section
 * 
 * @param refs - Map of ref names to OIDs
 * @param version - Bundle version (2 or 3, default 2)
 * @returns UniversalBuffer array containing the bundle header and refs
 */
export async function writeBundleHeader(
  refs: Map<string, string> | Record<string, string>,
  version: 2 | 3 = 2
): Promise<UniversalBuffer[]> {
  const buffers: UniversalBuffer[] = []
  
  // Write bundle header
  buffers.push(UniversalBuffer.from(`# v${version} git bundle\n`, 'utf8'))
  
  // Write refs advertisement (similar to upload-pack refs advertisement)
  // Convert refs to the format expected by writeRefsAdResponse
  const refsMap = refs instanceof Map ? refs : new Map(Object.entries(refs))
  const symrefs = new Map<string, string>() // Bundles typically don't have symrefs
  
  // Write refs in pkt-line format
  const capabilities = new Set<string>()
  const refsEntries = refsMap.entries()
  
  for (const [ref, oid] of refsEntries) {
    // Format: "oid ref\n"
    buffers.push(GitPktLine.encode(`${oid} ${ref}\n`))
  }
  
  // Write flush packet to end refs section
  buffers.push(GitPktLine.flush())
  
  return buffers
}

/**
 * Creates a complete bundle file from refs and packfile
 * 
 * @param refs - Map of ref names to OIDs
 * @param packfile - Packfile data (UniversalBuffer or Uint8Array)
 * @param version - Bundle version (2 or 3, default 2)
 * @returns Complete bundle file as UniversalBuffer
 */
export async function writeBundle(
  refs: Map<string, string> | Record<string, string>,
  packfile: Uint8Array | UniversalBuffer,
  version: 2 | 3 = 2
): Promise<UniversalBuffer> {
  const headerBuffers = await writeBundleHeader(refs, version)
  const packfileBuffer = UniversalBuffer.isBuffer(packfile) ? packfile : UniversalBuffer.from(packfile)
  
  // Concatenate all buffers
  const totalLength = headerBuffers.reduce((sum, buf) => sum + buf.length, 0) + packfileBuffer.length
  const result = UniversalBuffer.alloc(totalLength)
  
  let offset = 0
  for (const buf of headerBuffers) {
    buf.copy(result, offset)
    offset += buf.length
  }
  packfileBuffer.copy(result, offset)
  
  return result
}

