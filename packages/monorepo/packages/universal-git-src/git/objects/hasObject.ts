import { read as readLoose } from './loose.ts'
import { read as readPacked } from './pack.ts'
import { readObject } from './readObject.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Check if an object exists in the object database (loose or packed)
 * 
 * @param fs - File system client
 * @param cache - Cache object for packfile indices
 * @param gitdir - Path to .git directory
 * @param oid - Object ID (SHA-1)
 * @param format - Format to check (not used, kept for compatibility)
 * @returns Promise resolving to true if object exists, false otherwise
 */
export async function hasObject({
  fs,
  cache,
  gitdir,
  oid,
  format = 'content',
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  oid: string
  format?: string
}): Promise<boolean> {
  // Curry the current read method so that the packfile un-deltification
  // process can acquire external ref-deltas.
  const getExternalRefDelta = async (oid: string) => {
    const result = await readObject({ fs, cache, gitdir, oid })
    return {
      type: result.type || '',
      object: result.object,
      format: result.format || 'content',
      source: result.source || 'loose',
    }
  }

  // Look for it in the loose object directory.
  let result = await readLoose({ fs, gitdir, oid, format: 'deflated' })
  if (result) {
    return true
  }

  // Check to see if it's in a packfile.
  result = await readPacked({
    fs,
    cache,
    gitdir,
    oid,
    format: 'content',
    getExternalRefDelta,
  })

  return result !== null
}

