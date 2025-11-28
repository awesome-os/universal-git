import { join } from "../utils/join.ts"
import { ConfigAccess } from "../utils/configAccess.ts"
import { writeSymbolicRef } from "../git/refs/writeRef.ts"
import { FilesystemBackend } from '../backends/index.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import type { ObjectFormat } from "../utils/detectObjectFormat.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { GitBackend } from '../backends/index.ts'
import type { Repository } from '../core-utils/Repository.ts'

/**
 * Initialize a new repository
 * 
 * @param objectFormat - Object format to use ('sha1' or 'sha256'), defaults to 'sha1'
 */
export async function init({
  repo: _repo,
  fs: _fs,
  bare = false,
  dir,
  gitdir = bare ? dir : (dir ? join(dir, '.git') : undefined),
  defaultBranch = 'master',
  objectFormat = 'sha1',
  backend,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  bare?: boolean
  dir?: string
  gitdir?: string
  defaultBranch?: string
  objectFormat?: ObjectFormat
  backend?: GitBackend
}): Promise<void> {
  try {
    let fs: FileSystemProvider
    let effectiveDir: string | undefined
    let effectiveGitdir: string | undefined

    if (_repo) {
      // Get fs from gitBackend if it's a FilesystemBackend
      if (_repo.gitBackend && 'getFs' in _repo.gitBackend) {
        fs = (_repo.gitBackend as any).getFs()
      } else {
        throw new Error('Cannot initialize repository: filesystem backend required')
      }
      effectiveGitdir = await _repo.getGitdir()
      const worktree = _repo.getWorktree()
      if (worktree) {
        effectiveDir = worktree.dir || undefined
      }
      if (!bare && !effectiveDir && !_repo.worktreeBackend) {
        throw new Error('Cannot initialize non-bare repository without worktree')
      }
    } else {
      if (!_fs) {
        throw new Error('Either repo or fs must be provided')
      }
      fs = _fs
      effectiveDir = dir
      effectiveGitdir = gitdir
    }

    assertParameter('fs', fs)
    assertParameter('gitdir', effectiveGitdir!)
    // For non-bare repos, dir is required unless repo has worktreeBackend (which is a black box)
    if (!bare && !_repo?.worktreeBackend) {
      assertParameter('dir', effectiveDir)
    }

    return await _init({
      fs,
      bare,
      dir: effectiveDir,
      gitdir: effectiveGitdir,
      defaultBranch,
      objectFormat,
      backend,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.init'
    throw err
  }
}

/**
 * Internal init implementation
 * @internal - Exported for use by other commands (e.g., clone)
 */
export async function _init({
  fs,
  bare = false,
  dir,
  gitdir = bare ? dir : (dir ? join(dir, '.git') : undefined),
  defaultBranch = 'master',
  objectFormat = 'sha1',
  backend,
}: {
  fs: FileSystemProvider
  bare?: boolean
  dir?: string
  gitdir?: string
  defaultBranch?: string
  objectFormat?: ObjectFormat
  backend?: GitBackend
}): Promise<void> {
  // Use backend if provided, otherwise create filesystem backend
  const resolvedGitdir = gitdir! // Asserted by assertParameter above
  const gitBackend = backend || new FilesystemBackend(fs, resolvedGitdir)

  // Delegate to backend's init method
  // init() always creates a bare repository
  // Backend-specific implementations will handle initialization
  await gitBackend.init({
    defaultBranch,
    objectFormat,
  })
  
  // If bare=false, update config to make it non-bare
  // (This is for backward compatibility with the command interface)
  if (!bare) {
    const { ConfigAccess } = await import('../utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, resolvedGitdir)
    await configAccess.setConfigValue('core.bare', 'false', 'local')
    await configAccess.setConfigValue('core.logallrefupdates', 'true', 'local')
  }
}

