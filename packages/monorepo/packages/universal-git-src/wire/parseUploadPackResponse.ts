import { InvalidOidError } from "../errors/InvalidOidError.ts"
import { GitSideBand } from "../models/GitSideBand.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import { forAwait } from "../utils/forAwait.ts"
import type { FIFO } from "../utils/FIFO.ts"

export type ParseUploadPackResponseResult = {
  shallows: string[]
  unshallows: string[]
  acks: Array<{ oid: string; status?: string }>
  nak: boolean
  packfile: FIFO
  progress: FIFO
  finished: Promise<void>
  // Properties added by fetch.ts after parsing
  headers?: Record<string, string>
  pruned?: string[]
  HEAD?: string
  FETCH_HEAD?: { oid: string; description: string }
}

export async function parseUploadPackResponse(
  stream: AsyncIterableIterator<Uint8Array>,
  protocolVersion: 1 | 2 = 1
): Promise<ParseUploadPackResponseResult> {
  const { packetlines, packfile, progress, finished } = GitSideBand.demux(stream)
  const shallows: string[] = []
  const unshallows: string[] = []
  const acks: Array<{ oid: string; status?: string }> = []
  let nak = false
  let done = false
  let packetLinesDone = false // Track if packet line parsing is complete (for protocol v2)
  let inShallowInfo = false // Protocol v2: track if we're in shallow-info section
  let inUnshallowInfo = false // Protocol v2: track if we're in unshallow-info section
  
  return new Promise<ParseUploadPackResponseResult>((resolve, reject) => {
    // Parse the response
    forAwait(packetlines as unknown as AsyncIterable<UniversalBuffer>, async (data: UniversalBuffer) => {
      const line = data.toString('utf8').trim()
      
      // Protocol v2 specific handling
      if (protocolVersion === 2) {
        // Protocol v2 can use either section markers OR direct "shallow <oid>" format
        // Handle section markers first
        if (line === 'shallow-info') {
          inShallowInfo = true
          inUnshallowInfo = false
          return // Skip this line, wait for actual shallow OIDs
        } else if (line === 'unshallow-info') {
          inUnshallowInfo = true
          inShallowInfo = false
          return // Skip this line, wait for actual unshallow OIDs
        } else if (line === '') {
          // Empty line ends the current section in protocol v2
          inShallowInfo = false
          inUnshallowInfo = false
          return
        } else if (inShallowInfo && line.length === 40 && /^[0-9a-f]{40}$/i.test(line)) {
          // In shallow-info section, OID-only lines are shallow OIDs
          shallows.push(line)
          return
        } else if (inUnshallowInfo && line.length === 40 && /^[0-9a-f]{40}$/i.test(line)) {
          // In unshallow-info section, OID-only lines are unshallow OIDs
          unshallows.push(line)
          return
        } else if (line.startsWith('shallow ')) {
          // Protocol v2: "shallow <oid>" format (alternative to shallow-info section)
          const oid = line.slice(8).trim() // Remove "shallow " prefix
          if (oid.length === 40 && /^[0-9a-f]{40}$/i.test(oid)) {
            shallows.push(oid)
            console.log(`[parseUploadPackResponse] Protocol v2: received shallow ${oid}`)
          }
          return
        } else if (line.startsWith('unshallow ')) {
          // Protocol v2: "unshallow <oid>" format (alternative to unshallow-info section)
          const oid = line.slice(10).trim() // Remove "unshallow " prefix
          if (oid.length === 40 && /^[0-9a-f]{40}$/i.test(oid)) {
            unshallows.push(oid)
            console.log(`[parseUploadPackResponse] Protocol v2: received unshallow ${oid}`)
          }
          return
        } else if (line.startsWith('ack ')) {
          // Protocol v2: "ack <oid>" or "ack <oid> <status>"
          // In protocol v2, we don't set done=true on ack - we wait for "packfile" or "nak"
          const parts = line.split(' ')
          const oid = parts[1]
          const status = parts[2]
          if (oid && oid.length === 40 && /^[0-9a-f]{40}$/i.test(oid)) {
            acks.push({ oid, status })
            console.log(`[parseUploadPackResponse] Protocol v2: received ack for ${oid}${status ? ` (${status})` : ''}`)
          }
          // Don't set done=true here - wait for "packfile" or "nak"
          return
        } else if (line === 'nak') {
          nak = true
          done = true
          console.log(`[parseUploadPackResponse] Protocol v2: received nak`)
          // Resolve immediately for nak (no packfile to wait for)
          resolve({ shallows, unshallows, acks, nak, packfile, progress, finished })
          return
        } else if (line.startsWith('packfile')) {
          // Protocol v2: "packfile" line indicates packfile follows
          // The packfile data will come through the side-band stream, not packet lines
          // Mark packet lines as done, but don't resolve the promise yet - wait for stream to finish
          console.log(`[parseUploadPackResponse] Protocol v2: packfile marker received, packfile data will follow in side-band stream`)
          packetLinesDone = true
          // Don't set done=true here - we need to wait for the stream to finish
          return
        } else {
          // Unknown protocol v2 line - skip it (could be other section markers or capabilities)
          // Don't fall through to v1 handling
          console.log(`[parseUploadPackResponse] Protocol v2: skipping unknown line: ${line}`)
          return
        }
      }
      
      // Protocol v1 handling (original logic)
      if (line.startsWith('shallow ')) {
        const oid = line.slice(8).trim() // Remove "shallow " prefix
        if (oid.length !== 40 || !/^[0-9a-f]{40}$/i.test(oid)) {
          reject(new InvalidOidError(oid))
          return
        }
        shallows.push(oid)
      } else if (line.startsWith('unshallow ')) {
        const oid = line.slice(10).trim() // Remove "unshallow " prefix
        if (oid.length !== 40 || !/^[0-9a-f]{40}$/i.test(oid)) {
          reject(new InvalidOidError(oid))
          return
        }
        unshallows.push(oid)
      } else if (line.startsWith('ACK')) {
        const parts = line.split(' ')
        const oid = parts[1]
        const status = parts[2]
        if (oid) {
          acks.push({ oid, status })
        }
        if (!status) done = true
      } else if (line.startsWith('NAK')) {
        nak = true
        done = true
      } else {
        done = true
        nak = true
      }
      if (done) {
        const streamAny = stream as any
        streamAny.error
          ? reject(streamAny.error)
          : resolve({ shallows, unshallows, acks, nak, packfile, progress, finished })
      }
    }).finally(async () => {
      // For protocol v2, if we saw "packfile" marker, wait for the stream to finish
      if (protocolVersion === 2 && packetLinesDone && !done) {
        // Protocol v2: packet lines are done, but packfile data is still coming
        // Wait for the side-band stream to finish before resolving
        console.log(`[parseUploadPackResponse] Protocol v2: packet line parsing complete, waiting for side-band stream to finish`)
        try {
          // Wait for finished to resolve (stream processing completes)
          await finished
          console.log(`[parseUploadPackResponse] Protocol v2: side-band stream finished, resolving parse promise`)
          resolve({ shallows, unshallows, acks, nak, packfile, progress, finished })
        } catch (err) {
          reject(err)
        }
        return
      }
      // For protocol v1 or Protocol v2 nak (which already resolved above, but safety check)
      // Only resolve if not already resolved (done might be true but promise not resolved yet)
      if (!done || (protocolVersion === 2 && done && !packetLinesDone)) {
        const streamAny = stream as any
        streamAny.error
          ? reject(streamAny.error)
          : resolve({ shallows, unshallows, acks, nak, packfile, progress, finished })
      }
    })
  })
}

