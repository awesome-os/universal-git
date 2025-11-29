/**
 * Merge Stream - Encapsulates the merge process using Web Streams API
 * Provides proper flow control and event emission for merge operations
 * 
 * This stream wraps the mergeTree function and emits events for each stage
 * of the merge process, providing a clean audit trail and better encapsulation
 */

import { MergeConflictError } from '../errors/MergeConflictError.ts'
import { UnmergedPathsError } from '../errors/UnmergedPathsError.ts'
import { getStateMutationStream } from './StateMutationStream.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import type { GitIndex } from '../git/index/GitIndex.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'

export type MergeStreamEvent =
  | { type: 'start'; data: { ourOid: string; baseOid: string; theirOid: string } }
  | { type: 'check-unmerged'; data: { hasUnmerged: boolean; unmergedPaths: string[] } }
  | { type: 'merge-start'; data: {} }
  | { type: 'merge-complete'; data: { treeOid: string } }
  | { type: 'merge-conflict'; data: { error: MergeConflictError } }
  | { type: 'error'; data: { error: Error } }

export interface MergeStreamOptions {
  gitBackend: GitBackend
  index: GitIndex
  ourOid: string
  baseOid: string
  theirOid: string
  ourName?: string
  baseName?: string
  theirName?: string
  abortOnConflict?: boolean
  dryRun?: boolean
  mergeDriver?: (params: {
    branches: [string, string, string]
    contents: [string, string, string]
    path: string
  }) => { cleanMerge: boolean; mergedText: string }
  // Optional: for worktree operations (writing conflict files)
  fs?: FileSystemProvider | null
  dir?: string | null
  cache?: Record<string, unknown>
  gitdir?: string
}

/**
 * Merge Stream - Encapsulates the merge process with proper flow control
 * Uses Web Streams API to provide event-driven merge processing
 */
export class MergeStream extends ReadableStream<MergeStreamEvent> {
  private controller!: ReadableStreamDefaultController<MergeStreamEvent>
  private options!: MergeStreamOptions

  constructor(options: MergeStreamOptions) {
    let controller: ReadableStreamDefaultController<MergeStreamEvent>
    let mergePromise: Promise<void> | null = null
    
    super({
      start: (ctrl) => {
        controller = ctrl
      },
    })
    
    // Now we can safely set the properties and start
    this.controller = controller!
    this.options = options
    
    // Start the merge process asynchronously
    // Store the promise so we can wait for it if needed
    mergePromise = this.startMerge().catch(async (err: Error) => {
      // Check if it's a MergeConflictError - if so, emit as merge-conflict event
      const isMergeConflictError = 
        err instanceof MergeConflictError ||
        (err as any)?.code === MergeConflictError.code ||
        (err as any)?.code === 'MergeConflictError' ||
        (err as any)?.name === 'MergeConflictError' ||
        (Array.isArray((err as any)?.filepaths) || Array.isArray((err as any)?.data?.filepaths))
      
      if (isMergeConflictError) {
        // Reconstruct to ensure it's recognized
        const error = err as any
        const mergeConflictError = new MergeConflictError(
          error?.data?.filepaths || error?.filepaths || [],
          error?.data?.bothModified || error?.bothModified || [],
          error?.data?.deleteByUs || error?.deleteByUs || [],
          error?.data?.deleteByTheirs || error?.deleteByTheirs || []
        )
        await this.emit({ type: 'merge-conflict', data: { error: mergeConflictError } }).catch(() => {})
      } else {
        await this.emit({ type: 'error', data: { error: err } }).catch(() => {})
      }
      try {
        controller.close()
      } catch {
        // Controller might already be closed
      }
    })
    
    // Store promise for potential external waiting
    ;(this as any)._mergePromise = mergePromise
  }

  private async emit(event: MergeStreamEvent): Promise<void> {
    try {
      this.controller.enqueue(event)
      // Also record in state mutation stream for audit trail
      const mutationStream = getStateMutationStream()
      // Get gitdir from options or GitBackend
      let gitdir: string | undefined
      if (this.options.gitdir) {
        gitdir = this.options.gitdir
      } else {
        // gitdir must be provided in options - backends are black boxes
        gitdir = undefined
      }
      
      if (gitdir) {
        const { normalize } = await import('./GitPath.ts')
        const normalizedGitdir = normalize(gitdir)
        
        if (event.type === 'merge-complete') {
          mutationStream.record({
            type: 'object-write',
            gitdir: normalizedGitdir,
            data: { treeOid: event.data.treeOid, operation: 'merge' },
          })
        } else if (event.type === 'merge-conflict') {
          // Safely extract filepaths from the error
          const error = event.data.error as any
          const filepaths = error?.data?.filepaths || error?.filepaths || []
          mutationStream.record({
            type: 'index-write',
            gitdir: normalizedGitdir,
            data: { 
              operation: 'merge-conflict',
              conflictedFiles: filepaths,
            },
          })
        }
      }
    } catch (err) {
      // Stream might be closed, ignore
    }
  }

