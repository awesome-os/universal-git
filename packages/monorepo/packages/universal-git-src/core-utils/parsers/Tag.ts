import { formatAuthor } from "../../utils/formatAuthor.ts"
import { normalizeNewlines } from "../../utils/normalizeNewlines.ts"
import { parseAuthor } from "../../utils/parseAuthor.ts"
import type { TagObject } from "../../models/GitAnnotatedTag.ts"
import type { Author } from "../../models/GitCommit.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

/**
 * Parses a tag buffer into a TagObject
 */
export const parse = (buffer: UniversalBuffer | Uint8Array | string): TagObject => {
  const tag =
    typeof buffer === 'string'
      ? buffer
      : UniversalBuffer.from(buffer).toString('utf8')

  const headers = parseHeaders(tag)
  const message = getMessage(tag)
  const gpgsig = getGpgsig(tag)

  return {
    ...headers,
    message,
    gpgsig,
  }
}

/**
 * Serializes a TagObject into a tag buffer
 */
export const serialize = (tag: TagObject): UniversalBuffer => {
  let result = `object ${tag.object}
type ${tag.type}
tag ${tag.tag}
tagger ${formatAuthor(tag.tagger)}

${tag.message}`

  if (tag.gpgsig) {
    result += '\n' + tag.gpgsig
  }

  return UniversalBuffer.from(result, 'utf8')
}

/**
 * Gets just the headers from a tag string
 */
export const justHeaders = (tag: string): string => {
  return tag.slice(0, tag.indexOf('\n\n'))
}

/**
 * Gets the message from a tag string
 */
export const getMessage = (tag: string): string => {
  const tagWithoutSig = withoutSignature(tag)
  return tagWithoutSig.slice(tagWithoutSig.indexOf('\n\n') + 2)
}

/**
 * Gets the GPG signature from a tag string
 */
export const getGpgsig = (tag: string): string | undefined => {
  if (tag.indexOf('\n-----BEGIN PGP SIGNATURE-----') === -1) return undefined
  const signature = tag.slice(
    tag.indexOf('-----BEGIN PGP SIGNATURE-----'),
    tag.indexOf('-----END PGP SIGNATURE-----') + '-----END PGP SIGNATURE-----'.length
  )
  return normalizeNewlines(signature)
}

/**
 * Removes the GPG signature from a tag string
 */
export const withoutSignature = (tag: string): string => {
  const normalized = normalizeNewlines(tag)
  if (normalized.indexOf('\n-----BEGIN PGP SIGNATURE-----') === -1) return normalized
  return normalized.slice(0, normalized.lastIndexOf('\n-----BEGIN PGP SIGNATURE-----'))
}

/**
 * Gets the payload for signing (tag without signature + newline)
 */
export const payload = (tag: string): string => {
  return withoutSignature(tag) + '\n'
}

type ParsedTagHeaders = {
  object: string
  type: 'blob' | 'tree' | 'commit' | 'tag'
  tag: string
  tagger: Author
}

/**
 * Parses tag headers into an object
 */
const parseHeaders = (tag: string): ParsedTagHeaders => {
  const headers = justHeaders(tag).split('\n')
  const hs: string[] = []
  for (const h of headers) {
    if (h[0] === ' ') {
      // combine with previous header (without space indent)
      hs[hs.length - 1] += '\n' + h.slice(1)
    } else {
      hs.push(h)
    }
  }
  const obj: Record<string, string> = {}
  for (const h of hs) {
    const spaceIndex = h.indexOf(' ')
    if (spaceIndex === -1) continue
    const key = h.slice(0, spaceIndex)
    const value = h.slice(spaceIndex + 1)
    if (Array.isArray(obj[key])) {
      ;(obj[key] as unknown as string[]).push(value)
    } else {
      obj[key] = value
    }
  }
  const result: Partial<ParsedTagHeaders> = {}
  if (obj.object) {
    result.object = obj.object
  }
  if (obj.type) {
    result.type = obj.type as 'blob' | 'tree' | 'commit' | 'tag'
  }
  if (obj.tag) {
    result.tag = obj.tag
  }
  if (obj.tagger) {
    result.tagger = parseAuthor(obj.tagger)
  }
  return result as ParsedTagHeaders
}

