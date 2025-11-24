import { InternalError } from '../errors/InternalError.ts'
import { UnsafeFilepathError } from '../errors/UnsafeFilepathError.ts'
import { comparePath } from "../utils/comparePath.ts"
import { compareTreeEntryPath } from "../utils/compareTreeEntryPath.ts"
import { getOidLength, type ObjectFormat } from '../utils/detectObjectFormat.ts'
import type { ObjectType } from './GitObject.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'

// ============================================================================
// GIT TREE TYPES
// ============================================================================

/**
 * Git tree entry (file or directory in a tree)
 */
export type TreeEntry = {
  mode: string // 6 digit hexadecimal mode
  path: string // Name of the file or directory
  oid: string // SHA-1 object id of the blob or tree
  type: ObjectType
}

/**
 * Git tree object (array of tree entries)
 */
export type TreeObject = TreeEntry[]

/**
 * Result of reading a tree object
 */
export type ReadTreeResult = {
  oid: string // SHA-1 object id of this tree
  tree: TreeObject
}

function mode2type(mode: string): 'tree' | 'blob' | 'commit' {
  // prettier-ignore
  switch (mode) {
    case '040000': return 'tree'
    case '100644': return 'blob'
    case '100755': return 'blob'
    case '120000': return 'blob'
    case '160000': return 'commit'
  }
  throw new InternalError(`Unexpected GitTree entry mode: ${mode}`)
}

function parseBuffer(buffer: UniversalBuffer, objectFormat: ObjectFormat = 'sha1'): TreeEntry[] {
  const _entries: TreeEntry[] = []
  let cursor = 0
  while (cursor < buffer.length) {
    const space = buffer.indexOf(32, cursor)
    if (space === -1) {
      throw new InternalError(
        `GitTree: Error parsing buffer at byte location ${cursor}: Could not find the next space character.`
      )
    }
    const nullchar = buffer.indexOf(0, cursor)
    if (nullchar === -1) {
      throw new InternalError(
        `GitTree: Error parsing buffer at byte location ${cursor}: Could not find the next null character.`
      )
    }
    let mode = buffer.slice(cursor, space).toString('utf8')
    if (mode === '40000') mode = '040000' // makes it line up neater in printed output
    const type = mode2type(mode)
    const path = buffer.slice(space + 1, nullchar).toString('utf8')

    // Prevent malicious git repos from writing to "..\foo" on clone etc
    if (path.includes('\\') || path.includes('/')) {
      throw new UnsafeFilepathError(path)
    }

    // OID length: 20 bytes for SHA-1, 32 bytes for SHA-256
    const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
    const oid = buffer.slice(nullchar + 1, nullchar + 1 + oidByteLength).toString('hex')
    cursor = nullchar + 1 + oidByteLength
    _entries.push({ mode, path, oid, type })
  }
  return _entries
}

function limitModeToAllowed(mode: string | number): string {
  if (typeof mode === 'number') {
    mode = mode.toString(8)
  }
  const modeStr = String(mode)
  // tree
  if (modeStr.match(/^0?4.*/)) return '040000' // Directory
  if (modeStr.match(/^1006.*/)) return '100644' // Regular non-executable file
  if (modeStr.match(/^1007.*/)) return '100755' // Regular executable file
  if (modeStr.match(/^120.*/)) return '120000' // Symbolic link
  if (modeStr.match(/^160.*/)) return '160000' // Commit (git submodule reference)
  throw new InternalError(`Could not understand file mode: ${mode}`)
}

function nudgeIntoShape(
  entry: Partial<TreeEntry> & { sha?: string; mode?: string | number }
): TreeEntry {
  if (!entry.oid && entry.sha) {
    entry.oid = entry.sha // Github
  }
  if (!entry.mode) {
    throw new InternalError('Entry missing mode')
  }
  entry.mode = limitModeToAllowed(entry.mode) // index
  if (!entry.type) {
    entry.type = mode2type(entry.mode)
  }
  // Check for missing or empty path/oid - allow empty strings only if they're already complete TreeEntry objects
  // (which shouldn't happen, but handle gracefully)
  if (entry.path === undefined || entry.oid === undefined) {
    throw new InternalError('Entry missing path or oid')
  }
  // If path or oid are empty strings, that's also invalid
  if (!entry.path || !entry.oid) {
    throw new InternalError('Entry missing path or oid')
  }
  return {
    mode: entry.mode,
    path: entry.path,
    oid: entry.oid,
    type: entry.type,
  }
}

export class GitTree {
  private _entries: TreeEntry[]

  constructor(
    entries: UniversalBuffer | TreeEntry[] | Array<Partial<TreeEntry> & { sha?: string }>,
    objectFormat: ObjectFormat = 'sha1'
  ) {
    if (UniversalBuffer.isBuffer(entries)) {
      this._entries = parseBuffer(entries, objectFormat)
    } else if (Array.isArray(entries)) {
      // Check if entries are already complete TreeEntry objects (have all required fields)
      // If so, use them directly; otherwise, nudge them into shape
      this._entries = entries.map(entry => {
        // If entry already has all required fields and they're non-empty, use it as-is
        if (entry.mode && entry.path && entry.oid && entry.type) {
          // Validate it's a complete entry
          if (typeof entry.mode === 'string' && entry.path && entry.oid) {
            return {
              mode: limitModeToAllowed(entry.mode),
              path: entry.path,
              oid: entry.oid,
              type: entry.type,
            }
          }
        }
        // Otherwise, nudge into shape (for partial entries)
        return nudgeIntoShape(entry)
      })
    } else {
      throw new InternalError('invalid type passed to GitTree constructor')
    }
    // Tree entries must be sorted using compareTreeEntryPath to match git's sorting
    // (Git sorts tree entries as if there is a trailing slash on directory names)
    // This ensures consistent serialization/deserialization
    this._entries.sort(compareTreeEntryPath)
  }

  static from(
    tree: UniversalBuffer | TreeEntry[] | Array<Partial<TreeEntry> & { sha?: string }>,
    objectFormat: ObjectFormat = 'sha1'
  ): GitTree {
    return new GitTree(tree, objectFormat)
  }

  render(): string {
    return this._entries
      .map(entry => `${entry.mode} ${entry.type} ${entry.oid}    ${entry.path}`)
      .join('\n')
  }

  toObject(): UniversalBuffer {
    // Adjust the sort order to match git's
    const entries = [...this._entries]
    entries.sort(compareTreeEntryPath)
    return UniversalBuffer.concat(
      entries.map(entry => {
        const mode = UniversalBuffer.from(entry.mode.replace(/^0/, ''))
        const space = UniversalBuffer.from(' ')
        const path = UniversalBuffer.from(entry.path, 'utf8')
        const nullchar = UniversalBuffer.from([0])
        const oid = UniversalBuffer.from(entry.oid, 'hex')
        return UniversalBuffer.concat([mode, space, path, nullchar, oid])
      })
    )
  }

  /**
   * @returns {TreeEntry[]}
   */
  entries(): TreeEntry[] {
    return this._entries
  }

  *[Symbol.iterator](): Generator<TreeEntry, void, unknown> {
    for (const entry of this._entries) {
      yield entry
    }
  }
}

