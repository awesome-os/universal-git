import type { GitBackendFs } from './GitBackendFs.ts'
import * as worktrees from './worktrees.ts'

/**
 * Command wrapper operations for GitBackendFs
 * These methods delegate to command functions
 */

export async function remove(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  filepaths: string | string[],
  options?: { cached?: boolean; force?: boolean }
): Promise<void> {
  const { remove } = await import('../../commands/remove.ts')
  const filepathArray = Array.isArray(filepaths) ? filepaths : [filepaths]
  
  // Get dir from worktreeBackend
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }

  // Use remove command with backends - it will use fs, dir, gitdir directly
  for (const filepath of filepathArray) {
    await remove({
      fs: this.getFs(),
      dir,
      gitdir: this.getGitdir(),
      filepath,
      cached: options?.cached,
      force: options?.force,
    })
  }
}

export async function switchBranch(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  branch: string,
  options?: {
    create?: boolean
    force?: boolean
    track?: boolean
    remote?: string
  }
): Promise<void> {
  // Switch is essentially checkout with branch switching
  return await this.checkout(worktreeBackend, branch, {
    force: options?.force,
    track: options?.track,
    remote: options?.remote,
  })
}

export async function status(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  filepath: string
): Promise<import('../../commands/status.ts').FileStatus> {
  const { status } = await import('../../commands/status.ts')
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }

  return await status({
    fs: this.getFs(),
    dir,
    gitdir: this.getGitdir(),
    filepath,
  })
}

export async function statusMatrix(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  options?: { filepaths?: string[] }
): Promise<import('../../commands/statusMatrix.ts').StatusRow[]> {
  const { statusMatrix } = await import('../../commands/statusMatrix.ts')
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }

  return await statusMatrix({
    fs: this.getFs(),
    dir,
    gitdir: this.getGitdir(),
    filepaths: options?.filepaths,
  })
}

export async function reset(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  ref?: string,
  mode?: 'soft' | 'mixed' | 'hard'
): Promise<void> {
  const { resetToCommit } = await import('../../commands/reset.ts')
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }

  return await resetToCommit({
    fs: this.getFs(),
    dir,
    gitdir: this.getGitdir(),
    ref: ref || 'HEAD',
    mode: mode || 'mixed',
  })
}

export async function diff(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  options?: {
    ref?: string
    filepaths?: string[]
    cached?: boolean
  }
): Promise<import('../../commands/diff.ts').DiffResult> {
  const { diff } = await import('../../commands/diff.ts')
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }

  return await diff({
    fs: this.getFs(),
    dir,
    gitdir: this.getGitdir(),
    refA: options?.ref,
    filepath: options?.filepaths?.[0],
    staged: options?.cached,
  })
}

export async function mergeTree(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  ourOid: string,
  baseOid: string,
  theirOid: string,
  options?: {
    ourName?: string
    baseName?: string
    theirName?: string
    dryRun?: boolean
    abortOnConflict?: boolean
    mergeDriver?: import('../../git/merge/types.ts').MergeDriverCallback
  }
): Promise<string | import('../../errors/MergeConflictError.ts').MergeConflictError> {
  const { mergeTree } = await import('../../git/merge/mergeTree.ts')
  const dir = worktreeBackend.getDirectory?.() || ''
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }

  // Read index from gitdir
  const { readIndex } = await import('../../git/index/readIndex.ts')
  const objectFormat = await this.getObjectFormat({})
  const index = await readIndex({ fs: this.getFs(), gitdir: this.getGitdir(), objectFormat })

  // mergeTree needs repo for writeTree and worktreeBackend access
  const { Repository } = await import('../../core-utils/Repository.ts')
  const repo = new Repository({
    gitBackend: this,
    worktreeBackend,
    cache: {},
    autoDetectConfig: true,
  })
  
  return await mergeTree({
    repo,
    index,
    ourOid,
    baseOid,
    theirOid,
    ourName: options?.ourName,
    baseName: options?.baseName,
    theirName: options?.theirName,
    dryRun: options?.dryRun,
    abortOnConflict: options?.abortOnConflict,
    mergeDriver: options?.mergeDriver,
  })
}

export async function sparseCheckoutInit(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  cone?: boolean
): Promise<void> {
  const dir = worktreeBackend.getDirectory?.()
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory for sparse checkout')
  }
  const worktreeGitdir = await worktrees.getWorktreeGitdir.call(this, worktreeBackend)
  const { sparseCheckout } = await import('../../commands/sparseCheckout.ts')
  await sparseCheckout({
    fs: this.getFs(),
    gitdir: worktreeGitdir,
    dir,
    init: true,
    cone: cone ?? false,
  })
}

export async function sparseCheckoutSet(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  patterns: string[],
  treeOid: string,
  cone?: boolean
): Promise<void> {
  const dir = worktreeBackend.getDirectory?.()
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory for sparse checkout')
  }
  const worktreeGitdir = await worktrees.getWorktreeGitdir.call(this, worktreeBackend)
  const { sparseCheckout } = await import('../../commands/sparseCheckout.ts')
  await sparseCheckout({
    fs: this.getFs(),
    gitdir: worktreeGitdir,
    dir,
    set: patterns,
    cone,
  })
}

export async function sparseCheckoutList(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
): Promise<string[]> {
  const dir = worktreeBackend.getDirectory?.()
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory for sparse checkout')
  }
  const worktreeGitdir = await worktrees.getWorktreeGitdir.call(this, worktreeBackend)
  const { sparseCheckout } = await import('../../commands/sparseCheckout.ts')
  const result = await sparseCheckout({
    fs: this.getFs(),
    gitdir: worktreeGitdir,
    dir,
    list: true,
  })
  return result || []
}

