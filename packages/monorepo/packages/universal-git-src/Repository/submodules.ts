import type { Repository } from './Repository.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'

/**
 * Gets a Repository instance for a submodule by path or name.
 */
export async function getSubmodule(this: Repository, pathOrName: string): Promise<Repository> {
  const repo = this as any
  
  // Check cache first
  if (repo._submoduleRepos.has(pathOrName)) {
    return repo._submoduleRepos.get(pathOrName)!
  }

  if (await this.isBare()) {
    throw new Error('Cannot get submodule: repository is bare')
  }

  // Get submodule info from GitBackend (which manages submodule config)
  if (!repo._worktreeBackend) {
    throw new Error('Repository must have a worktreeBackend for submodule operations')
  }
  const submodules = await repo._gitBackend.parseGitmodules(repo._worktreeBackend)
  
  // Try to find submodule by name first, then by path
  let submoduleInfo: { name: string; path: string; url: string; branch?: string } | null = null
  const byName = submodules.get(pathOrName)
  if (byName) {
    submoduleInfo = { name: pathOrName, ...byName }
  } else {
    // Try by path
    for (const [name, info] of submodules.entries()) {
      if (info.path === pathOrName) {
        submoduleInfo = { name, ...info }
        break
      }
    }
  }
  
  if (!submoduleInfo) {
    throw new Error(`Submodule '${pathOrName}' not found in .gitmodules`)
  }

  // Get submodule gitdir (stored in .git/modules/<path>)
  const gitdir = await this.getGitdir()
  const { join, normalize } = await import('../core-utils/GitPath.ts')
  const submoduleGitdir = normalize(join(gitdir, 'modules', submoduleInfo.path))
  
  // Check if submodule gitdir exists
  if (this.fs && !(await this.fs.exists(submoduleGitdir))) {
    throw new Error(`Submodule '${pathOrName}' gitdir does not exist at ${submoduleGitdir}. Initialize the submodule first.`)
  }

  // Get submodule worktreeBackend
  // worktreeBackend is a black box - use resolvePath to get submodule worktreeBackend
  if (!repo._worktreeBackend) {
    throw new Error('Parent repository must have a worktreeBackend to access submodules')
  }
  
  let submoduleWorktreeBackend: GitWorktreeBackend | undefined
  if (repo._worktreeBackend.resolvePath) {
    const resolved = await repo._worktreeBackend.resolvePath(submoduleInfo.path)
    submoduleWorktreeBackend = resolved.worktree
  } else if (repo._worktreeBackend.getSubmodule) {
    // Alternative: use getSubmodule method if available
    submoduleWorktreeBackend = await repo._worktreeBackend.getSubmodule(submoduleInfo.path)
  } else {
    throw new Error('Submodule access requires worktreeBackend.resolvePath() or getSubmodule() method')
  }

  if (!submoduleWorktreeBackend) {
    throw new Error(`Submodule '${pathOrName}' worktreeBackend not found`)
  }

  // Create submodule Repository instance
  // Reuse the same filesystem and cache from parent repository
  const { GitBackendFs } = await import('../backends/GitBackendFs/index.ts')
  // We assume fs is available if we are creating GitBackendFs
  // If this.fs is null, we can't create GitBackendFs with it. 
  // But submodules inside FS repositories usually imply FS availability.
  // If we are using a non-FS backend, we'd need a non-FS GitBackend for the submodule too.
  // For now, assuming FS availability for submodules as per existing code.
  if (!this.fs) {
     throw new Error('FileSystemProvider is required for submodule initialization')
  }
  
  const submoduleGitBackend = new GitBackendFs(this.fs, submoduleGitdir)
  
  // We need to import Repository class to create new instance.
  // Since we are inside the class definition (via extracted method), we can't import the class itself easily without circular dependency if we were in a separate file.
  // But here we are importing 'Repository' type.
  // We need the constructor.
  // The original code did `const submoduleRepo = new Repository(...)`.
  // We can use the constructor from `this.constructor` if we cast it.
  const RepositoryConstructor = this.constructor as any
  const submoduleRepo = new RepositoryConstructor({
    gitBackend: submoduleGitBackend,
    worktreeBackend: submoduleWorktreeBackend,
    cache: this.cache,
    autoDetectConfig: true,
  })

  // Cache the submodule Repository instance
  repo._submoduleRepos.set(pathOrName, submoduleRepo)
  // Also cache by path for easy lookup
  if (pathOrName !== submoduleInfo.path) {
    repo._submoduleRepos.set(submoduleInfo.path, submoduleRepo)
  }

  return submoduleRepo
}

/**
 * Lists all submodules as Repository instances.
 */
export async function listSubmodules(this: Repository): Promise<Array<{ name: string; path: string; url: string; branch?: string; repo: Repository | null }>> {
  const repo = this as any
  if (await this.isBare()) {
    throw new Error('Cannot list submodules: repository is bare')
  }
  if (!repo._worktreeBackend) {
    throw new Error('Repository must have a worktreeBackend for submodule operations')
  }
  const submodules = await repo._gitBackend.parseGitmodules(repo._worktreeBackend)
  const gitdir = await this.getGitdir()
  const { join, normalize } = await import('../core-utils/GitPath.ts')
  
  const results = await Promise.all(
    Array.from(submodules.entries()).map(async ([name, info]) => {
      const submoduleGitdir = normalize(join(gitdir, 'modules', info.path))
      if (!this.fs) {
        return {
          name,
          path: info.path,
          url: info.url,
          branch: info.branch,
          repo: null,
        }
      }
      const exists = await this.fs.exists(submoduleGitdir)
      
      let submoduleRepo: Repository | null = null
      if (exists) {
        try {
          submoduleRepo = await this.getSubmodule(name)
        } catch {
          // Submodule gitdir exists but can't be opened, return null
          submoduleRepo = null
        }
      }
      
      return {
        name,
        path: info.path,
        url: info.url,
        branch: info.branch,
        repo: submoduleRepo,
      }
    })
  )
  
  return results
}

/**
 * Invalidates the submodule Repository cache
 */
export function invalidateSubmoduleCache(this: Repository): void {
  const repo = this as any
  repo._submoduleRepos.clear()
}


