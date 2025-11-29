import { join, normalize } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Worktree operations for GitBackendFs
 */

// Helper to determine worktree gitdir from worktreeBackend
export async function getWorktreeGitdir(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
): Promise<string> {
  const dir = worktreeBackend.getDirectory?.()
  if (!dir) {
    // No directory means it's the main worktree
    return this.getGitdir()
  }

  const normalizedDir = normalize(dir)
  const mainDir = normalize(join(this.getGitdir(), '..'))

  // Check if it's the main worktree
  if (normalizedDir === mainDir) {
    return this.getGitdir()
  }

  // Search for linked worktree
  const worktreesDir = join(this.getGitdir(), 'worktrees')
  try {
    if (await this.getFs().exists(worktreesDir)) {
      const entries = await this.getFs().readdir(worktreesDir)
      if (entries) {
        for (const entry of entries) {
          const candidateGitdir = join(worktreesDir, entry)
          const gitdirFile = join(candidateGitdir, 'gitdir')
          if (await this.getFs().exists(gitdirFile)) {
            const content = await this.getFs().read(gitdirFile, 'utf8')
            if (typeof content === 'string') {
              const candidatePath = normalize(content.trim())
              if (candidatePath === normalizedDir) {
                return candidateGitdir
              }
            }
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Default to main gitdir if not found
  return this.getGitdir()
}

export async function readWorktreeConfig(this: GitBackendFs, name: string): Promise<string | null> {
  const path = join(this.getGitdir(), 'worktrees', name, 'gitdir')
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8').trim() : (data as string).trim()
  } catch {
    return null
  }
}

export async function writeWorktreeConfig(this: GitBackendFs, name: string, data: string): Promise<void> {
  const worktreeDir = join(this.getGitdir(), 'worktrees', name)
  if (!(await this.getFs().exists(worktreeDir))) {
    await this.getFs().mkdir(worktreeDir)
  }
  const path = join(worktreeDir, 'gitdir')
  await this.getFs().write(path, UniversalBuffer.from(data, 'utf8'))
}

export async function listWorktrees(this: GitBackendFs): Promise<string[]> {
  const worktreesDir = join(this.getGitdir(), 'worktrees')
  try {
    const dirs = await this.getFs().readdir(worktreesDir)
    if (!dirs) {
      return []
    }
    return dirs.filter((d: string) => typeof d === 'string')
  } catch {
    return []
  }
}

export async function createWorktreeGitdir(this: GitBackendFs, name: string, worktreeDir: string): Promise<import('../GitBackend.ts').WorktreeGitdir> {
  // Create worktree gitdir: <repo>/.git/worktrees/<name>
  const worktreeGitdir = join(this.getGitdir(), 'worktrees', name)
  await this.getFs().mkdir(worktreeGitdir, { recursive: true })
  
  // Write .git/worktrees/<name>/gitdir file containing absolute path to worktree directory
  // This is the reverse mapping that Git uses to find worktrees
  // This is part of the gitdir structure, so it's handled by GitBackend
  const worktreeGitdirFile = join(worktreeGitdir, 'gitdir')
  await this.getFs().write(worktreeGitdirFile, UniversalBuffer.from(worktreeDir, 'utf8'))
  
  // Return opaque interface - the actual path is hidden
  return {
    getPath: () => worktreeGitdir,
  }
}

export async function writeWorktreeHEAD(this: GitBackendFs, worktreeGitdir: import('../GitBackend.ts').WorktreeGitdir, value: string): Promise<void> {
  // Write HEAD in worktree gitdir
  const worktreeGitdirPath = worktreeGitdir.getPath()
  const { writeRef } = await import('../../git/refs/writeRef.ts')
  const objectFormat = await this.getObjectFormat({})
  await writeRef({
    fs: this.getFs(),
    gitdir: worktreeGitdirPath,
    ref: 'HEAD',
    value: value.trim(),
    objectFormat,
  })
}

export async function readWorktreeConfigObject(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
): Promise<import('../../core-utils/ConfigParser.ts').ConfigObject | null> {
  const worktreeGitdir = await getWorktreeGitdir.call(this, worktreeBackend)
  const { readWorktreeConfig } = await import('../../git/config/worktreeConfig.ts')
  return readWorktreeConfig({ fs: this.getFs(), gitdir: worktreeGitdir })
}

export async function writeWorktreeConfigObject(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  config: import('../../core-utils/ConfigParser.ts').ConfigObject
): Promise<void> {
  const worktreeGitdir = await getWorktreeGitdir.call(this, worktreeBackend)
  const { writeWorktreeConfig } = await import('../../git/config/worktreeConfig.ts')
  return writeWorktreeConfig({ fs: this.getFs(), gitdir: worktreeGitdir, config })
}

export async function getWorktreeConfig(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  path: string
): Promise<unknown> {
  const config = await this.readWorktreeConfigObject(worktreeBackend)
  if (!config) return undefined
  
  return config.get(path)
}

export async function setWorktreeConfig(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  path: string,
  value: unknown,
  append = false
): Promise<void> {
  const { parse: parseConfig } = await import('../../core-utils/ConfigParser.ts')
  
  const existingConfig = await this.readWorktreeConfigObject(worktreeBackend)
  const config = existingConfig || parseConfig(UniversalBuffer.alloc(0))
  config.set(path, value, append)
  await this.writeWorktreeConfigObject(worktreeBackend, config)
}

export async function getAllWorktreeConfig(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  path: string
): Promise<Array<{ value: unknown; scope: 'worktree' }>> {
  const config = await this.readWorktreeConfigObject(worktreeBackend)
  if (!config) {
    return []
  }
  const values = config.getall(path) || []
  return values.map(value => ({ value, scope: 'worktree' as const }))
}

export async function getWorktreeConfigSubsections(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  section: string
): Promise<(string | null)[]> {
  const config = await this.readWorktreeConfigObject(worktreeBackend)
  if (!config) {
    return []
  }
  return config.getSubsections(section)
}

export async function getWorktreeConfigSections(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
): Promise<string[]> {
  const config = await this.readWorktreeConfigObject(worktreeBackend)
  if (!config) {
    return []
  }
  const sections = new Set<string>()
  if (config.parsedConfig) {
    for (const entry of config.parsedConfig) {
      if (entry.isSection && entry.section) {
        sections.add(entry.section)
      }
    }
  }
  return Array.from(sections)
}

export async function reloadWorktreeConfig(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
): Promise<void> {
  // Configs are loaded fresh on each call, so no-op
}