  private async startMerge(): Promise<void> {
    const { gitBackend, index, ourOid, baseOid, theirOid } = this.options

    // Emit start event
    await this.emit({
      type: 'start',
      data: { ourOid, baseOid, theirOid },
    })

    // Check for unmerged paths
    const unmergedPaths = index.unmergedPaths
    await this.emit({
      type: 'check-unmerged',
      data: { hasUnmerged: unmergedPaths.length > 0, unmergedPaths },
    })

    // Always throw UnmergedPathsError if there are unmerged paths, regardless of abortOnConflict
    // This matches native git behavior - you cannot merge when there are unmerged paths
    if (unmergedPaths.length > 0) {
      const error = new UnmergedPathsError(unmergedPaths)
      await this.emit({ type: 'error', data: { error } })
      try {
        this.controller.close()
      } catch {
        // Controller might already be closed
      }
      throw error
    }

    // Use the existing mergeTree function - it's already well-tested
    const { mergeTree } = await import('../git/merge/mergeTree.ts')
    const { Repository } = await import('./Repository.ts')
    const { createGitWorktreeBackend } = await import('../git/worktree/index.ts')
    
    // Create Repository with proper worktree backend if fs and dir are available
    // Otherwise, use the worktreeBackend from the repo if it exists
    let worktreeBackend: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend | undefined
    if (this.options.fs && this.options.dir) {
      worktreeBackend = createGitWorktreeBackend({ fs: this.options.fs, dir: this.options.dir })
    }
    // Note: If fs/dir are not available, mergeTree should use the repo's worktreeBackend
    
    const repo = new Repository({
      gitBackend,
      worktreeBackend,
      cache: this.options.cache || {},
      autoDetectConfig: true,
    })
    
    await this.emit({ type: 'merge-start', data: {} })

    try {
      const result = await mergeTree({
        repo,
        index,
        ourOid,
        baseOid,
        theirOid,
        ourName: this.options.ourName,
        baseName: this.options.baseName,
        theirName: this.options.theirName,
        abortOnConflict: this.options.abortOnConflict,
        dryRun: this.options.dryRun,
        mergeDriver: this.options.mergeDriver,
      })

      if (typeof result === 'string') {
        // Success - merge completed with tree OID
        await this.emit({
          type: 'merge-complete',
          data: { treeOid: result },
        })
        try {
          this.controller.close()
        } catch {
          // Controller might already be closed
        }
      } else {
        // Conflict - result is MergeConflictError
        // CRITICAL: mergeTree returns MergeConflictError directly, not throws it
        // Extract properties from the error (they're in the data property)
        const err = result as any
        const mergeConflictError = result instanceof MergeConflictError
          ? result
          : new MergeConflictError(
              err?.data?.filepaths || err?.filepaths || [],
              err?.data?.bothModified || err?.bothModified || [],
              err?.data?.deleteByUs || err?.deleteByUs || [],
              err?.data?.deleteByTheirs || err?.deleteByTheirs || []
            )
        // Emit the merge-conflict event BEFORE closing the stream
        // This ensures the event is available for consume() to read
        await this.emit({
          type: 'merge-conflict',
          data: { error: mergeConflictError },
        })
        try {
          this.controller.close()
        } catch {
          // Controller might already be closed
        }
        // Throw the error so it can be caught and handled properly
        throw mergeConflictError
      }
    } catch (error) {
      // Handle any errors from mergeTree
      // CRITICAL: Check by code property first (more reliable across module boundaries)
      const err = error as any
      const isMergeConflictError = 
        error instanceof MergeConflictError ||
        err?.code === MergeConflictError.code ||
        err?.code === 'MergeConflictError' ||
        err?.name === 'MergeConflictError' ||
        (Array.isArray(err?.filepaths) || Array.isArray(err?.data?.filepaths)) // MergeConflictError has filepaths array
      
      if (isMergeConflictError) {
        // Reconstruct the error to ensure it's recognized across module boundaries
        const err = error as any
        const mergeConflictError = new MergeConflictError(
          err?.data?.filepaths || err?.filepaths || [],
          err?.data?.bothModified || err?.bothModified || [],
          err?.data?.deleteByUs || err?.deleteByUs || [],
          err?.data?.deleteByTheirs || err?.deleteByTheirs || []
        )
        await this.emit({
          type: 'merge-conflict',
          data: { error: mergeConflictError },
        })
        try {
          this.controller.close()
        } catch {
          // Controller might already be closed
        }
        throw mergeConflictError
      } else {
        await this.emit({ type: 'error', data: { error: error as Error } })
        try {
          this.controller.close()
        } catch {
          // Controller might already be closed
        }
        throw error
      }
    }
  }

