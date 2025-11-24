import { readRef } from '../readRef.ts'
import { readObject } from '../../objects/readObject.ts'
import { parse as parseBlob } from '../../../core-utils/parsers/Blob.ts'
import type { FileSystemProvider } from "../../../models/FileSystem.ts"
import { UniversalBuffer } from '../../../utils/UniversalBuffer.ts'

/**
 * Gets the notes ref for a given namespace
 */
export const getNotesRef = (namespace = 'commits'): string => {
  return `refs/notes/${namespace}`
}

/**
 * Reads a note for a given object
 */
export const readNote = async ({
  fs,
  gitdir,
  oid,
  namespace = 'commits',
  cache = {},
}: {
  fs: FileSystemProvider
  gitdir: string
  oid: string
  namespace?: string
  cache?: Record<string, unknown>
}): Promise<UniversalBuffer | null> => {
  const notesRef = getNotesRef(namespace)

  try {
    // Get the notes tree OID
    const notesTreeOid = await readRef({ fs, gitdir, ref: notesRef })

    if (!notesTreeOid) return null

    // Check if this is the empty tree OID
    const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    if (notesTreeOid === EMPTY_TREE_OID) return null

    // Notes are stored in a fanout structure: first 2 hex chars / next 2 hex chars / rest
    const fanout1 = oid.slice(0, 2)
    const fanout2 = oid.slice(2, 4)
    const rest = oid.slice(4)

    // Read the notes tree
    const { object: treeObject } = await readObject({ fs, cache, gitdir, oid: notesTreeOid, format: 'content' })
    const { parse: parseTree } = await import('../../../core-utils/parsers/Tree.ts')
    // Handle empty buffer (empty tree)
    const treeBuffer = UniversalBuffer.from(treeObject)
    const treeEntries = treeBuffer.length === 0 ? [] : parseTree(treeBuffer)

    // Find the fanout1 entry
    const fanout1Entry = treeEntries.find(e => e.path === fanout1)
    if (!fanout1Entry) return null

    // Read the fanout2 tree
    const { object: fanout2TreeObject } = await readObject({ fs, cache, gitdir, oid: fanout1Entry.oid, format: 'content' })
    // Handle empty buffer (empty tree)
    const fanout2Buffer = UniversalBuffer.isBuffer(fanout2TreeObject) ? fanout2TreeObject : UniversalBuffer.from(fanout2TreeObject as Uint8Array)
    const fanout2Entries = fanout2Buffer.length === 0 ? [] : parseTree(fanout2Buffer)

    // Find the note entry (stored with path = fanout2, not rest)
    const noteEntry = fanout2Entries.find(e => e.path === fanout2)
    if (!noteEntry) return null

    // Read the note blob
    const { object: noteObject } = await readObject({ fs, cache, gitdir, oid: noteEntry.oid })
    return parseBlob(noteObject as UniversalBuffer)
  } catch {
    // Note doesn't exist
    return null
  }
}

