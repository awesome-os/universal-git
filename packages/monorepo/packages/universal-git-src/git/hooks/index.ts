/**
 * Git Hooks Module
 * 
 * Provides functions for reading, writing, and executing Git hooks.
 * 
 * Note: Hook execution requires process/child_process support and may not work
 * in all environments (e.g., browsers). Hook execution is optional and will
 * gracefully fail if the environment doesn't support it.
 */

export { shouldRunHook, getHooksPath } from './shouldRunHook.ts'
export { readHook } from './readHook.ts'
export { runHook } from './runHook.ts'
export type { HookContext, HookResult, HookExecutor } from './runHook.ts'

// Server-side hooks (for receive-pack)
export {
  runPreReceiveHook,
  runUpdateHook,
  runPostReceiveHook,
  runServerHooks,
} from './serverHooks.ts'
export type { RefUpdate } from './serverHooks.ts'

