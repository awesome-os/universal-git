import type { Repository } from './Repository.ts'

/**
 * Initialize this repository
 * 
 * Initializes a new Git repository. If the repository is already initialized,
 * this is a no-op.
 */
export async function init(
  this: Repository,
  options: {
    defaultBranch?: string
    objectFormat?: 'sha1' | 'sha256'
  } = {}
): Promise<void> {
  const repo = this as any
  // Ensure we have a GitBackend
  if (!repo._gitBackend) {
    throw new Error('Cannot initialize repository: gitBackend is required')
  }
  
  // Delegate initialization to the GitBackend
  // init() always creates a bare repository
  // Backend-specific implementations will handle:
  // - Creating directory structure (GitBackendFs)
  // - Creating database tables (SQL backend)
  // - Setting initial config values (core.bare = true)
  // - Setting HEAD to default branch
  await repo._gitBackend.init(options)
  
  // If worktreeBackend is present, this is a non-bare repository
  // Update config to reflect this using backend methods
  if (repo._worktreeBackend) {
    await repo._gitBackend.setConfig('core.bare', 'false', 'local')
    await repo._gitBackend.setConfig('core.logallrefupdates', 'true', 'local')
  }
}


