import { InternalError } from "../../errors/InternalError.ts"
import { UnsafeFilepathError } from "../../errors/UnsafeFilepathError.ts"
import { comparePath } from "../../utils/comparePath.ts"
import { compareTreeEntryPath } from "../../utils/compareTreeEntryPath.ts"
import { getOidLength, type ObjectFormat } from "../../utils/detectObjectFormat.ts"
import type { TreeEntry } from "../../models/GitTree.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

const mode2type = (mode: string): 'tree' | 'blob' | 'commit' => {
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

const limitModeToAllowed = (mode: string | number): string => {
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

const nudgeIntoShape = (entry: Partial<TreeEntry> & { sha?: string }): TreeEntry => {
  // Handle case where mode might be a type string instead of a mode
  let mode: string
  if (entry.mode === 'tree' || entry.mode === 'blob' || entry.mode === 'commit') {
    // entry.mode is actually a type, derive mode from type
    mode = entry.mode === 'tree' ? '040000' : entry.mode === 'commit' ? '160000' : '100644'
  } else {
    mode = limitModeToAllowed(entry.mode ?? '100644')
  }
  
  const normalized: TreeEntry = {
    oid: entry.oid ?? entry.sha ?? '',
    mode,
    path: entry.path ?? '',
    type: entry.type ?? mode2type(mode),
  }
  return normalized
}

/**
 * Parses a tree buffer into an array of tree entries
 * 
 * @param buffer - Tree buffer to parse
 * @param objectFormat - Object format ('sha1' or 'sha256'), defaults to 'sha1'
 */
export const parse = (buffer: UniversalBuffer | Uint8Array, objectFormat: ObjectFormat = 'sha1'): TreeEntry[] => {
  const _entries: TreeEntry[] = []
  let cursor = 0
  const buf = UniversalBuffer.from(buffer)
  // Handle empty tree (empty buffer)
  if (buf.length === 0) {
    return _entries
  }
  while (cursor < buf.length) {
    const space = buf.indexOf(32, cursor)
    if (space === -1) {
      throw new InternalError(
        `GitTree: Error parsing buffer at byte location ${cursor}: Could not find the next space character.`
      )
    }
    // Find null character - match original parseBuffer: search from cursor
    // In valid git tree format: mode path\0oid, so nullchar should be after space
    let nullchar = buf.indexOf(0, cursor)
    if (nullchar === -1) {
      throw new InternalError(
        `GitTree: Error parsing buffer at byte location ${cursor}: Could not find the next null character.`
      )
    }
    // Validate nullchar comes after space (path separator)
    if (nullchar < space) {
      // This shouldn't happen in valid git trees, but handle it
      nullchar = buf.indexOf(0, space + 1)
      if (nullchar === -1) {
        throw new InternalError(
          `GitTree: Error parsing buffer at byte location ${cursor}: Could not find null character after space.`
        )
      }
    }
    let mode = buf.slice(cursor, space).toString('utf8')
    if (mode === '40000') mode = '040000' // makes it line up neater in printed output
    // Handle invalid mode strings that might be type strings (shouldn't happen in valid git trees)
    if (mode === 'tree' || mode === 'blob' || mode === 'commit') {
      mode = mode === 'tree' ? '040000' : mode === 'commit' ? '160000' : '100644'
    }
    const type = mode2type(mode)
    const path = buf.slice(space + 1, nullchar).toString('utf8')

    // Prevent malicious git repos from writing to "..\foo" on clone etc
    if (path.includes('\\') || path.includes('/')) {
      throw new UnsafeFilepathError(path)
    }

    // Extract oid - it's exactly oidByteLength bytes after the null character
    // SHA-1: 20 bytes (40 hex chars), SHA-256: 32 bytes (64 hex chars)
    const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
    const expectedOidLength = getOidLength(objectFormat) // Hex string length
    if (nullchar + 1 + oidByteLength > buf.length) {
      // If we're at the end of the buffer, this might be a malformed entry
      // Check if this is the end of the buffer (empty tree or truncated)
      if (nullchar === buf.length - 1 && cursor === 0) {
        // This looks like an empty or malformed tree - return empty entries
        return _entries
      }
      throw new InternalError(
        `GitTree: Error parsing buffer at byte location ${cursor}: Not enough bytes for oid (need ${oidByteLength + 1} bytes after null at position ${nullchar}, have ${buf.length - nullchar - 1}, buffer length=${buf.length})`
      )
    }
    const oid = buf.slice(nullchar + 1, nullchar + 1 + oidByteLength).toString('hex')
    cursor = nullchar + 1 + oidByteLength
    // Validate that we have valid path and oid before adding
    if (!path || !oid || oid.length !== expectedOidLength) {
      throw new InternalError(`Invalid tree entry: path="${path}", oid="${oid}" (length=${oid?.length || 0}, expected ${expectedOidLength})`)
    }
    _entries.push({ mode, path, oid, type })
  }
  // Tree entries must be sorted using compareTreeEntryPath to match git's sorting
  // (Git sorts tree entries as if there is a trailing slash on directory names)
  // This ensures consistent serialization/deserialization
  _entries.sort(compareTreeEntryPath)
  return _entries
}

/**
 * Serializes an array of tree entries into a tree buffer
 * 
 * @param entries - Tree entries to serialize
 * @param objectFormat - Object format ('sha1' or 'sha256'), defaults to 'sha1'
 */
export const serialize = (entries: TreeEntry[], objectFormat: ObjectFormat = 'sha1'): UniversalBuffer => {
  // Normalize entries
  const normalizedEntries = entries.map(nudgeIntoShape)

  // Adjust the sort order to match git's
  const sortedEntries = [...normalizedEntries]
  sortedEntries.sort(compareTreeEntryPath)

  return UniversalBuffer.concat(
    sortedEntries.map(entry => {
      const mode = UniversalBuffer.from(entry.mode.replace(/^0/, ''))
      const space = UniversalBuffer.from(' ')
      const path = UniversalBuffer.from(entry.path, 'utf8')
      const nullchar = UniversalBuffer.from([0])
      const oid = UniversalBuffer.from(entry.oid, 'hex')
      return UniversalBuffer.concat([mode, space, path, nullchar, oid])
    })
  )
}

