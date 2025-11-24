import { GitPktLine } from "../models/GitPktLine.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import { pkg } from "../utils/pkg.ts"

export function writeUploadPackRequest({
  capabilities = [],
  wants = [],
  haves = [],
  shallows = [],
  depth = null,
  since = null,
  exclude = [],
  protocolVersion = 1,
}: {
  capabilities?: string[]
  wants?: string[]
  haves?: string[]
  shallows?: string[]
  depth?: number | null
  since?: Date | null
  exclude?: string[]
  protocolVersion?: 1 | 2
}): UniversalBuffer[] {
  const packstream: UniversalBuffer[] = []
  
  if (protocolVersion === 2) {
    // Protocol v2 format: command line first, then capability-list, then arguments
    packstream.push(GitPktLine.encode('command=fetch\n'))
    // Capability list - format: agent=... [capability1] [capability2] ...
    const capList = capabilities.length > 0 ? ` ${capabilities.join(' ')}` : ''
    packstream.push(GitPktLine.encode(`agent=${pkg.agent}${capList}\n`))
    // Delimiter before command arguments (want/have lines)
    packstream.push(GitPktLine.delim())
  }
  
  wants = [...new Set(wants)] // remove duplicates
  let firstLineCapabilities = protocolVersion === 1 ? ` ${capabilities.join(' ')}` : ''
  for (const oid of wants) {
    packstream.push(GitPktLine.encode(`want ${oid}${firstLineCapabilities}\n`))
    firstLineCapabilities = ''
  }
  for (const oid of shallows) {
    packstream.push(GitPktLine.encode(`shallow ${oid}\n`))
  }
  if (depth !== null && depth !== undefined) {
    packstream.push(GitPktLine.encode(`deepen ${depth}\n`))
  }
  if (since !== null && since !== undefined) {
    packstream.push(
      GitPktLine.encode(`deepen-since ${Math.floor(since.valueOf() / 1000)}\n`)
    )
  }
  for (const oid of exclude) {
    packstream.push(GitPktLine.encode(`deepen-not ${oid}\n`))
  }
  packstream.push(GitPktLine.flush())
  for (const oid of haves) {
    packstream.push(GitPktLine.encode(`have ${oid}\n`))
  }
  packstream.push(GitPktLine.encode(`done\n`))
  return packstream
}

