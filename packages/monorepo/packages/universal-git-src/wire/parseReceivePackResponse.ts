import { ParseError } from "../errors/ParseError.ts"
import { GitPktLine } from "../models/GitPktLine.ts"
import type { PushResult } from '../commands/push.ts'
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

export async function parseReceivePackResponse(packfile: AsyncIterableIterator<Uint8Array>): Promise<PushResult> {
  const result: PushResult = {
    ok: false,
    refs: {},
  }
  let response = ''
  const read = GitPktLine.streamReader(packfile)
  let line: UniversalBuffer | null | true = await read()
  while (line !== true) {
    if (line !== null && UniversalBuffer.isBuffer(line)) {
      response += line.toString('utf8') + '\n'
    }
    line = await read()
  }

  const lines = response.split('\n')
  // We're expecting "unpack {unpack-result}"
  const firstLine = lines.shift()
  if (!firstLine || !firstLine.startsWith('unpack ')) {
    throw new ParseError('unpack ok" or "unpack [error message]', firstLine || '')
  }
  result.ok = firstLine === 'unpack ok'
  if (!result.ok) {
    // Error message is in the first line after "unpack "
    // Store it in a special ref entry if needed, but typically errors are in refs
  }
  result.refs = {}
  for (const line of lines) {
    if (line.trim() === '') continue
    // Lines should be in format: "ok ref\n" or "ok ref error message\n" or "ng ref error message\n"
    if (line.length < 3) continue
    const status = line.slice(0, 2)
    if (status !== 'ok' && status !== 'ng') continue
    const refAndMessage = line.slice(3).trim() // Trim to remove trailing newline
    let space = refAndMessage.indexOf(' ')
    if (space === -1) space = refAndMessage.length
    const ref = refAndMessage.slice(0, space)
    const error = refAndMessage.slice(space + 1).trim() || undefined
    result.refs[ref] = {
      ok: status === 'ok',
      error: error,
    }
  }
  return result
}

