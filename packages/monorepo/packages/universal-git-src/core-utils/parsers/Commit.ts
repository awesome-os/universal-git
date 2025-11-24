import { InternalError } from "../../errors/InternalError.ts"
import { formatAuthor } from "../../utils/formatAuthor.ts"
import { indent } from "../../utils/indent.ts"
import { normalizeNewlines } from "../../utils/normalizeNewlines.ts"
import { parseAuthor } from "../../utils/parseAuthor.ts"
import type { CommitObject, Author } from "../../models/GitCommit.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

/**
 * Parses a commit buffer into a CommitObject
 */
export const parse = (buffer: UniversalBuffer | Uint8Array | string): CommitObject => {
  const commit =
    typeof buffer === 'string'
      ? buffer
      : UniversalBuffer.from(buffer).toString('utf8')

  const message = justMessage(commit)
  const headers = parseHeaders(commit)

  // Ensure required fields are present (tree, author, committer are required by CommitObject)
  if (!headers.tree) {
    throw new InternalError('Commit object missing required "tree" field')
  }
  if (!headers.author) {
    throw new InternalError('Commit object missing required "author" field')
  }
  if (!headers.committer) {
    throw new InternalError('Commit object missing required "committer" field')
  }

  return {
    message,
    tree: headers.tree,
    parent: headers.parent,
    author: headers.author,
    committer: headers.committer,
    gpgsig: headers.gpgsig,
  }
}

/**
 * Serializes a CommitObject into a commit buffer
 */
export const serialize = (commit: CommitObject): UniversalBuffer => {
  const headers = renderHeaders(commit)
  const message = normalizeNewlines(commit.message)
  return UniversalBuffer.from(headers + '\n' + message, 'utf8')
}

/**
 * Extracts just the message from a commit string
 */
export const justMessage = (commit: string): string => {
  return normalizeNewlines(commit.slice(commit.indexOf('\n\n') + 2))
}

/**
 * Extracts just the headers from a commit string
 */
export const justHeaders = (commit: string): string => {
  return commit.slice(0, commit.indexOf('\n\n'))
}

type ParsedHeaders = {
  parent: string[]
  tree?: string
  author?: Author
  committer?: Author
  gpgsig?: string
}

/**
 * Parses commit headers into an object
 */
const parseHeaders = (commit: string): ParsedHeaders => {
  const headers = justHeaders(commit).split('\n')
  const hs: string[] = []
  for (const h of headers) {
    if (h[0] === ' ') {
      // combine with previous header (without space indent)
      hs[hs.length - 1] += '\n' + h.slice(1)
    } else {
      hs.push(h)
    }
  }
  const obj: Record<string, string | string[]> = {
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
  const result: ParsedHeaders = {
    parent: (obj.parent as string[]) ?? [],
  }
  if (obj.tree) {
    result.tree = obj.tree as string
  }
  if (obj.author) {
    result.author = parseAuthor(obj.author as string)
  }
  if (obj.committer) {
    result.committer = parseAuthor(obj.committer as string)
  }
  if (obj.gpgsig) {
    result.gpgsig = obj.gpgsig as string
  }
  return result
}

/**
 * Renders commit headers from an object
 */
const renderHeaders = (obj: CommitObject): string => {
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

