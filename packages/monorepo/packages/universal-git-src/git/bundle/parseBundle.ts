/**
 * Git Bundle Format Parser
 * 
 * Git bundles are single-file repositories that contain:
 * 1. A header line: "# v2 git bundle\n" or "# v3 git bundle\n"
 * 2. Refs advertisement in pkt-line format
 * 3. A flush packet (0000)
 * 4. Packfile data
 */

import { GitPktLine } from '../../models/GitPktLine.ts'
import { collect } from '../../utils/collect.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

export interface BundleRef {
  ref: string
  oid: string
  capabilities?: string[]
}

export interface BundleHeader {
  version: 2 | 3
  refs: BundleRef[]
}

/**
 * Parses the bundle header (version and refs) from a bundle file
 * 
 * @param bundleData - The bundle file data (Buffer or Uint8Array)
 * @returns Bundle header with version and refs
 */
export async function parseBundleHeader(
  bundleData: Uint8Array | UniversalBuffer
): Promise<BundleHeader> {
  const buffer = UniversalBuffer.isBuffer(bundleData) ? bundleData : UniversalBuffer.from(bundleData)
  
  // Read first line to get version
  let headerEnd = buffer.indexOf('\n')
  if (headerEnd === -1) {
    throw new Error('Invalid bundle format: missing header line')
  }
  
  const headerLine = buffer.subarray(0, headerEnd).toString('utf8')
  const versionMatch = headerLine.match(/^# v([23]) git bundle$/)
  if (!versionMatch) {
    throw new Error(`Invalid bundle format: invalid header "${headerLine}"`)
  }
  
  const version = parseInt(versionMatch[1], 10) as 2 | 3
  
  // Find the end of the refs section (flush packet)
  // The refs section uses pkt-line format
  let offset = headerEnd + 1 // Skip newline
  
  // Create a stream reader for pkt-lines
  const stream = (async function* () {
    yield buffer.subarray(offset)
  })()
  
  const read = GitPktLine.streamReader(stream)
  const refs: BundleRef[] = []
  
  while (true) {
    const line = await read()
    if (line === true) break // End of stream
    if (line === null) break // Flush packet (0000) - end of refs section
    
    const lineStr = line.toString('utf8').trim()
    if (lineStr === '') continue
    
    // Parse ref line: "oid ref\n" or "oid ref\x00capabilities\n"
    const nullIndex = lineStr.indexOf('\x00')
    const refLine = nullIndex >= 0 ? lineStr.substring(0, nullIndex) : lineStr
    
    const spaceIndex = refLine.indexOf(' ')
    if (spaceIndex === -1) continue
    
    const oid = refLine.substring(0, spaceIndex).trim()
    const ref = refLine.substring(spaceIndex + 1).trim()
    
    // Parse capabilities if present
    let capabilities: string[] | undefined
    if (nullIndex >= 0) {
      const capsStr = lineStr.substring(nullIndex + 1).trim()
      capabilities = capsStr ? capsStr.split(' ') : []
    }
    
    refs.push({ ref, oid, capabilities })
  }
  
  return { version, refs }
}

/**
 * Extracts the packfile data from a bundle file
 * 
 * @param bundleData - The bundle file data
 * @returns The packfile data (everything after the refs section)
 */
export async function extractPackfileFromBundle(
  bundleData: Uint8Array | UniversalBuffer
): Promise<UniversalBuffer> {
  const buffer = UniversalBuffer.isBuffer(bundleData) ? bundleData : UniversalBuffer.from(bundleData)
  
  // Find the header line end
  let offset = buffer.indexOf('\n') + 1
  
  // Find the packfile by searching for "PACK" magic number
  // The packfile starts with "PACK" (4 bytes)
  const packIndex = buffer.indexOf('PACK', offset)
  if (packIndex === -1) {
    throw new Error('Invalid bundle format: packfile not found')
  }
  
  // Work backwards from PACK to find the flush packet (0000)
  // The flush packet is 4 bytes: "0000"
  let flushIndex = packIndex - 4
  while (flushIndex >= offset) {
    const candidate = buffer.subarray(flushIndex, flushIndex + 4)
    if (candidate.toString('utf8') === '0000') {
      // Found flush packet - packfile starts after it (4 bytes)
      return buffer.subarray(flushIndex + 4)
    }
    flushIndex--
  }
  
  // If we can't find the flush packet, assume packfile starts at PACK
  // (some bundles might not have a flush packet)
  return buffer.subarray(packIndex)
}

/**
 * Parses a complete bundle file
 * 
 * @param bundleData - The bundle file data
 * @returns Bundle header and packfile data
 */
export async function parseBundle(
  bundleData: Uint8Array | UniversalBuffer
): Promise<{
  header: BundleHeader
  packfile: UniversalBuffer
}> {
  const header = await parseBundleHeader(bundleData)
  const packfile = await extractPackfileFromBundle(bundleData)
  
  return { header, packfile }
}

