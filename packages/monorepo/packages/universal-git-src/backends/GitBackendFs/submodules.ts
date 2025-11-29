import { join } from '../../core-utils/GitPath.ts'
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'
import { parse as parseConfig, serialize as serializeConfig } from '../../core-utils/ConfigParser.ts'
import type { GitWorktreeBackend } from '../../git/worktree/GitWorktreeBackend.ts'

/**
 * Submodule operations for GitBackendFs
 */

export async function readGitmodules(this: GitBackendFs, worktreeBackend: GitWorktreeBackend): Promise<string | null> {
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

export async function writeGitmodules(this: GitBackendFs, worktreeBackend: GitWorktreeBackend, data: string): Promise<void> {
  // .gitmodules is in the working directory root
  // Use worktreeBackend to write it (worktreeBackend is a black box)
  await worktreeBackend.write('.gitmodules', UniversalBuffer.from(data, 'utf8'))
}

export async function parseGitmodules(this: GitBackendFs, worktreeBackend: GitWorktreeBackend): Promise<Map<string, { path: string; url: string; branch?: string }>> {
  // Read .gitmodules from worktree backend
  const content = await this.readGitmodules(worktreeBackend)
  const submodules = new Map<string, { path: string; url: string; branch?: string }>()

  if (content === null || content === undefined) {
    return submodules
  }

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

export async function getSubmoduleByName(this: GitBackendFs, worktreeBackend: GitWorktreeBackend, name: string): Promise<{ name: string; path: string; url: string; branch?: string } | null> {
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

export async function getSubmoduleByPath(this: GitBackendFs, worktreeBackend: GitWorktreeBackend, path: string): Promise<{ name: string; path: string; url: string; branch?: string } | null> {
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

// -------------------------------------------------------------------------------------------------
// Submodule Utility Functions (Refactored from SubmoduleManager.ts)
// -------------------------------------------------------------------------------------------------

/**
 * Checks if a path is a submodule
 */
export async function isSubmodule(this: GitBackendFs, worktreeBackend: GitWorktreeBackend, path: string): Promise<boolean> {
  const submodule = await this.getSubmoduleByPath(worktreeBackend, path)
  return submodule !== null
}

/**
 * Gets the gitdir for a submodule
 * 
 * @deprecated Use `repo.getSubmodule(path)` to get the submodule Repository instance instead.
 * The submodule Repository's gitdir can be accessed via `await submoduleRepo.getGitdir()`.
 */
export async function getSubmoduleGitdir(this: GitBackendFs, path: string): Promise<string> {
  // Submodules are stored in .git/modules/<path>
  return join(this.getGitdir(), 'modules', path)
}

/**
 * Initializes a submodule (creates the submodule directory structure and copies URL to config)
 * This is equivalent to `git submodule init <name>` - it copies the submodule URL from
 * .gitmodules into .git/config, allowing the URL to be overridden in config without
 * modifying .gitmodules.
 */
export async function initSubmodule(
  this: GitBackendFs,
  worktreeBackend: GitWorktreeBackend,
  name: string
): Promise<void> {
  const submodule = await this.getSubmoduleByName(worktreeBackend, name)
  if (!submodule) {
    throw new Error(`Submodule ${name} not found in .gitmodules`)
  }

  // Copy submodule URL from .gitmodules to .git/config
  // This allows the URL to be overridden in config without modifying .gitmodules
  
  // Only set the URL in config if it's not already set (don't overwrite user overrides)
  // We need to use getConfig/setConfig from GitBackendFs
  try {
    const existingUrl = await this.getConfig(`submodule.${name}.url`)
    // IMPORTANT: existingUrl can be undefined, null, or a value.
    // If it's a value, we don't overwrite it.
    if (existingUrl === undefined || existingUrl === null) {
      await this.setConfig(`submodule.${name}.url`, submodule.url, 'local')
    }
  } catch {
    // If getConfig fails (e.g. config doesn't exist yet), set it
    await this.setConfig(`submodule.${name}.url`, submodule.url, 'local')
  }

  // Submodule directory in worktree
  const submoduleDir = submodule.path
  
  // Create submodule directory (if it doesn't exist)
  try {
    await worktreeBackend.mkdir(submoduleDir)
  } catch {
    // Directory might already exist, that's okay
  }

  // Submodule gitdir in .git/modules
  const submoduleGitdir = await this.getSubmoduleGitdir(submodule.path)
  
  // Create submodule gitdir (if it doesn't exist)
  // Note: This uses the git backend's FS, not the worktree backend
  try {
    await this.getFs().mkdir(submoduleGitdir)
  } catch {
    // Directory might already exist, that's okay
  }

  // Invalidate submodule cache so getSubmodule() will create a fresh Repository instance
  // This is handled by Repository, but here we just ensure the config is updated
}

/**
 * Updates a submodule (clones and checks out the correct commit)
 * 
 * Note: The actual clone/checkout would be handled by the high-level API
 * This is just the low-level utility to ensure structure exists
 */
export async function updateSubmodule(
  this: GitBackendFs,
  worktreeBackend: GitWorktreeBackend,
  name: string,
  commitOid: string
): Promise<void> {
  const submodule = await this.getSubmoduleByName(worktreeBackend, name)
  if (!submodule) {
    throw new Error(`Submodule ${name} not found in .gitmodules`)
  }

  // Ensure initialized
  await this.initSubmodule(worktreeBackend, name)

  // The actual clone and checkout would be handled by the high-level API
}

/**
 * Updates a submodule URL in .gitmodules
 */
export async function updateSubmoduleUrl(
  this: GitBackendFs,
  worktreeBackend: GitWorktreeBackend,
  name: string,
  url: string
): Promise<void> {
  const content = await this.readGitmodules(worktreeBackend)
  
  // Throw error if .gitmodules doesn't exist
  if (content === null || content === undefined) {
    const { NotFoundError } = await import('../../errors/NotFoundError.ts')
    throw new NotFoundError('.gitmodules')
  }
  
  const buffer = UniversalBuffer.isBuffer(content) ? content : UniversalBuffer.from(content as string, 'utf8')
  const config = parseConfig(buffer)

  config.set(`submodule.${name}.url`, url)

  const updatedConfig = serializeConfig(config)
  await this.writeGitmodules(worktreeBackend, updatedConfig)
}

