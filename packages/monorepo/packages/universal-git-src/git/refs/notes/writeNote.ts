import { readRef, writeRef, deleteRef } from '../index.ts'
import { readObject } from '../../objects/readObject.ts'
import { writeObject } from '../../objects/writeObject.ts'
import { writeBlob } from '../../../commands/writeBlob.ts'
import { writeTree } from '../../../commands/writeTree.ts'
import { parse as parseBlob } from '../../../core-utils/parsers/Blob.ts'
import { getNotesRef } from './readNote.ts'
import type { FileSystemProvider } from "../../../models/FileSystem.ts"
import type { GitBackend } from '../../../backends/GitBackend.ts'
import type { TreeEntry } from "../../../models/GitTree.ts"
import { UniversalBuffer } from '../../../utils/UniversalBuffer.ts'

/**
 * Writes a note for a given object
 */
export const writeNote = async ({
  gitBackend,
  oid,
  note,
  namespace = 'commits',
  cache = {},
  force = false,
  // Legacy parameters for backward compatibility
  fs: _fs,
  gitdir: _gitdir,
}: {
  gitBackend?: GitBackend
  oid: string
  note: UniversalBuffer | string
  namespace?: string
  cache?: Record<string, unknown>
  force?: boolean
  // Legacy parameters for backward compatibility
  fs?: FileSystemProvider
  gitdir?: string
}): Promise<string> => {
  // Support both new signature (gitBackend) and legacy signature (fs/gitdir)
  let backend: GitBackend
  let fs: FileSystemProvider | undefined
  let gitdir: string | undefined
  
  if (gitBackend) {
    backend = gitBackend
    gitdir = backend.getGitdir()
    // Get fs from backend if available (for GitBackendFs)
    if ('getFs' in backend && typeof backend.getFs === 'function') {
      fs = backend.getFs()
    }
  } else if (_fs && _gitdir) {
    // Legacy: create a temporary backend
    const { GitBackendFs } = await import('../../../backends/GitBackendFs/index.ts')
    backend = new GitBackendFs(_fs, _gitdir)
    fs = _fs
    gitdir = _gitdir
  } else {
    throw new Error('Either gitBackend or (fs and gitdir) must be provided')
  }
  const notesRef = getNotesRef(namespace)
  
  // Check if this is the empty tree OID
  const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

  // Convert note to buffer
  const noteBuffer = UniversalBuffer.from(note, 'utf8')

  // Write the note blob using gitBackend.writeObject
  const noteOid = await backend.writeObject('blob', noteBuffer, 'content', undefined, false, cache)

  // Notes are stored in a fanout structure: first 2 hex chars / next 2 hex chars / rest
  const fanout1 = oid.slice(0, 2)
  const fanout2 = oid.slice(2, 4)
  const rest = oid.slice(4)

  // Get or create the notes tree
  let notesTreeOid: string
  try {
    const resolved = await backend.readRef(notesRef, 5, cache)
    if (!resolved) throw new Error('Notes ref not found')
    notesTreeOid = resolved
  } catch {
    // Notes ref doesn't exist, use empty tree OID
    notesTreeOid = EMPTY_TREE_OID
  }
  let treeEntries: any[] = []
  
  // Import parseTree outside the if block so it's available later
  const { parse: parseTree } = await import('../../../core-utils/parsers/Tree.ts')
  
  if (notesTreeOid !== EMPTY_TREE_OID) {
    // Read the notes tree
    const { object: treeObject } = await readObject({ gitBackend: backend, cache, oid: notesTreeOid, format: 'content' })
    // Handle empty buffer (empty tree)
    const treeBuffer = UniversalBuffer.from(treeObject)
    if (treeBuffer.length === 0) {
      treeEntries = []
    } else {
      // Validate buffer format before parsing - check if it looks like a tree (has space and null char)
      // If it doesn't have the expected format, it might be wrapped or corrupted
      const hasSpace = treeBuffer.indexOf(32) !== -1
      const hasNull = treeBuffer.indexOf(0) !== -1
      if (!hasSpace || !hasNull) {
        // Buffer doesn't look like a valid tree - treat as empty
        treeEntries = []
      } else {
        treeEntries = parseTree(treeBuffer)
      }
    }
  }

  // Find or create fanout1 entry
  let fanout1Entry = treeEntries.find(e => e.path === fanout1)
  let fanout2TreeOid: string

  if (!fanout1Entry) {
    // Create new fanout1 tree - use empty tree OID directly
    fanout2TreeOid = EMPTY_TREE_OID
    fanout1Entry = { path: fanout1, oid: fanout2TreeOid, mode: '040000', type: 'tree' }
    treeEntries.push(fanout1Entry)
  } else {
    fanout2TreeOid = fanout1Entry.oid
  }

  // Read the fanout2 tree
  // Check if fanout2TreeOid is the empty tree
  let fanout2Entries: any[] = []
  if (fanout2TreeOid !== EMPTY_TREE_OID) {
    const { object: fanout2TreeObject } = await readObject({ gitBackend: backend, cache, oid: fanout2TreeOid, format: 'content' })
    // Handle empty buffer (empty tree)
    const fanout2Buffer = UniversalBuffer.isBuffer(fanout2TreeObject) ? fanout2TreeObject : UniversalBuffer.from(fanout2TreeObject as Uint8Array)
    if (fanout2Buffer.length === 0) {
      fanout2Entries = []
    } else {
      // Validate buffer format before parsing
      const hasSpace = fanout2Buffer.indexOf(32) !== -1
      const hasNull = fanout2Buffer.indexOf(0) !== -1
      if (!hasSpace || !hasNull) {
        // Buffer doesn't look like a valid tree - treat as empty
        fanout2Entries = []
      } else {
        fanout2Entries = parseTree(fanout2Buffer)
      }
    }
  }

  // Add or update the note entry (stored with path = fanout2, not rest)
  const noteEntry = fanout2Entries.find(e => e.path === fanout2)
  if (noteEntry) {
    if (!force) {
      throw new Error(`Note already exists for ${oid}. Use force=true to overwrite.`)
    }
    noteEntry.oid = noteOid
  } else {
    fanout2Entries.push({ path: fanout2, oid: noteOid, mode: '100644', type: 'blob' })
  }

  // Write the fanout2 tree using gitBackend.writeObject
  const { GitTree } = await import('../../../models/GitTree.ts')
  const objectFormat = await backend.getObjectFormat(cache)
  const fanout2TreeBuffer = GitTree.from(fanout2Entries, objectFormat).toObject()
  fanout2TreeOid = await backend.writeObject('tree', fanout2TreeBuffer, 'content', undefined, false, cache)

  // Update fanout1 entry
  fanout1Entry.oid = fanout2TreeOid

  // Write the notes tree using gitBackend.writeObject
  const notesTreeBuffer = GitTree.from(treeEntries, objectFormat).toObject()
  notesTreeOid = await backend.writeObject('tree', notesTreeBuffer, 'content', undefined, false, cache)

  // Update the notes ref
  await backend.writeRef(notesRef, notesTreeOid, false, cache)

  return notesTreeOid
}

