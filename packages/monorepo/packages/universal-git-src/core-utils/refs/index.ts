/**
 * @deprecated This module is deprecated. Use git/refs/ instead.
 * 
 * All functionality has been moved to git/refs/.
 * This file maintains backward compatibility by re-exporting from git/refs/.
 */

// RefManager export removed - use capability modules from git/refs/ directly

// Re-export RefParser functions from git/refs
export {
  parsePackedRefs,
  parseLooseRef,
  serializePackedRefs,
  serializeLooseRef,
  readPackedRefs,
  type LooseRef,
} from '../../git/refs/packedRefs.ts'

// ShallowManager removed - use readShallow/writeShallow from git/shallow.ts instead
