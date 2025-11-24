import { GitPktLine } from "../models/GitPktLine.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

type ReadFunction = () => Promise<UniversalBuffer | null | true>

export async function parseCapabilitiesV2(read: ReadFunction): Promise<{ protocolVersion: 2; capabilities2: Record<string, string | true> }> {
  const capabilities2: Record<string, string | true> = {}

  let line: UniversalBuffer | null | true
  while (true) {
    line = await read()
    if (line === true) break
    if (line === null) continue
    const lineStr = line.toString('utf8').replace(/\n$/, '')
    const i = lineStr.indexOf('=')
    if (i > -1) {
      const key = lineStr.slice(0, i)
      const value = lineStr.slice(i + 1)
      capabilities2[key] = value
    } else {
      capabilities2[lineStr] = true
    }
  }
  const capabilityCount = Object.keys(capabilities2).length
  console.log(`[Git Protocol] Using protocol version 2 with ${capabilityCount} capabilities`)
  return { protocolVersion: 2, capabilities2 }
}