/**
 * Deletes a note for a given object
 */
export const removeNote = async ({
  gitBackend,
  oid,
  namespace = 'commits',
  cache = {},
  // Legacy parameters for backward compatibility
  fs: _fs,
  gitdir: _gitdir,
}: {
  gitBackend?: GitBackend
  oid: string
  namespace?: string
  cache?: Record<string, unknown>
  // Legacy parameters for backward compatibility
  fs?: FileSystemProvider
  gitdir?: string
}): Promise<string | null> => {
  // Support both new signature (gitBackend) and legacy signature (fs/gitdir)
  let backend: GitBackend
  let fs: FileSystemProvider | undefined
  let gitdir: string | undefined
  
  if (gitBackend) {
    backend = gitBackend
    gitdir = backend.getGitdir()
    // Get fs from backend if available (for GitBackendFs)
    if ('getFs' in backend && typeof backend.getFs === 'function') {
      fs = backend.getFs()
    }
  } else if (_fs && _gitdir) {
    // Legacy: create a temporary backend
    const { GitBackendFs } = await import('../../../backends/GitBackendFs/index.ts')
    backend = new GitBackendFs(_fs, _gitdir)
    fs = _fs
    gitdir = _gitdir
  } else {
    throw new Error('Either gitBackend or (fs and gitdir) must be provided')
  }
  const notesRef = getNotesRef(namespace)

  try {
    const notesTreeOid = await backend.readRef(notesRef, 5, cache)
    if (!notesTreeOid) return null

    // Check if this is the empty tree OID
    const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    if (notesTreeOid === EMPTY_TREE_OID) return null

    const fanout1 = oid.slice(0, 2)
    const fanout2 = oid.slice(2, 4)
    const rest = oid.slice(4)

    // Read the notes tree
    const { object: treeObject } = await readObject({ gitBackend: backend, cache, oid: notesTreeOid, format: 'content' })
    const { parse: parseTree } = await import('../../../core-utils/parsers/Tree.ts')
    // Handle empty buffer (empty tree)
    const treeBuffer = UniversalBuffer.from(treeObject)
    let treeEntries: any[]
    if (treeBuffer.length === 0) {
      treeEntries = []
    } else {
      // Validate buffer format before parsing
      const hasSpace = treeBuffer.indexOf(32) !== -1
      const hasNull = treeBuffer.indexOf(0) !== -1
      if (!hasSpace || !hasNull) {
        // Buffer doesn't look like a valid tree - treat as empty
        treeEntries = []
      } else {
        treeEntries = parseTree(treeBuffer)
      }
    }

    const fanout1Entry = treeEntries.find(e => e.path === fanout1)
    if (!fanout1Entry) return null

    // Read the fanout2 tree
    // Check if fanout2TreeOid is the empty tree
    let fanout2Entries: any[] = []
    if (fanout1Entry.oid !== EMPTY_TREE_OID) {
      const { object: fanout2TreeObject } = await readObject({ gitBackend: backend, cache, oid: fanout1Entry.oid, format: 'content' })
      // Handle empty buffer (empty tree)
      const fanout2Buffer = UniversalBuffer.isBuffer(fanout2TreeObject) ? fanout2TreeObject : UniversalBuffer.from(fanout2TreeObject as Uint8Array)
      if (fanout2Buffer.length === 0) {
        fanout2Entries = []
      } else {
        // Validate buffer format before parsing
        const hasSpace = fanout2Buffer.indexOf(32) !== -1
        const hasNull = fanout2Buffer.indexOf(0) !== -1
        if (!hasSpace || !hasNull) {
          // Buffer doesn't look like a valid tree - treat as empty
          fanout2Entries = []
        } else {
          fanout2Entries = parseTree(fanout2Buffer)
        }
      }
    }

    // Remove the note entry (stored with path = fanout2, not rest)
    const noteIndex = fanout2Entries.findIndex(e => e.path === fanout2)
    if (noteIndex === -1) return null

    fanout2Entries.splice(noteIndex, 1)

    // If fanout2 tree is empty, remove fanout1 entry too
    if (fanout2Entries.length === 0) {
      const fanout1Index = treeEntries.findIndex(e => e.path === fanout1)
      treeEntries.splice(fanout1Index, 1)

      // If notes tree is empty, set ref to empty tree OID instead of deleting
      if (treeEntries.length === 0) {
        await backend.writeRef(notesRef, EMPTY_TREE_OID, false, cache)
        return EMPTY_TREE_OID
      }
    } else {
      // Write the fanout2 tree using gitBackend.writeObject
      const { GitTree } = await import('../../../models/GitTree.ts')
      const objectFormat = await backend.getObjectFormat(cache)
      const fanout2TreeBuffer = GitTree.from(fanout2Entries, objectFormat).toObject()
      const fanout2TreeOid = await backend.writeObject('tree', fanout2TreeBuffer, 'content', undefined, false, cache)

      // Update fanout1 entry
      fanout1Entry.oid = fanout2TreeOid
    }

    // Write the notes tree using gitBackend.writeObject
    const { GitTree } = await import('../../../models/GitTree.ts')
    const objectFormat = await backend.getObjectFormat(cache)
    const notesTreeBuffer = GitTree.from(treeEntries, objectFormat).toObject()
    const newNotesTreeOid = await backend.writeObject('tree', notesTreeBuffer, 'content', undefined, false, cache)

    // Update the notes ref
    await backend.writeRef(notesRef, newNotesTreeOid, false, cache)

    return newNotesTreeOid
  } catch {
    // Note doesn't exist
    return null
  }
}

