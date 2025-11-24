import { InternalError } from '../errors/InternalError.ts'
import { formatAuthor } from "../utils/formatAuthor.ts"
import { normalizeNewlines } from "../utils/normalizeNewlines.ts"
import { parseAuthor } from "../utils/parseAuthor.ts"
import type { Author } from './GitCommit.ts'
import type { ObjectType } from './GitObject.ts'
import type { SignCallback } from "../core-utils/Signing.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

// ============================================================================
// GIT TAG TYPES
// ============================================================================

/**
 * Git annotated tag object structure
 */
export type TagObject = {
  object: string // SHA-1 object id of object being tagged
  type: ObjectType
  tag: string // Tag name
  tagger: Author
  message: string
  gpgsig?: string // PGP signature (if present)
}

/**
 * Result of reading a tag object
 */
export type ReadTagResult = {
  oid: string // SHA-1 object id of this tag
  tag: TagObject // the parsed tag object
  payload: string // PGP signing payload
}

export class GitAnnotatedTag {
  private _tag: string

  constructor(tag: string | UniversalBuffer | TagObject) {
    if (typeof tag === 'string') {
      this._tag = tag
    } else if (UniversalBuffer.isBuffer(tag)) {
      this._tag = tag.toString('utf8')
    } else if (typeof tag === 'object') {
      this._tag = GitAnnotatedTag.render(tag)
    } else {
      throw new InternalError(
        'invalid type passed to GitAnnotatedTag constructor'
      )
    }
  }

  static from(tag: string | UniversalBuffer | TagObject): GitAnnotatedTag {
    return new GitAnnotatedTag(tag)
  }

  static render(obj: TagObject): string {
    return `object ${obj.object}
type ${obj.type}
tag ${obj.tag}
tagger ${formatAuthor(obj.tagger)}

${obj.message}
${obj.gpgsig ? obj.gpgsig : ''}`
  }

  justHeaders(): string {
    const index = this._tag.indexOf('\n\n')
    if (index === -1) return this._tag
    return this._tag.slice(0, index)
  }

  message(): string {
    const tag = this.withoutSignature()
    const index = tag.indexOf('\n\n')
    if (index === -1) return ''
    return tag.slice(index + 2)
  }

  parse(): TagObject {
    return Object.assign(this.headers(), {
      message: this.message(),
      gpgsig: this.gpgsig(),
    }) as TagObject
  }

  render(): string {
    return this._tag
  }

  headers(): Partial<TagObject> {
    const headers = this.justHeaders().split('\n')
    const hs: string[] = []
    for (const h of headers) {
      if (h[0] === ' ') {
        // combine with previous header (without space indent)
        hs[hs.length - 1] += '\n' + h.slice(1)
      } else {
        hs.push(h)
      }
    }
    const obj: Record<string, string | string[] | Author> = {}
    for (const h of hs) {
      const spaceIndex = h.indexOf(' ')
      if (spaceIndex === -1) continue
      const key = h.slice(0, spaceIndex)
      const value = h.slice(spaceIndex + 1)
      if (Array.isArray(obj[key])) {
        ;(obj[key] as string[]).push(value)
      } else {
        obj[key] = value
      }
    }
    if (obj.tagger && typeof obj.tagger === 'string') {
      obj.tagger = parseAuthor(obj.tagger)
    }
    if (obj.committer && typeof obj.committer === 'string') {
      obj.committer = parseAuthor(obj.committer)
    }
    return obj as Partial<TagObject>
  }

  withoutSignature(): string {
    const tag = normalizeNewlines(this._tag)
    const index = tag.indexOf('\n-----BEGIN PGP SIGNATURE-----')
    if (index === -1) return tag
    return tag.slice(0, tag.lastIndexOf('\n-----BEGIN PGP SIGNATURE-----'))
  }

  gpgsig(): string | undefined {
    if (this._tag.indexOf('\n-----BEGIN PGP SIGNATURE-----') === -1)
      return undefined
    const startIndex = this._tag.indexOf('-----BEGIN PGP SIGNATURE-----')
    const endIndex =
      this._tag.indexOf('-----END PGP SIGNATURE-----') +
      '-----END PGP SIGNATURE-----'.length
    const signature = this._tag.slice(startIndex, endIndex)
    return normalizeNewlines(signature)
  }

  payload(): string {
    return this.withoutSignature() + '\n'
  }

  toObject(): UniversalBuffer {
    return UniversalBuffer.from(this._tag, 'utf8')
  }

  static async sign(
    tag: GitAnnotatedTag,
    sign: SignCallback,
    secretKey?: string
  ): Promise<GitAnnotatedTag> {
    const payload = tag.payload()
    if (!secretKey) {
      throw new Error('secretKey is required for signing')
    }
    const signResult = await sign({ payload, secretKey })
    let signature: string
    if (typeof signResult === 'object' && 'signature' in signResult) {
      signature = signResult.signature
    } else {
      signature = String(signResult)
    }
    // renormalize the line endings to the one true line-ending
    signature = normalizeNewlines(signature)
    const signedTag = payload + signature
    // return a new tag object
    return GitAnnotatedTag.from(signedTag)
  }
}

