/**
 * Server-Side Hooks for receive-pack
 * 
 * Implements pre-receive, update, and post-receive hooks that run on the server
 * when receiving push operations via receive-pack.
 */

import { runHook } from './runHook.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import type { HookContext, HookResult } from './runHook.ts'

/**
 * Ref update information for server-side hooks
 */
export interface RefUpdate {
  /** Reference name (e.g., 'refs/heads/main') */
  ref: string
  /** Old object ID (zero OID for new refs) */
  oldOid: string
  /** New object ID (zero OID for deleted refs) */
  newOid: string
}

/**
 * Executes the pre-receive hook
 * 
 * The pre-receive hook receives all ref updates via stdin in the format:
 * <old-value> SP <new-value> SP <ref-name> LF
 * 
 * If the hook exits with a non-zero status, the push is rejected.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param refUpdates - Array of ref updates being pushed
 * @param context - Additional hook context (remote info, etc.)
 * @returns Promise resolving to hook result
 * @throws Error if hook fails (non-zero exit code)
 */
export async function runPreReceiveHook({
  fs,
  gitdir,
  refUpdates,
  context = {},
}: {
  fs: FileSystemProvider
  gitdir: string
  refUpdates: RefUpdate[]
  context?: Omit<HookContext, 'pushedRefs'>
}): Promise<HookResult> {
  // Build stdin for pre-receive hook
  // Format: <old-value> SP <new-value> SP <ref-name> LF
  const stdin = refUpdates
    .map(update => `${update.oldOid} ${update.newOid} ${update.ref}\n`)
    .join('')

  // Build hook context
  const hookContext: HookContext = {
    ...context,
    gitdir,
    pushedRefs: refUpdates.map(update => ({
      ref: update.ref,
      oldOid: update.oldOid,
      newOid: update.newOid,
    })),
  }

  return await runHook({
    fs,
    gitdir,
    hookName: 'pre-receive',
    context: hookContext,
    stdin,
  })
}

/**
 * Executes the update hook for a single ref update
 * 
 * The update hook is called once per ref being updated, with arguments:
 * <ref-name> <old-value> <new-value>
 * 
 * If the hook exits with a non-zero status, that specific ref update is rejected.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param refUpdate - Single ref update
 * @param context - Additional hook context
 * @returns Promise resolving to hook result
 * @throws Error if hook fails (non-zero exit code)
 */
export async function runUpdateHook({
  fs,
  gitdir,
  refUpdate,
  context = {},
}: {
  fs: FileSystemProvider
  gitdir: string
  refUpdate: RefUpdate
  context?: Omit<HookContext, 'pushedRefs'>
}): Promise<HookResult> {
  // Update hook receives arguments: <ref-name> <old-value> <new-value>
  const args = [refUpdate.ref, refUpdate.oldOid, refUpdate.newOid]

  // Build hook context
  const hookContext: HookContext = {
    ...context,
    gitdir,
    pushedRefs: [{
      ref: refUpdate.ref,
      oldOid: refUpdate.oldOid,
      newOid: refUpdate.newOid,
    }],
  }

  return await runHook({
    fs,
    gitdir,
    hookName: 'update',
    context: hookContext,
    args,
  })
}

/**
 * Executes the post-receive hook
 * 
 * The post-receive hook receives all ref updates via stdin in the format:
 * <old-value> SP <new-value> SP <ref-name> LF
 * 
 * This hook runs after all refs have been successfully updated.
 * It cannot reject the push (it runs after the fact).
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param refUpdates - Array of ref updates that were pushed
 * @param context - Additional hook context
 * @returns Promise resolving to hook result (errors are logged but don't fail)
 */
export async function runPostReceiveHook({
  fs,
  gitdir,
  refUpdates,
  context = {},
}: {
  fs: FileSystemProvider
  gitdir: string
  refUpdates: RefUpdate[]
  context?: Omit<HookContext, 'pushedRefs'>
}): Promise<HookResult> {
  // Build stdin for post-receive hook
  // Format: <old-value> SP <new-value> SP <ref-name> LF
  const stdin = refUpdates
    .map(update => `${update.oldOid} ${update.newOid} ${update.ref}\n`)
    .join('')

  // Build hook context
  const hookContext: HookContext = {
    ...context,
    gitdir,
    pushedRefs: refUpdates.map(update => ({
      ref: update.ref,
      oldOid: update.oldOid,
      newOid: update.newOid,
    })),
  }

  try {
    return await runHook({
      fs,
      gitdir,
      hookName: 'post-receive',
      context: hookContext,
      stdin,
    })
  } catch (error) {
    // Post-receive hook errors are logged but don't fail the push
    // Return a result indicating the error but don't throw
    return {
      exitCode: (error as any).exitCode || 1,
      stdout: (error as any).stdout || '',
      stderr: (error as any).stderr || String(error),
    }
  }
}

/**
 * Executes all server-side hooks in the correct order for a receive-pack operation
 * 
 * Order:
 * 1. pre-receive hook (all refs at once) - can reject entire push
 * 2. update hook (once per ref) - can reject individual refs
 * 3. post-receive hook (all refs at once) - cannot reject, runs after success
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param refUpdates - Array of ref updates being pushed
 * @param context - Additional hook context
 * @returns Promise resolving to results for each hook phase
 */
export async function runServerHooks({
  fs,
  gitdir,
  refUpdates,
  context = {},
}: {
  fs: FileSystemProvider
  gitdir: string
  refUpdates: RefUpdate[]
  context?: Omit<HookContext, 'pushedRefs'>
}): Promise<{
  preReceive: HookResult
  update: HookResult[]
  postReceive: HookResult
}> {
  // 1. Run pre-receive hook (all refs at once)
  const preReceive = await runPreReceiveHook({
    fs,
    gitdir,
    refUpdates,
    context,
  })

  // 2. Run update hook for each ref
  const updateResults: HookResult[] = []
  for (const refUpdate of refUpdates) {
    try {
      const result = await runUpdateHook({
        fs,
        gitdir,
        refUpdate,
        context,
      })
      updateResults.push(result)
    } catch (error) {
      // Update hook failed - add error result
      updateResults.push({
        exitCode: (error as any).exitCode || 1,
        stdout: (error as any).stdout || '',
        stderr: (error as any).stderr || String(error),
      })
      // Re-throw to reject this ref update
      throw error
    }
  }

  // 3. Run post-receive hook (all refs at once, after successful updates)
  const postReceive = await runPostReceiveHook({
    fs,
    gitdir,
    refUpdates,
    context,
  })

  return {
    preReceive,
    update: updateResults,
    postReceive,
  }
}

