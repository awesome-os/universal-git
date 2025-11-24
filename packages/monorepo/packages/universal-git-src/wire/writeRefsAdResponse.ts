import { GitPktLine } from "../models/GitPktLine.ts"
import { pkg } from "../utils/pkg.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

export async function writeRefsAdResponse({
  capabilities,
  refs,
  symrefs,
}: {
  capabilities: Set<string> | string[]
  refs: Map<string, string> | Record<string, string>
  symrefs: Map<string, string> | Record<string, string>
}): Promise<UniversalBuffer[]> {
  const stream: UniversalBuffer[] = []
  // Compose capabilities string
  let syms = ''
  const symrefsEntries = symrefs instanceof Map ? symrefs.entries() : Object.entries(symrefs)
  for (const [key, value] of symrefsEntries) {
    syms += `symref=${key}:${value} `
  }
  const capabilitiesArray = capabilities instanceof Set ? [...capabilities] : capabilities
  let caps = `\x00${capabilitiesArray.join(' ')} ${syms}agent=${pkg.agent}`
  // stream.write(GitPktLine.encode(`# service=${service}\n`))
  // stream.write(GitPktLine.flush())
  // Note: In the edge case of a brand new repo, zero refs (and zero capabilities)
  // are returned.
  const refsEntries = refs instanceof Map ? refs.entries() : Object.entries(refs)
  for (const [key, value] of refsEntries) {
    stream.push(GitPktLine.encode(`${value} ${key}${caps}\n`))
    caps = ''
  }
  stream.push(GitPktLine.flush())
  return stream
}

