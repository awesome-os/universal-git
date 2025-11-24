import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

type LooseRef = {
  oid?: string
  symbolic: boolean
  target?: string
}

/**
 * Parses a packed-refs file buffer
 */
export const parsePackedRefs = (buffer: UniversalBuffer | string | null | undefined): Map<string, string> => {
  if (!buffer) return new Map()
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8')
  const refs = new Map<string, string>()
  const lines = text.trim().split('\n')
  let key: string | null = null

  for (const line of lines) {
    if (/^\s*#/.test(line)) {
      // Comment line, skip
      continue
    }

    const i = line.indexOf(' ')
    if (line.startsWith('^')) {
      // This is an OID for the commit associated with the annotated tag immediately preceding this line.
      // Trim off the '^'
      const value = line.slice(1)
      // The tagname^{} syntax is based on the output of `git show-ref --tags -d`
      if (key) {
        refs.set(key + '^{}', value)
      }
    } else if (i > 0) {
      // This is an oid followed by the ref name
      const value = line.slice(0, i)
      key = line.slice(i + 1)
      refs.set(key, value)
    }
  }

  return refs
}

/**
 * Parses a loose ref file buffer
 */
export const parseLooseRef = (buffer: UniversalBuffer | string): LooseRef => {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8').trim()

  if (text.startsWith('ref: ')) {
    return {
      symbolic: true,
      target: text.slice('ref: '.length).trim(),
    }
  }

  // Must be an OID (SHA-1: 40 chars, SHA-256: 64 chars)
  // We accept both formats since we can't determine format without gitdir
  if ((text.length === 40 || text.length === 64) && /^[0-9a-f]+$/i.test(text)) {
    return {
      oid: text,
      symbolic: false,
    }
  }

  throw new Error(`Invalid ref format: ${text}`)
}

/**
 * Serializes a packed-refs map back to file format
 */
export const serializePackedRefs = (refs: Map<string, string>): UniversalBuffer => {
  const lines: string[] = []
  const sortedRefs = Array.from(refs.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  for (const [ref, oid] of sortedRefs) {
    if (ref.endsWith('^{}')) {
      // This is a peeled tag, write with ^ prefix
      lines.push(`^${oid}`)
    } else {
      lines.push(`${oid} ${ref}`)
    }
  }

  return UniversalBuffer.from(lines.join('\n') + '\n', 'utf8')
}

/**
 * Serializes a loose ref to file format
 */
export const serializeLooseRef = (ref: LooseRef): UniversalBuffer => {
  if (ref.symbolic && ref.target) {
    return UniversalBuffer.from(`ref: ${ref.target}\n`, 'utf8')
  }

  if (ref.oid) {
    return UniversalBuffer.from(`${ref.oid}\n`, 'utf8')
  }

  throw new Error('Invalid ref: must have either oid or target')
}
