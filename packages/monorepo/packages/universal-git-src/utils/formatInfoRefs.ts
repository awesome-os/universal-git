import type { ServerRef } from "../git/refs/types.ts"

type RemoteRefs = {
  refs: Map<string, string>
  symrefs: Map<string, string>
}

export function formatInfoRefs(remote: RemoteRefs, prefix: string, symrefs: boolean, peelTags: boolean): ServerRef[] {
  const refs: ServerRef[] = []
  for (const [key, value] of remote.refs) {
    if (prefix && !key.startsWith(prefix)) continue

    if (key.endsWith('^{}')) {
      if (peelTags) {
        const _key = key.replace('^{}', '')
        // Peeled tags are almost always listed immediately after the original tag
        const last = refs[refs.length - 1]
        const r = last && last.ref === _key ? last : refs.find(x => x.ref === _key)
        if (r === undefined) {
          throw new Error('I did not expect this to happen')
        }
        r.peeled = value
      }
      continue
    }
    const ref: ServerRef = { ref: key, oid: value }
    if (symrefs) {
      if (remote.symrefs.has(key)) {
        ref.target = remote.symrefs.get(key)
      }
    }
    refs.push(ref)
  }
  return refs
}

