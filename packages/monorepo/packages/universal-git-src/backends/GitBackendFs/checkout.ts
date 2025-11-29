import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Checkout operation for GitBackendFs
 */

export async function checkout(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  ref: string,
  options?: {
    filepaths?: string[]
    force?: boolean
    noCheckout?: boolean
    noUpdateHead?: boolean
    dryRun?: boolean
    sparsePatterns?: string[]
    onProgress?: import('../../git/remote/types.ts').ProgressCallback
    remote?: string
    track?: boolean
    oldOid?: string
  }
): Promise<void> {
  const { checkout } = await import('../../commands/checkout.ts')
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }

  return await checkout({
    fs: this.getFs(),
    dir,
    gitdir: this.getGitdir(),
    ref,
    filepaths: options?.filepaths,
    force: options?.force,
    noCheckout: options?.noCheckout,
    noUpdateHead: options?.noUpdateHead,
    dryRun: options?.dryRun,
    sparsePatterns: options?.sparsePatterns,
    onProgress: options?.onProgress,
    remote: options?.remote,
    track: options?.track,
  })
}

