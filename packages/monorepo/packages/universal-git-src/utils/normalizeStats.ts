import { normalizeMode } from './normalizeMode.ts'
import type { Stat } from "../models/FileSystem.ts"

const MAX_UINT32 = 2 ** 32

type StatInput = {
  ctimeSeconds?: number
  ctimeNanoseconds?: number
  ctimeMs?: number
  ctime?: Date
  mtimeSeconds?: number
  mtimeNanoseconds?: number
  mtimeMs?: number
  mtime?: Date
  dev?: number
  ino?: number
  mode?: number
  uid?: number
  gid?: number
  size?: number
}

const SecondsNanoseconds = (
  givenSeconds: number | undefined,
  givenNanoseconds: number | undefined,
  milliseconds: number | undefined,
  date: Date | undefined
): [number, number] => {
  if (givenSeconds !== undefined && givenNanoseconds !== undefined) {
    return [givenSeconds, givenNanoseconds]
  }
  if (milliseconds === undefined) {
    milliseconds = date?.valueOf() ?? Date.now()
  }
  const seconds = Math.floor(milliseconds / 1000)
  const nanoseconds = (milliseconds - seconds * 1000) * 1000000
  return [seconds, nanoseconds]
}

export const normalizeStats = (e: StatInput): Stat => {
  const [ctimeSeconds, ctimeNanoseconds] = SecondsNanoseconds(
    e.ctimeSeconds,
    e.ctimeNanoseconds,
    e.ctimeMs,
    e.ctime
  )
  const [mtimeSeconds, mtimeNanoseconds] = SecondsNanoseconds(
    e.mtimeSeconds,
    e.mtimeNanoseconds,
    e.mtimeMs,
    e.mtime
  )

  return {
    ctimeSeconds: ctimeSeconds % MAX_UINT32,
    ctimeNanoseconds: ctimeNanoseconds % MAX_UINT32,
    mtimeSeconds: mtimeSeconds % MAX_UINT32,
    mtimeNanoseconds: mtimeNanoseconds % MAX_UINT32,
    dev: (e.dev ?? 0) % MAX_UINT32,
    ino: (e.ino ?? 0) % MAX_UINT32,
    mode: normalizeMode((e.mode ?? 0) % MAX_UINT32),
    uid: (e.uid ?? 0) % MAX_UINT32,
    gid: (e.gid ?? 0) % MAX_UINT32,
    // size of -1 happens over a BrowserFS HTTP Backend that doesn't serve Content-Length headers
    // (like the Karma webserver) because BrowserFS HTTP Backend uses HTTP HEAD requests to do fs.stat
    size: e.size && e.size > -1 ? e.size % MAX_UINT32 : 0,
  }
}

