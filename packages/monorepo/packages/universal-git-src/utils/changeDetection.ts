/**
 * Centralized change detection logic for Git walk operations
 * 
 * This module provides a unified API for detecting changes between different
 * Git states (HEAD, STAGE, WORKDIR) and tree objects. It handles:
 * - Two-way comparisons (e.g., HEAD vs STAGE)
 * - Three-way comparisons (e.g., ours vs base vs theirs for merges)
 * - Proper error handling for missing blobs
 * - Clear change type classification
 */

import type { WalkerEntry } from '../models/Walker.ts'

/**
 * Represents the type of change detected between two states
 */
export type ChangeType = 'added' | 'modified' | 'deleted' | 'unchanged'

/**
 * Result of comparing two walker entries
 */
export interface ChangeResult {
  type: ChangeType
  base: WalkerEntry | null
  target: WalkerEntry | null
  baseOid: string | undefined
  targetOid: string | undefined
}

/**
 * Compares two walker entries and determines the type of change
 * 
 * @param base - The base entry (e.g., HEAD)
 * @param target - The target entry (e.g., STAGE or WORKDIR)
 * @returns ChangeResult indicating the type of change
 */
export async function detectChange(
  base: WalkerEntry | null,
  target: WalkerEntry | null
): Promise<ChangeResult> {
  let baseOid: string | undefined = undefined
  let targetOid: string | undefined = undefined
  
  // Get OIDs with error handling
  try {
    baseOid = base ? await base.oid() : undefined
  } catch (error) {
    // If base.oid() fails (e.g., missing blob), treat as if base doesn't exist
    baseOid = undefined
  }
  
  try {
    targetOid = target ? await target.oid() : undefined
  } catch (error) {
    // If target.oid() fails (e.g., missing blob), skip this entry
    // Return unchanged to indicate we can't process this entry
    return {
      type: 'unchanged',
      base,
      target,
      baseOid: undefined,
      targetOid: undefined,
    }
  }
  
  // Determine change type
  if (!base && target) {
    // File added
    return {
      type: 'added',
      base: null,
      target,
      baseOid: undefined,
      targetOid,
    }
  } else if (base && !target) {
    // File deleted
    return {
      type: 'deleted',
      base,
      target: null,
      baseOid,
      targetOid: undefined,
    }
  } else if (!base && !target) {
    // Neither exists - unchanged
    return {
      type: 'unchanged',
      base: null,
      target: null,
      baseOid: undefined,
      targetOid: undefined,
    }
  } else if (base && target) {
    // Both exist - check if modified
    if (baseOid !== targetOid) {
      return {
        type: 'modified',
        base,
        target,
        baseOid,
        targetOid,
      }
    } else {
      return {
        type: 'unchanged',
        base,
        target,
        baseOid,
        targetOid,
      }
    }
  }
  
  // Fallback
  return {
    type: 'unchanged',
    base,
    target,
    baseOid,
    targetOid,
  }
}

/**
 * Compares three walker entries for merge operations
 * 
 * @param ours - Our version
 * @param base - Base version
 * @param theirs - Their version
 * @returns Object indicating what changed in ours and theirs relative to base
 */
export async function detectThreeWayChange(
  ours: WalkerEntry | null,
  base: WalkerEntry | null,
  theirs: WalkerEntry | null
): Promise<{
  ourChange: boolean
  theirChange: boolean
  ourOid: string | undefined
  baseOid: string | undefined
  theirOid: string | undefined
}> {
  let ourOid: string | undefined = undefined
  let baseOid: string | undefined = undefined
  let theirOid: string | undefined = undefined
  
  // Get OIDs with error handling
  try {
    ourOid = ours ? await ours.oid() : undefined
  } catch {
    ourOid = undefined
  }
  
  try {
    baseOid = base ? await base.oid() : undefined
  } catch {
    baseOid = undefined
  }
  
  try {
    theirOid = theirs ? await theirs.oid() : undefined
  } catch {
    theirOid = undefined
  }
  
  // Determine if ours changed relative to base
  const ourChange = ourOid !== baseOid || (ours === null) !== (base === null)
  
  // Determine if theirs changed relative to base
  const theirChange = theirOid !== baseOid || (theirs === null) !== (base === null)
  
  return {
    ourChange,
    theirChange,
    ourOid,
    baseOid,
    theirOid,
  }
}

/**
 * Checks if an entry has been modified relative to a base entry
 * Simplified version for compatibility with existing code
 * 
 * @param entry - The entry to check
 * @param base - The base entry to compare against
 * @returns true if modified, false otherwise
 */
export async function modified(entry: WalkerEntry | null, base: WalkerEntry | null): Promise<boolean> {
  if (!entry && !base) return false
  if (entry && !base) return true
  if (!entry && base) return true
  
  try {
    const entryType = await entry!.type()
    const baseType = await base!.type()
    
    if (entryType === 'tree' && baseType === 'tree') {
      return false
    }
    
    const entryOid = await entry!.oid()
    const baseOid = await base!.oid()
    const entryMode = await entry!.mode()
    const baseMode = await base!.mode()
    
    if (entryType === baseType && entryMode === baseMode && entryOid === baseOid) {
      return false
    }
    
    return true
  } catch {
    // If we can't compare (e.g., missing blob), treat as modified to be safe
    return true
  }
}

