import { GitPktLine } from "../models/GitPktLine.ts"

export type ParseUploadPackRequestResult = {
  capabilities: string[] | null
  wants: string[]
  haves: string[]
  shallows: string[]
  depth?: number
  since?: number
  exclude: string[]
  relative: boolean
  done: boolean
}

export async function parseUploadPackRequest(stream: AsyncIterableIterator<Uint8Array>): Promise<ParseUploadPackRequestResult> {
  const read = GitPktLine.streamReader(stream)
  let done = false
  let capabilities: string[] | null = null
  const wants: string[] = []
  const haves: string[] = []
  const shallows: string[] = []
  let depth: number | undefined
  let since: number | undefined
  const exclude: string[] = []
  let relative = false
  while (!done) {
    const line = await read()
    if (line === true) break
    if (line === null) continue
    const parts = line.toString('utf8').trim().split(' ')
    const [key, value, ...rest] = parts
    if (!capabilities) capabilities = rest
    switch (key) {
      case 'want':
        if (value) wants.push(value)
        break
      case 'have':
        if (value) haves.push(value)
        break
      case 'shallow':
        if (value) shallows.push(value)
        break
      case 'deepen':
        if (value) depth = parseInt(value, 10)
        break
      case 'deepen-since':
        if (value) since = parseInt(value, 10)
        break
      case 'deepen-not':
        if (value) exclude.push(value)
        break
      case 'deepen-relative':
        relative = true
        break
      case 'done':
        done = true
        break
    }
  }
  return {
    capabilities,
    wants,
    haves,
    shallows,
    depth,
    since,
    exclude,
    relative,
    done,
  }
}

