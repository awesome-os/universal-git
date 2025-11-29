import type { Repository } from './Repository.ts'

/**
 * Add files to the staging area
 */
export async function add(
  this: Repository,
  args: string | string[] | {
    filepath: string | string[]
    force?: boolean
    ignoreErrors?: boolean
    cache?: Record<string, unknown>
  }
): Promise<void> {
  const repo = this as any
  if (await this.isBare()) {
    throw new Error('Cannot add files: repository is bare')
  }
  if (!repo._worktreeBackend) {
    throw new Error('Cannot add files: worktreeBackend is required. Checkout to a WorktreeBackend first.')
  }
  if (!repo._gitBackend) {
    throw new Error('Cannot add files: gitBackend is required.')
  }

  // Normalize args
  let filepath: string | string[]
  let options: { force?: boolean; ignoreErrors?: boolean; cache?: Record<string, unknown> } = {}

  if (typeof args === 'string' || Array.isArray(args)) {
    filepath = args
  } else {
    filepath = args.filepath
    options = args
  }

  // Delegate to gitBackend.add which will use worktreeBackend
  return repo._gitBackend.add(repo._worktreeBackend, filepath, options)
}

/**
 * Commit staged changes
 */
export async function commit(
  this: Repository,
  message: string,
  options: {
    author?: Partial<import('../models/GitCommit.ts').Author>
    committer?: Partial<import('../models/GitCommit.ts').Author>
    noVerify?: boolean
    amend?: boolean
    ref?: string
    parent?: string[]
    tree?: string
  } = {}
): Promise<string> {
  const repo = this as any
  if (await this.isBare()) {
    throw new Error('Cannot commit: repository is bare')
  }
  if (!repo.fs) {
    throw new Error('Cannot commit: filesystem is required. Checkout to a WorktreeBackend first.')
  }
  const { commit: _commit } = await import('../commands/commit.ts')
  const gitdir = await this.getGitdir()
  if (!repo._worktreeBackend) {
    throw new Error('Cannot commit: worktreeBackend is required. Checkout to a WorktreeBackend first.')
  }
  // worktreeBackend is a black box - pass repo directly to commit command
  return _commit({
    repo: this,
    fs: repo.fs,
    dir: repo._dir || undefined,
    gitdir,
    cache: this.cache,
    message,
    ...options,
  })
}

/**
 * Get the status of files in the working directory
 */
export async function status(
  this: Repository,
  filepath?: string
): Promise<import('../commands/status.ts').FileStatus> {
  if (await this.isBare()) {
    throw new Error('Cannot get status: repository is bare')
  }
  const repo = this as any
  if (!repo._worktreeBackend) {
    throw new Error('Cannot get status: worktreeBackend is required. Checkout to a WorktreeBackend first.')
  }
  const { status: _status } = await import('../commands/status.ts')
  // worktreeBackend is a black box - pass repo directly to status command
  // status command will use repo.worktreeBackend for file operations
  return _status({
    repo: this,
    cache: this.cache,
    filepath,
  })
}

/**
 * Get the status matrix of all files
 */
export async function statusMatrix(
  this: Repository,
  options: {
    filepaths?: string[]
  } = {}
): Promise<import('../commands/statusMatrix.ts').StatusRow[]> {
  const repo = this as any
  if (await this.isBare()) {
    throw new Error('Cannot get status matrix: repository is bare')
  }
  const { statusMatrix: _statusMatrix } = await import('../commands/statusMatrix.ts')
  const gitdir = await this.getGitdir()
  if (!repo._worktreeBackend) {
    throw new Error('Cannot get status matrix: worktreeBackend is required. Checkout to a WorktreeBackend first.')
  }
  // worktreeBackend is a black box - pass repo directly to statusMatrix command
  return _statusMatrix({
    repo: this,
    fs: repo.fs,
    dir: repo._dir || undefined,
    gitdir,
    cache: this.cache,
    filepaths: options.filepaths,
  })
}

/**
 * Remove files from the working directory and staging area
 */
export async function remove(
  this: Repository,
  filepaths: string | string[],
  options: {
    cached?: boolean
    force?: boolean
  } = {}
): Promise<void> {
  const repo = this as any
  if (await this.isBare()) {
    throw new Error('Cannot remove files: repository is bare')
  }
  if (!this.worktreeBackend) {
    throw new Error('Cannot remove files: repo.worktreeBackend is required. Checkout to a WorktreeBackend first.')
  }
  const { remove: _remove } = await import('../commands/remove.ts')
  const filepathArray = Array.isArray(filepaths) ? filepaths : [filepaths]
  for (const filepath of filepathArray) {
    await _remove({
      repo: this,
      filepath,
      cached: options.cached,
      force: options.force,
    })
  }
}

/**
 * Reset the index or working directory
 */
export async function reset(
  this: Repository,
  ref: string = 'HEAD',
  mode: 'soft' | 'mixed' | 'hard' = 'mixed'
): Promise<void> {
  if (await this.isBare()) {
    throw new Error('Cannot reset: repository is bare')
  }
  if (!this.worktreeBackend) {
    throw new Error('Cannot reset: repo.worktreeBackend is required. Checkout to a WorktreeBackend first.')
  }
  const { resetToCommit } = await import('../commands/reset.ts')
  return resetToCommit({
    repo: this,
    ref,
    mode,
  })
}


