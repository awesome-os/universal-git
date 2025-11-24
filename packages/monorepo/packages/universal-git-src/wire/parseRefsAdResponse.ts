import { EmptyServerResponseError } from "../errors/EmptyServerResponseError.ts"
import { ParseError } from "../errors/ParseError.ts"
import { GitPktLine } from "../models/GitPktLine.ts"
import { parseCapabilitiesV2 } from './parseCapabilitiesV2.ts'
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

type ReadFunction = () => Promise<UniversalBuffer | null | true>

export async function parseRefsAdResponse(
  stream: AsyncIterableIterator<Uint8Array>,
  { service }: { service: string }
): Promise<
  | { protocolVersion: 1; capabilities: Set<string>; refs: Map<string, string>; symrefs: Map<string, string> }
  | { protocolVersion: 2; capabilities2: Record<string, string | true> }
> {
  const capabilities = new Set<string>()
  const refs = new Map<string, string>()
  const symrefs = new Map<string, string>()

  // There is probably a better way to do this, but for now
  // let's just throw the result parser inline here.
  const read = GitPktLine.streamReader(stream)
  let lineOne: UniversalBuffer | null | true = await read()
  // skip past any flushes
  while (lineOne === null) lineOne = await read()

  if (lineOne === true) throw new EmptyServerResponseError()

  // Handle protocol v2 responses (Bitbucket Server doesn't include a `# service=` line)
  if (UniversalBuffer.isBuffer(lineOne) && lineOne.toString('utf8').includes('version 2')) {
    console.log('[Git Protocol] Detected protocol version 2 in first line')
    return parseCapabilitiesV2(read)
  }

  // Clients MUST ignore an LF at the end of the line.
  if (!UniversalBuffer.isBuffer(lineOne) || lineOne.toString('utf8').replace(/\n$/, '') !== `# service=${service}`) {
    throw new ParseError(`# service=${service}\\n`, UniversalBuffer.isBuffer(lineOne) ? lineOne.toString('utf8') : '')
  }
  let lineTwo: UniversalBuffer | null | true = await read()
  // skip past any flushes
  while (lineTwo === null) lineTwo = await read()
  // In the edge case of a brand new repo, zero refs (and zero capabilities)
  // are returned.
  if (lineTwo === true) return { protocolVersion: 1, capabilities, refs, symrefs }
  const lineTwoStr = UniversalBuffer.isBuffer(lineTwo) ? lineTwo.toString('utf8') : ''

  // Handle protocol v2 responses
  if (lineTwoStr.includes('version 2')) {
    console.log('[Git Protocol] Detected protocol version 2 in second line')
    return parseCapabilitiesV2(read)
  }

  const [firstRef, capabilitiesLine] = splitAndAssert(lineTwoStr, '\x00', '\\x00')
  capabilitiesLine.split(' ').forEach(x => {
    if (x) capabilities.add(x)
  })
  // see no-refs in https://git-scm.com/docs/pack-protocol#_reference_discovery (since git 2.41.0)
  if (firstRef !== '0000000000000000000000000000000000000000 capabilities^{}') {
    const [ref, name] = splitAndAssert(firstRef, ' ', ' ')
    refs.set(name, ref)
    while (true) {
      const line = await read()
      if (line === true) break
      if (line !== null && UniversalBuffer.isBuffer(line)) {
        const [ref, name] = splitAndAssert(line.toString('utf8'), ' ', ' ')
        refs.set(name, ref)
      }
    }
  }
  // Symrefs are thrown into the "capabilities" unfortunately.
  for (const cap of capabilities) {
    if (cap.startsWith('symref=')) {
      const m = cap.match(/symref=([^:]+):(.*)/)
      if (m && m.length === 3) {
        symrefs.set(m[1], m[2])
      }
    }
  }
  console.log(`[Git Protocol] Using protocol version 1 with ${refs.size} refs and ${capabilities.size} capabilities`)
  return { protocolVersion: 1, capabilities, refs, symrefs }
}

function splitAndAssert(line: string, sep: string, expected: string): [string, string] {
  const split = line.trim().split(sep)
  if (split.length !== 2) {
    throw new ParseError(`Two strings separated by '${expected}'`, line)
  }
  return [split[0], split[1]]
}

