import { GitPktLine } from "../models/GitPktLine.ts"
import { UniversalBuffer } from "../git/backends/GitBackendFs/utils/UniversalBuffer.ts"
import { pkg } from "../git/backends/GitBackendFs/utils/pkg.ts"

export async function writeListRefsRequest({
  prefix,
  prefixes,
  symrefs = false,
  peelTags = false,
}: {
  prefix?: string
  prefixes?: string[]
  symrefs?: boolean
  peelTags?: boolean
}): Promise<UniversalBuffer[]> {
  const packstream: UniversalBuffer[] = []
  // command
  packstream.push(GitPktLine.encode('command=ls-refs\n'))
  // capability-list
  packstream.push(GitPktLine.encode(`agent=${pkg.agent}\n`))
  // [command-args]
  if (peelTags || symrefs || prefix || (prefixes && prefixes.length > 0)) {
    packstream.push(GitPktLine.delim())
  }
  if (peelTags) packstream.push(GitPktLine.encode('peel'))
  if (symrefs) packstream.push(GitPktLine.encode('symrefs'))
  if (prefix) packstream.push(GitPktLine.encode(`ref-prefix ${prefix}`))
  if (prefixes) {
    for (const p of prefixes) {
      packstream.push(GitPktLine.encode(`ref-prefix ${p}`))
    }
  }
  packstream.push(GitPktLine.flush())
  return packstream
}

