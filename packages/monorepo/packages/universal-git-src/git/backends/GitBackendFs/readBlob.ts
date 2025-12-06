import { normalize } from "../../../core-utils/GitPath.ts"
import { UniversalBuffer } from "./utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Read blob operation for GitBackendFs
 */

export async function readBlob(this: GitBackendFs, oid: string, filepath?: string): Promise<{ oid: string; blob: Uint8Array }> {
  if (!oid || typeof oid !== 'string') {
    throw new Error(`Invalid OID: ${oid}`)
  }
  
  // Use a shared cache for objectFormat detection across all readObject calls
  const cache: Record<string, unknown> = {}
  
  // Peel tags/commits to get to the blob
  let currentOid = oid
  let currentObj = await this.readObject(currentOid, 'content', cache)
  
  // Peel tags
  while (currentObj.type === 'tag') {
    const tagBuffer = UniversalBuffer.from(currentObj.object)
    const tagText = tagBuffer.toString('utf8')
    const objectMatch = tagText.match(/^object ([a-f0-9]{40,64})/m)
    if (!objectMatch) {
      throw new Error('Tag object missing object reference')
    }
    currentOid = objectMatch[1]
    currentObj = await this.readObject(currentOid, 'content', cache)
  }
  
  // If filepath is provided, resolve it within the tree/commit
  if (filepath !== undefined) {
    // Use resolveFilepath to handle path validation and resolution
    // This ensures we throw the correct error types (InvalidFilepathError, ObjectTypeError)
    const { resolveFilepath } = await import('./utils/resolveFilepath.ts')
    const gitdir = this.getGitdir()
    const fs = this.getFs()
    
    // If it's a commit, get the tree OID first
    if (currentObj.type === 'commit') {
      const commitBuffer = UniversalBuffer.from(currentObj.object)
      const commitText = commitBuffer.toString('utf8')
      const treeMatch = commitText.match(/^tree ([a-f0-9]{40,64})/m)
      if (!treeMatch) {
        throw new Error('Commit object missing tree reference')
      }
      currentOid = treeMatch[1]
      currentObj = await this.readObject(currentOid, 'content', cache)
    }
    
    // Use resolveFilepath to resolve the path (handles validation and error types)
    try {
      currentOid = await resolveFilepath({
        fs,
        cache,
        gitdir,
        gitBackend: this,
        oid: currentOid,
        filepath,
      })
      // Read the resolved object
      currentObj = await this.readObject(currentOid, 'content', cache)
      
      // If the resolved object is not a blob, throw ObjectTypeError
      if (currentObj.type !== 'blob') {
        const { ObjectTypeError } = await import('../../errors/ObjectTypeError.ts')
        throw new ObjectTypeError(currentOid, currentObj.type as 'blob' | 'commit' | 'tree' | 'tag', 'blob', filepath)
      }
    } catch (err) {
      // Re-throw errors from resolveFilepath (they're already the correct types)
      // Also re-throw ObjectTypeError if we just threw it
      throw err
    }
  }
  
  // Peel commits to get to the tree/blob
  while (currentObj.type === 'commit') {
    const commitBuffer = UniversalBuffer.from(currentObj.object)
    const commitText = commitBuffer.toString('utf8')
    const treeMatch = commitText.match(/^tree ([a-f0-9]{40,64})/m)
    if (!treeMatch || !treeMatch[1]) {
      throw new Error('Commit object missing tree reference')
    }
    currentOid = treeMatch[1]
    if (!currentOid) {
      throw new Error('Tree OID is undefined')
    }
    currentObj = await this.readObject(currentOid, 'content', cache)
  }
  
  // Now we should have a blob
  if (currentObj.type !== 'blob') {
    throw new Error(`Expected blob object, got ${currentObj.type}`)
  }
  
  if (!currentOid) {
    throw new Error('OID is undefined after resolving blob')
  }

  const blob = UniversalBuffer.from(currentObj.object)
  return { 
    oid: currentOid, 
    blob: blob instanceof Uint8Array ? blob : new Uint8Array(blob) 
  }
}

