import { GitPktLine } from "../models/GitPktLine.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { ServerRef } from "../git/refs/types.ts"

export async function parseListRefsResponse(stream: AsyncIterableIterator<Uint8Array>): Promise<ServerRef[]> {
  const read = GitPktLine.streamReader(stream)

  // TODO: when we re-write everything to minimize memory usage,
  // we could make this a generator
  const refs: ServerRef[] = []

  let line: UniversalBuffer | null | true
  while (true) {
    line = await read()
    if (line === true) break
    if (line === null) continue
    const lineStr = line.toString('utf8').replace(/\n$/, '')
    const parts = lineStr.split(' ')
    const [oid, ref, ...attrs] = parts
    const r: ServerRef = { ref, oid }
    for (const attr of attrs) {
      const [name, value] = attr.split(':')
      if (name === 'symref-target') {
        r.target = value
      } else if (name === 'peeled') {
        r.peeled = value
      }
    }
    refs.push(r)
  }

  return refs
}

