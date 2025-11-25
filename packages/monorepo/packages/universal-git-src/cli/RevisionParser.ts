import { resolveRef } from "../git/refs/readRef.ts"
import { readLog, type ReflogEntry as GitReflogEntry } from "../git/logs/readLog.ts"
import { readObject } from "../git/objects/readObject.ts"
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { NotFoundError } from '../errors/NotFoundError.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"

type ReflogEntry = {
  oldOid: string
  newOid: string
  author: string
  timestamp: number
  timezoneOffset: string
  message: string
}

/**
 * Parses Git revision syntax and resolves to OIDs
 * Supports: HEAD, HEAD~3, HEAD^, master@{2}, etc.
 */
export class RevisionParser {
  private readonly fs: FileSystemProvider
  private readonly gitdir: string
  private readonly cache: Record<string, unknown>
  private _revisionParser: RevisionParser | null = null

  constructor(
    fs: FileSystemProvider,
    gitdir: string,
    cache: Record<string, unknown> = {}
  ) {
    this.fs = fs
    this.gitdir = gitdir
    this.cache = cache
  }

  /**
   * Resolves a revision to an OID
   */
  async resolve(revision: string): Promise<string> {
    // Handle reflog syntax: ref@{n} or ref@{time}
    const reflogMatch = revision.match(/^(.+?)\@\{([^}]+)\}$/)
    if (reflogMatch) {
      const [, ref, selector] = reflogMatch
      return this._resolveReflog(ref, selector)
    }

    // Handle relative syntax: ref~n or ref^n
    const relativeMatch = revision.match(/^(.+?)([~^]+)(\d*)$/)
    if (relativeMatch) {
      const [, ref, operators, count] = relativeMatch
      const num = count ? parseInt(count, 10) : 1
      return this._resolveRelative(ref, operators, num)
    }

    // Simple ref resolution
    return resolveRef({ fs: this.fs, gitdir: this.gitdir, ref: revision })
  }

  /**
   * Resolves reflog syntax: ref@{n} or ref@{time}
   * @private
   */
  private async _resolveReflog(ref: string, selector: string): Promise<string> {
    // First resolve the base ref
    const baseOid = await resolveRef({ fs: this.fs, gitdir: this.gitdir, ref })

    // Get reflog entries
    const entries = (await readLog({ fs: this.fs, gitdir: this.gitdir, ref, parsed: true })) as ReflogEntry[]

    if (entries.length === 0) {
      // No reflog, return base ref
      return baseOid
    }

    // Check if selector is a number (index) or time
    const numMatch = /^\d+$/.test(selector)
    if (numMatch) {
      const index = parseInt(selector, 10)
      if (index >= entries.length) {
        throw new NotFoundError(`Reflog entry ${index} not found for ${ref}`)
      }
      // Reflog entries are in reverse chronological order (newest first)
      return entries[index].oldOid
    }

    // Time-based selector (e.g., '1.day.ago', 'yesterday')
    // For now, we'll support simple formats
    // TODO: Implement full time parsing
    throw new Error(`Time-based reflog selectors not yet implemented: ${selector}`)
  }

  /**
   * Resolves relative syntax: ref~n or ref^n
   * @private
   */
  private async _resolveRelative(ref: string, operators: string, count: number): Promise<string> {
    let oid = await resolveRef({ fs: this.fs, gitdir: this.gitdir, ref })

    // Process each operator
    for (let i = 0; i < count; i++) {
      for (const op of operators) {
        if (op === '~') {
          // First parent
          oid = await this._getFirstParent(oid)
        } else if (op === '^') {
          // First parent (same as ~)
          oid = await this._getFirstParent(oid)
        } else {
          throw new Error(`Unknown relative operator: ${op}`)
        }
      }
    }

    return oid
  }

  /**
   * Gets the first parent of a commit
   * @private
   */
  private async _getFirstParent(oid: string): Promise<string> {
    try {
      const { object: commitObject } = await readObject({
        fs: this.fs,
        cache: this.cache,
        gitdir: this.gitdir,
        oid,
      })
      const commit = parseCommit(commitObject as Buffer)
      if (commit.parent && commit.parent.length > 0) {
        return commit.parent[0]
      }
      throw new NotFoundError(`Commit ${oid} has no parent`)
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw err
      }
      throw new NotFoundError(`Cannot resolve parent of ${oid}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Resolves multiple revisions
   */
  async resolveMany(revisions: string[]): Promise<string[]> {
    return Promise.all(revisions.map(rev => this.resolve(rev)))
  }
}
