import { join } from '../GitPath.ts'
import { parse as parseConfig, serialize as serializeConfig } from '../ConfigParser.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

type SubmoduleInfo = {
  path: string
  url: string
  branch?: string
}

/**
 * Parses .gitmodules file and returns submodule definitions
 */
export const parseGitmodules = async ({
  fs,
  dir,
}: {
  fs: FileSystemProvider
  dir: string
}): Promise<Map<string, SubmoduleInfo>> => {
  const gitmodulesPath = join(dir, '.gitmodules')
  const submodules = new Map<string, SubmoduleInfo>()

  try {
    const content = await fs.read(gitmodulesPath)
    // Handle case where fs.read() returns null for non-existent files
    if (content === null || content === undefined) {
      return submodules
    }
    const buffer = UniversalBuffer.isBuffer(content) ? content : UniversalBuffer.from(content as string, 'utf8')
    const config = parseConfig(buffer)

    // Extract submodule sections
    const subsections = config.getSubsections('submodule')
    for (const name of subsections) {
      if (name) {
        const path = config.get(`submodule.${name}.path`) as string | undefined
        const url = config.get(`submodule.${name}.url`) as string | undefined
        const branch = config.get(`submodule.${name}.branch`) as string | undefined

        if (path && url) {
          submodules.set(name, {
            path,
            url,
            branch: branch || undefined,
          })
        }
      }
    }
  } catch (err) {
    if ((err as { code?: string }).code !== 'NOENT') {
      throw err
    }
    // .gitmodules doesn't exist, return empty map
  }

  return submodules
}

/**
 * Gets submodule information for a specific path
 */
export const getSubmoduleByPath = async ({
  fs,
  dir,
  path,
}: {
  fs: FileSystemProvider
  dir: string
  path: string
}): Promise<{ name: string } & SubmoduleInfo | null> => {
  const submodules = await parseGitmodules({ fs, dir })
  for (const [name, info] of submodules.entries()) {
    if (info.path === path) {
      return { name, ...info }
    }
  }
  return null
}

/**
 * Gets submodule information by name
 */
export const getSubmoduleByName = async ({
  fs,
  dir,
  name,
}: {
  fs: FileSystemProvider
  dir: string
  name: string
}): Promise<{ name: string } & SubmoduleInfo | null> => {
  const submodules = await parseGitmodules({ fs, dir })
  const info = submodules.get(name)
  if (info) {
    return { name, ...info }
  }
  return null
}

/**
 * Checks if a path is a submodule
 */
export const isSubmodule = async ({
  fs,
  dir,
  path,
}: {
  fs: FileSystemProvider
  dir: string
  path: string
}): Promise<boolean> => {
  const submodule = await getSubmoduleByPath({ fs, dir, path })
  return submodule !== null
}

/**
 * Gets the gitdir for a submodule
 */
export const getSubmoduleGitdir = ({
  gitdir,
  path,
}: {
  gitdir: string
  path: string
}): string => {
  // Submodules are stored in .git/modules/<path>
  return join(gitdir, 'modules', path)
}

/**
 * Initializes a submodule (creates the submodule directory structure and copies URL to config)
 * This is equivalent to `git submodule init <name>` - it copies the submodule URL from
 * .gitmodules into .git/config, allowing the URL to be overridden in config without
 * modifying .gitmodules.
 */
export const initSubmodule = async ({
  fs,
  dir,
  gitdir,
  name,
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  name: string
}): Promise<void> => {
  const submodule = await getSubmoduleByName({ fs, dir, name })
  if (!submodule) {
    throw new Error(`Submodule ${name} not found in .gitmodules`)
  }

  // Copy submodule URL from .gitmodules to .git/config
  // This allows the URL to be overridden in config without modifying .gitmodules
  const { ConfigAccess } = await import('../../utils/configAccess.ts')
  const configAccess = new ConfigAccess(fs, gitdir)
  
  // Only set the URL in config if it's not already set (don't overwrite user overrides)
  const existingUrl = await configAccess.getConfigValue(`submodule.${name}.url`)
  if (!existingUrl) {
    await configAccess.setConfigValue(`submodule.${name}.url`, submodule.url, 'local')
  }

  const submoduleDir = join(dir, submodule.path)
  const submoduleGitdir = getSubmoduleGitdir({ gitdir, path: submodule.path })

  // Create submodule directory (if it doesn't exist)
  try {
    await fs.mkdir(submoduleDir)
  } catch {
    // Directory might already exist, that's okay
  }

  // Create submodule gitdir (if it doesn't exist)
  try {
    await fs.mkdir(submoduleGitdir)
  } catch {
    // Directory might already exist, that's okay
  }

  // Note: The actual clone/checkout would be done by the clone/checkout commands
  // This function just initializes the submodule configuration
}

/**
 * Updates a submodule (clones and checks out the correct commit)
 */
export const updateSubmodule = async ({
  fs,
  dir,
  gitdir,
  name,
  commitOid,
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  name: string
  commitOid: string
}): Promise<void> => {
  const submodule = await getSubmoduleByName({ fs, dir, name })
  if (!submodule) {
    throw new Error(`Submodule ${name} not found in .gitmodules`)
  }

  // This would typically call clone/checkout commands
  // For now, we just ensure the structure exists
  await initSubmodule({ fs, dir, gitdir, name })

  // The actual clone and checkout would be handled by the high-level API
  // This is just the low-level utility
}

/**
 * Updates a submodule URL in .gitmodules
 */
export const updateSubmoduleUrl = async ({
  fs,
  dir,
  name,
  url,
}: {
  fs: FileSystemProvider
  dir: string
  name: string
  url: string
}): Promise<void> => {
  const gitmodulesPath = join(dir, '.gitmodules')
  const content = await fs.read(gitmodulesPath)
  
  // Throw error if .gitmodules doesn't exist
  if (content === null || content === undefined) {
    const { NotFoundError } = await import('../../errors/NotFoundError.ts')
    throw new NotFoundError('.gitmodules')
  }
  
  const buffer = UniversalBuffer.isBuffer(content) ? content : UniversalBuffer.from(content as string, 'utf8')
  const config = parseConfig(buffer)

  config.set(`submodule.${name}.url`, url)

  const updatedConfig = serializeConfig(config)
  await fs.write(gitmodulesPath, updatedConfig)
}