  /**
   * Helper method to consume the stream and return the result
   * This is a convenience method for simple use cases
   */
  static async consume(stream: MergeStream): Promise<string> {
    const events: MergeStreamEvent[] = []
    let result: string | MergeConflictError | null = null
    let error: Error | null = null

    const reader = stream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        events.push(value)

        if (value.type === 'merge-complete') {
          result = value.data.treeOid
        } else if (value.type === 'merge-conflict') {
          // CRITICAL: Reconstruct MergeConflictError to ensure it's recognized
          const err = value.data.error as any
          result = new MergeConflictError(
            err?.filepaths || err?.data?.filepaths || [],
            err?.bothModified || err?.data?.bothModified || [],
            err?.deleteByUs || err?.data?.deleteByUs || [],
            err?.deleteByTheirs || err?.data?.deleteByTheirs || []
          )
        } else if (value.type === 'error') {
          error = value.data.error
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Check if error is a MergeConflictError (but not already in result)
    if (error) {
      const err = error as any
      const isMergeConflictError = 
        error instanceof MergeConflictError ||
        err?.code === MergeConflictError.code ||
        err?.code === 'MergeConflictError' ||
        err?.name === 'MergeConflictError' ||
        (Array.isArray(err?.filepaths) || Array.isArray(err?.data?.filepaths))
      
      if (isMergeConflictError) {
        // Convert error to MergeConflictError if needed
        result = result || new MergeConflictError(
          err?.data?.filepaths || err?.filepaths || [],
          err?.data?.bothModified || err?.bothModified || [],
          err?.data?.deleteByUs || err?.deleteByUs || [],
          err?.data?.deleteByTheirs || err?.deleteByTheirs || []
        )
      } else {
        throw error
      }
    }

    if (result === null) {
      throw new Error('Merge stream did not produce a result')
    }

    // Throw MergeConflictError if that's what we got
    // CRITICAL: Check by code property as well (more reliable across module boundaries)
    const isMergeConflictError = 
      result instanceof MergeConflictError ||
      (result as any)?.code === MergeConflictError.code ||
      (result as any)?.code === 'MergeConflictError' ||
      (result as any)?.name === 'MergeConflictError' ||
      (Array.isArray((result as any)?.filepaths) || Array.isArray((result as any)?.data?.filepaths))
    
    if (isMergeConflictError) {
      throw result
    }

    // TypeScript guard - result is string at this point
    if (typeof result !== 'string') {
      throw new Error('Merge stream did not produce a string result')
    }
    return result
  }

  /**
   * Create a merge stream and consume it, returning the result
   * This is the simplest way to use the merge stream
   * 
   * When abortOnConflict is false, returns MergeConflictError instead of throwing it
   * When abortOnConflict is true, throws MergeConflictError
   */
  static async execute(options: MergeStreamOptions): Promise<string | MergeConflictError> {
    const stream = new MergeStream(options)
    // Wait for the internal merge process to complete before consuming
    // This ensures all events are emitted before we start reading
    // CRITICAL: Wait for the promise to settle (resolve or reject) to ensure all events are emitted
    // Use Promise.allSettled to wait for both the promise and a small delay to ensure events are queued
    await Promise.allSettled([
      (stream as any)._mergePromise,
      new Promise(resolve => setTimeout(resolve, 0)) // Small delay to ensure events are queued
    ])
    
    // Use consume but catch MergeConflictError and return it if abortOnConflict is false
    try {
      return await MergeStream.consume(stream)
    } catch (error) {
      // CRITICAL: Check by code property first (more reliable across module boundaries)
      // Also check for the error structure that mergeTree returns
      const err = error as any
      const isMergeConflictError = 
        error instanceof MergeConflictError ||
        err?.code === MergeConflictError.code ||
        err?.code === 'MergeConflictError' ||
        err?.name === 'MergeConflictError' ||
        (Array.isArray(err?.filepaths) || Array.isArray(err?.data?.filepaths)) // MergeConflictError has filepaths array
      
      // If it's a MergeConflictError and abortOnConflict is false, return it instead of throwing
      if (isMergeConflictError && options.abortOnConflict === false) {
        // Reconstruct the error to ensure it's recognized across module boundaries
        return new MergeConflictError(
          err?.data?.filepaths || err?.filepaths || [],
          err?.data?.bothModified || err?.bothModified || [],
          err?.data?.deleteByUs || err?.deleteByUs || [],
          err?.data?.deleteByTheirs || err?.deleteByTheirs || []
        )
      }
      // Otherwise, re-throw
      throw error
    }
  }
}

