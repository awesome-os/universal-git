/**
 * @deprecated This module is deprecated. Use git/refs/ instead.
 * 
 * All functionality has been moved to git/refs/.
 * This file maintains backward compatibility by re-exporting from git/refs/.
 */

// Re-export RefManager (deprecated, but still functional)
export * from './RefManager.ts'

// Re-export RefParser functions from git/refs
export {
  parsePackedRefs,
  parseLooseRef,
  serializePackedRefs,
  serializeLooseRef,
  readPackedRefs,
  type LooseRef,
} from '../../git/refs/packedRefs.ts'

// Re-export ShallowManager (this might stay in core-utils as it's not strictly a ref operation)
export * from './ShallowManager.ts'
