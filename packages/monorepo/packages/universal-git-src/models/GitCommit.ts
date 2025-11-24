import { InternalError } from '../errors/InternalError.ts'
import { formatAuthor } from "../utils/formatAuthor.ts"
import { indent } from "../utils/indent.ts"
import { normalizeNewlines } from "../utils/normalizeNewlines.ts"
import { outdent } from "../utils/outdent.ts"
import { parseAuthor } from "../utils/parseAuthor.ts"
import type { SignCallback } from "../core-utils/Signing.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

// ============================================================================
// GIT COMMIT TYPES
// ============================================================================

/**
 * Author/Committer information
 */
export type Author = {
  name: string
  email: string
  timestamp: number // UTC Unix timestamp in seconds
  timezoneOffset: number // Timezone difference from UTC in minutes
}

/**
 * Git commit object structure
 */
export type CommitObject = {
  message: string
  tree: string // SHA-1 object id of corresponding file tree
  parent: string[] // Array of zero or more SHA-1 object ids
  author: Author
  committer: Author
  gpgsig?: string // PGP signature (if present)
}

/**
 * Result of reading a commit object
 */
export type ReadCommitResult = {
  oid: string // SHA-1 object id of this commit
  commit: CommitObject
  payload: string // PGP signing payload
}

export class GitCommit {
  private _commit: string

  constructor(commit: string | UniversalBuffer | CommitObject) {
    if (typeof commit === 'string') {
      this._commit = commit
    } else if (UniversalBuffer.isBuffer(commit)) {
      this._commit = commit.toString('utf8')
    } else if (typeof commit === 'object') {
      this._commit = GitCommit.render(commit)
    } else {
      throw new InternalError('invalid type passed to GitCommit constructor')
    }
  }

  static fromPayloadSignature({
    payload,
    signature,
  }: {
    payload: string
    signature: string
  }): GitCommit {
    const headers = GitCommit.justHeaders(payload)
    const message = GitCommit.justMessage(payload)
    const commit = normalizeNewlines(headers + '\ngpgsig' + indent(signature) + '\n' + message)
    return new GitCommit(commit)
  }

  static from(commit: string | UniversalBuffer | CommitObject): GitCommit {
    return new GitCommit(commit)
  }

  toObject(): UniversalBuffer {
    return UniversalBuffer.from(this._commit, 'utf8')
  }

  // Todo: allow setting the headers and message
  headers(): Partial<CommitObject> {
    return this.parseHeaders()
  }

  // Todo: allow setting the headers and message
  message(): string {
    return GitCommit.justMessage(this._commit)
  }

  parse(): CommitObject {
    return { ...this.headers(), message: this.message() } as CommitObject
  }

  static justMessage(commit: string): string {
    return normalizeNewlines(commit.slice(commit.indexOf('\n\n') + 2))
  }

  static justHeaders(commit: string): string {
    return commit.slice(0, commit.indexOf('\n\n'))
  }

  parseHeaders(): Partial<CommitObject> {
    const headers = GitCommit.justHeaders(this._commit).split('\n')
    const hs: string[] = []
    for (const h of headers) {
      if (h[0] === ' ') {
        // combine with previous header (without space indent)
        hs[hs.length - 1] += '\n' + h.slice(1)
      } else {
        hs.push(h)
      }
    }
    const obj: Record<string, string | string[] | Author> = {
      parent: [],
    }
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
    if (obj.author) {
      obj.author = parseAuthor(obj.author as string)
    }
    if (obj.committer) {
      obj.committer = parseAuthor(obj.committer as string)
    }
    return obj as Partial<CommitObject>
  }

  static renderHeaders(obj: CommitObject): string {
    let headers = ''
    if (obj.tree) {
      headers += `tree ${obj.tree}\n`
    } else {
      headers += `tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\n` // the null tree
    }
    if (obj.parent) {
      if (!Array.isArray(obj.parent)) {
        throw new InternalError(`commit 'parent' property should be an array`)
      }
      for (const p of obj.parent) {
        headers += `parent ${p}\n`
      }
    }
    const author = obj.author
    headers += `author ${formatAuthor(author)}\n`
    const committer = obj.committer ?? obj.author
    headers += `committer ${formatAuthor(committer)}\n`
    if (obj.gpgsig) {
      headers += 'gpgsig' + indent(obj.gpgsig)
    }
    return headers
  }

  static render(obj: CommitObject): string {
    return GitCommit.renderHeaders(obj) + '\n' + normalizeNewlines(obj.message)
  }

  render(): string {
    return this._commit
  }

  withoutSignature(): string {
    const commit = normalizeNewlines(this._commit)
    if (commit.indexOf('\ngpgsig') === -1) return commit
    const headers = commit.slice(0, commit.indexOf('\ngpgsig'))
    const message = commit.slice(
      commit.indexOf('-----END PGP SIGNATURE-----\n') + '-----END PGP SIGNATURE-----\n'.length
    )
    return normalizeNewlines(headers + '\n' + message)
  }

  isolateSignature(): string {
    const beginIndex = this._commit.indexOf('-----BEGIN PGP SIGNATURE-----')
    const endIndex = this._commit.indexOf('-----END PGP SIGNATURE-----')
    if (beginIndex === -1 || endIndex === -1) return ''
    const signature = this._commit.slice(beginIndex, endIndex + '-----END PGP SIGNATURE-----'.length)
    return outdent(signature)
  }

  static async sign(
    commit: GitCommit,
    sign: SignCallback,
    secretKey?: string
  ): Promise<GitCommit> {
    const payload = commit.withoutSignature()
    const message = GitCommit.justMessage(commit._commit)
    let { signature } = await sign({ payload, secretKey: secretKey ?? '' })
    // renormalize the line endings to the one true line-ending
    signature = normalizeNewlines(signature)
    const headers = GitCommit.justHeaders(commit._commit)
    const signedCommit = headers + '\n' + 'gpgsig' + indent(signature) + '\n' + message
    // return a new commit object
    return GitCommit.from(signedCommit)
  }
}

