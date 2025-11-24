/**
 * Central state mutation stream for tracking Git operations
 * Provides a single source of truth for state changes and enables audit trails
 */

export type MutationType = 'index-write' | 'index-read' | 'ref-write' | 'object-write' | 'config-write'

export interface StateMutation {
  type: MutationType
  timestamp: number
  gitdir: string
  data?: Record<string, unknown>
}

type MutationListener = (mutation: StateMutation) => void | Promise<void>

/**
 * Central state mutation stream
 * Tracks all state mutations across the repository for consistency and auditing
 */
export class StateMutationStream {
  private mutations: StateMutation[] = []
  private listeners: Set<MutationListener> = new Set()
  private maxMutations = 1000 // Keep last 1000 mutations for audit trail

  /**
   * Record a state mutation
   */
  record(mutation: Omit<StateMutation, 'timestamp'>): void {
    const fullMutation: StateMutation = {
      ...mutation,
      timestamp: Date.now(),
    }

    // Add to log
    this.mutations.push(fullMutation)
    if (this.mutations.length > this.maxMutations) {
      this.mutations.shift() // Remove oldest
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        const result = listener(fullMutation)
        // Handle async listeners
        if (result instanceof Promise) {
          result.catch(() => {
            // Ignore listener errors
          })
        }
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Subscribe to state mutations
   */
  subscribe(listener: MutationListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Get the latest mutation of a specific type for a gitdir
   */
  getLatest(type: MutationType, gitdir: string): StateMutation | undefined {
    // Search backwards for the most recent matching mutation
    for (let i = this.mutations.length - 1; i >= 0; i--) {
      const mutation = this.mutations[i]
      if (mutation.type === type && mutation.gitdir === gitdir) {
        return mutation
      }
    }
    return undefined
  }

  /**
   * Check if there was a mutation of a specific type after a timestamp
   */
  hasMutationAfter(type: MutationType, gitdir: string, afterTimestamp: number): boolean {
    const latest = this.getLatest(type, gitdir)
    return latest !== undefined && latest.timestamp > afterTimestamp
  }

  /**
   * Get all mutations for a gitdir (for auditing)
   */
  getMutationsForGitdir(gitdir: string): StateMutation[] {
    return this.mutations.filter(m => m.gitdir === gitdir)
  }

  /**
   * Get all mutations (for auditing)
   */
  getAll(): StateMutation[] {
    return [...this.mutations]
  }

  /**
   * Clear all mutations (useful for testing)
   */
  clear(): void {
    this.mutations = []
    this.listeners.clear()
  }
}

// Global singleton instance
let globalStream: StateMutationStream | null = null

/**
 * Get or create the global state mutation stream
 */
export function getStateMutationStream(): StateMutationStream {
  if (!globalStream) {
    globalStream = new StateMutationStream()
  }
  return globalStream
}

/**
 * Reset the global stream (useful for testing)
 */
export function resetStateMutationStream(): void {
  globalStream = null
}

