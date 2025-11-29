import { join, normalize } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Submodule operations for GitBackendFs
 */

export async function readGitmodules(this: GitBackendFs, worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend): Promise<string | null> {
  // .gitmodules is in the working directory root
  // Use worktreeBackend to read it (worktreeBackend is a black box)
  try {
    const content = await worktreeBackend.read('.gitmodules')
    if (content === null || content === undefined) {
      return null
    }
    return UniversalBuffer.isBuffer(content) ? content.toString('utf8') : (content as string)
  } catch {
    return null
  }
}

export async function writeGitmodules(this: GitBackendFs, worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, data: string): Promise<void> {
  // .gitmodules is in the working directory root
  // Use worktreeBackend to write it (worktreeBackend is a black box)
  await worktreeBackend.write('.gitmodules', UniversalBuffer.from(data, 'utf8'))
}

export async function parseGitmodules(this: GitBackendFs, worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend): Promise<Map<string, { path: string; url: string; branch?: string }>> {
  // Read .gitmodules from worktree backend
  const content = await this.readGitmodules(worktreeBackend)
  const submodules = new Map<string, { path: string; url: string; branch?: string }>()

  if (content === null || content === undefined) {
    return submodules
  }

  // Parse .gitmodules using ConfigParser (GitBackendFs implementation detail)
  const { parse: parseConfig } = await import('../../core-utils/ConfigParser.ts')
  const buffer = UniversalBuffer.from(content, 'utf8')
  const config = parseConfig(buffer)

  // Extract submodule sections
  const subsections = config.getSubsections('submodule')
  for (const name of subsections) {
    if (name) {
      const path = config.get(`submodule.${name}.path`) as string | undefined
      const url = config.get(`submodule.${name}.url`) as string | undefined
      const branch = config.get(`submodule.${name}.branch`) as string | undefined

      if (path && url) {
        const info = {
          path,
          url,
          branch: branch || undefined,
        }
        submodules.set(name, info)
        
        // Store submodule info in worktree backend via setSubmodule
        if (worktreeBackend.setSubmodule) {
          await worktreeBackend.setSubmodule(path, { name, ...info })
        }
      }
    }
  }

  return submodules
}

export async function getSubmoduleByName(this: GitBackendFs, worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, name: string): Promise<{ name: string; path: string; url: string; branch?: string } | null> {
  // First, parse all submodules to ensure worktree backend has the info
  const submodules = await this.parseGitmodules(worktreeBackend)
  
  // Find submodule by name
  for (const [submoduleName, info] of submodules.entries()) {
    if (submoduleName === name) {
      return { name: submoduleName, ...info }
    }
  }
  
  return null
}

export async function getSubmoduleByPath(this: GitBackendFs, worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend, path: string): Promise<{ name: string; path: string; url: string; branch?: string } | null> {
  // Try to get from worktree backend first
  if (worktreeBackend.getSubmodule) {
    const info = await worktreeBackend.getSubmodule(path)
    if (info) {
      return info
    }
  }
  
  // Fallback: parse all submodules and find by path
  const submodules = await this.parseGitmodules(worktreeBackend)
  for (const [name, info] of submodules.entries()) {
    if (info.path === path) {
      return { name, ...info }
    }
  }
  
  return null
}

export async function readSubmoduleConfig(this: GitBackendFs, path: string): Promise<string | null> {
  const fullPath = join(this.getGitdir(), 'modules', path, 'config')
  try {
    const data = await this.getFs().read(fullPath)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
  } catch {
    return null
  }
}

export async function writeSubmoduleConfig(this: GitBackendFs, path: string, data: string): Promise<void> {
  const moduleDir = join(this.getGitdir(), 'modules', path)
  if (!(await this.getFs().exists(moduleDir))) {
    await this.getFs().mkdir(moduleDir)
  }
  const fullPath = join(moduleDir, 'config')
  await this.getFs().write(fullPath, UniversalBuffer.from(data, 'utf8'))
}

