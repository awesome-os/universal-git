import { normalize } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
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
    // If it's a commit, get the tree OID
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
    
    // Walk the tree to find the file
    if (currentObj.type !== 'tree') {
      throw new Error(`Cannot resolve filepath in ${currentObj.type} object`)
    }
    
    const pathParts = normalize(filepath).split('/').filter(p => p)
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      const isLast = i === pathParts.length - 1
      
      const { GitTree } = await import('../../models/GitTree.ts')
      const tree = GitTree.from(UniversalBuffer.from(currentObj.object))
      const entry = tree.entries().find(e => e.path === part)
      if (!entry || !entry.oid) {
        throw new Error(`File not found: ${filepath}`)
      }
      
      currentOid = entry.oid
      if (!currentOid) {
        throw new Error(`Entry ${part} has no OID`)
      }
      
      if (isLast) {
        // We'll read the blob object below
      } else {
        currentObj = await this.readObject(currentOid, 'content', cache)
        if (currentObj.type !== 'tree') {
          throw new Error(`Expected tree object at ${part}, got ${currentObj.type}`)
        }
      }
    }
  }
  
  // If we resolved a filepath, we need to read the final blob object
  if (filepath !== undefined && currentObj.type !== 'blob') {
    if (!currentOid) {
      throw new Error('OID is undefined after resolving filepath')
    }
    currentObj = await this.readObject(currentOid, 'content', cache)
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

