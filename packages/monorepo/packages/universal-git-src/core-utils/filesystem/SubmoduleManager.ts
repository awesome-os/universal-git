import { join } from '../GitPath.ts'
import { parse as parseConfig, serialize as serializeConfig } from '../ConfigParser.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { Repository } from '../Repository.ts'

type SubmoduleInfo = {
  path: string
  url: string
  branch?: string
}

/**
 * Parses .gitmodules file and returns submodule definitions
 */
export const parseGitmodules = async ({
  repo,
  fs,
  dir,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
}): Promise<Map<string, SubmoduleInfo>> => {
  // Extract from repo if provided, otherwise use provided parameters
  let effectiveFs: FileSystemProvider
  let effectiveDir: string
  
  if (repo) {
    effectiveFs = repo.fs
    const repoDir = await repo.getDir()
    if (!repoDir) {
      throw new Error('Repository must have a working directory for submodule operations')
    }
    effectiveDir = repoDir
  } else {
    if (!fs || !dir) {
      throw new Error('Either repo or both fs and dir must be provided')
    }
    effectiveFs = fs
    effectiveDir = dir
  }
  
  const gitmodulesPath = join(effectiveDir, '.gitmodules')
  const submodules = new Map<string, SubmoduleInfo>()

  try {
    const content = await effectiveFs.read(gitmodulesPath)
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
  repo,
  fs,
  dir,
  path,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  path: string
}): Promise<{ name: string } & SubmoduleInfo | null> => {
  const submodules = await parseGitmodules({ repo, fs, dir })
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
  repo,
  fs,
  dir,
  name,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  name: string
}): Promise<{ name: string } & SubmoduleInfo | null> => {
  const submodules = await parseGitmodules({ repo, fs, dir })
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
  repo,
  fs,
  dir,
  path,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  path: string
}): Promise<boolean> => {
  const submodule = await getSubmoduleByPath({ repo, fs, dir, path })
  return submodule !== null
}

/**
 * Gets the gitdir for a submodule
 * 
 * @deprecated Use `repo.getSubmodule(path)` to get the submodule Repository instance instead.
 * The submodule Repository's gitdir can be accessed via `await submoduleRepo.getGitdir()`.
 */
export const getSubmoduleGitdir = async ({
  repo,
  gitdir,
  path,
}: {
  repo?: Repository
  gitdir?: string
  path: string
}): Promise<string> => {
  // Extract gitdir from repo if provided, otherwise use provided parameter
  let effectiveGitdir: string
  
  if (repo) {
    effectiveGitdir = await repo.getGitdir()
  } else {
    if (!gitdir) {
      throw new Error('Either repo or gitdir must be provided')
    }
    effectiveGitdir = gitdir
  }
  
  // Submodules are stored in .git/modules/<path>
  return join(effectiveGitdir, 'modules', path)
}

/**
 * Initializes a submodule (creates the submodule directory structure and copies URL to config)
 * This is equivalent to `git submodule init <name>` - it copies the submodule URL from
 * .gitmodules into .git/config, allowing the URL to be overridden in config without
 * modifying .gitmodules.
 * 
 * **Repository-Based Architecture**:
 * 
 * This function works through the parent Repository instance. After initialization,
 * the submodule can be accessed via `repo.getSubmodule(name)`, which returns a
 * Repository instance with its own GitBackend.
 */
export const initSubmodule = async ({
  repo,
  fs,
  dir,
  gitdir,
  name,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  name: string
}): Promise<void> => {
  // Extract from repo if provided, otherwise use provided parameters
  let effectiveRepo: Repository
  let effectiveFs: FileSystemProvider
  let effectiveDir: string
  let effectiveGitdir: string
  
  if (repo) {
    effectiveRepo = repo
    effectiveFs = repo.fs
    const repoDir = await repo.getDir()
    if (!repoDir) {
      throw new Error('Repository must have a working directory for submodule operations')
    }
    effectiveDir = repoDir
    effectiveGitdir = await repo.getGitdir()
  } else {
    if (!fs || !dir || !gitdir) {
      throw new Error('Either repo or fs, dir, and gitdir must be provided')
    }
    effectiveFs = fs
    effectiveDir = dir
    effectiveGitdir = gitdir
    // Create a temporary Repository instance for operations
    const { Repository } = await import('../Repository.ts')
    effectiveRepo = await Repository.open({
      fs: effectiveFs,
      dir: effectiveDir,
      gitdir: effectiveGitdir,
      cache: {},
      autoDetectConfig: true,
    })
  }
  
  const submodule = await getSubmoduleByName({ repo: effectiveRepo, name })
  if (!submodule) {
    throw new Error(`Submodule ${name} not found in .gitmodules`)
  }

  // Copy submodule URL from .gitmodules to .git/config
  // This allows the URL to be overridden in config without modifying .gitmodules
  const { ConfigAccess } = await import('../../utils/configAccess.ts')
  const configAccess = new ConfigAccess(effectiveFs, effectiveGitdir)
  
  // Only set the URL in config if it's not already set (don't overwrite user overrides)
  const existingUrl = await configAccess.getConfigValue(`submodule.${name}.url`)
  if (!existingUrl) {
    await configAccess.setConfigValue(`submodule.${name}.url`, submodule.url, 'local')
  }

  const submoduleDir = join(effectiveDir, submodule.path)
  const submoduleGitdir = await getSubmoduleGitdir({ repo: effectiveRepo, gitdir: effectiveGitdir, path: submodule.path })

  // Create submodule directory (if it doesn't exist)
  try {
    await effectiveFs.mkdir(submoduleDir)
  } catch {
    // Directory might already exist, that's okay
  }

  // Create submodule gitdir (if it doesn't exist)
  try {
    await effectiveFs.mkdir(submoduleGitdir)
  } catch {
    // Directory might already exist, that's okay
  }

  // Invalidate submodule cache so getSubmodule() will create a fresh Repository instance
  if (repo) {
    repo.invalidateSubmoduleCache()
  }

  // Note: The actual clone/checkout would be done by the clone/checkout commands
  // This function just initializes the submodule configuration
  // After initialization, use repo.getSubmodule(name) to get the submodule Repository
}

/**
 * Updates a submodule (clones and checks out the correct commit)
 * 
 * **Repository-Based Architecture**:
 * 
 * This function works through Repository instances. After update, the submodule
 * can be accessed via `repo.getSubmodule(name)`, which returns a Repository
 * instance with its own GitBackend.
 */
export const updateSubmodule = async ({
  repo,
  fs,
  dir,
  gitdir,
  name,
  commitOid,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  name: string
  commitOid: string
}): Promise<void> => {
  // Extract from repo if provided, otherwise use provided parameters
  let effectiveRepo: Repository
  
  if (repo) {
    effectiveRepo = repo
  } else {
    if (!fs || !dir || !gitdir) {
      throw new Error('Either repo or fs, dir, and gitdir must be provided')
    }
    // Create a temporary Repository instance for operations
    const { Repository } = await import('../Repository.ts')
    effectiveRepo = await Repository.open({
      fs,
      dir,
      gitdir,
      cache: {},
      autoDetectConfig: true,
    })
  }
  
  const submodule = await getSubmoduleByName({ repo: effectiveRepo, name })
  if (!submodule) {
    throw new Error(`Submodule ${name} not found in .gitmodules`)
  }

  // This would typically call clone/checkout commands
  // For now, we just ensure the structure exists
  await initSubmodule({ repo: effectiveRepo, name })

  // The actual clone and checkout would be handled by the high-level API
  // This is just the low-level utility
  // After update, use repo.getSubmodule(name) to get the submodule Repository
}

/**
 * Updates a submodule URL in .gitmodules
 */
export const updateSubmoduleUrl = async ({
  repo,
  fs,
  dir,
  name,
  url,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  name: string
  url: string
}): Promise<void> => {
  // Extract from repo if provided, otherwise use provided parameters
  let effectiveFs: FileSystemProvider
  let effectiveDir: string
  
  if (repo) {
    effectiveFs = repo.fs
    const repoDir = await repo.getDir()
    if (!repoDir) {
      throw new Error('Repository must have a working directory for submodule operations')
    }
    effectiveDir = repoDir
  } else {
    if (!fs || !dir) {
      throw new Error('Either repo or both fs and dir must be provided')
    }
    effectiveFs = fs
    effectiveDir = dir
  }
  
  const gitmodulesPath = join(effectiveDir, '.gitmodules')
  const content = await effectiveFs.read(gitmodulesPath)
  
  // Throw error if .gitmodules doesn't exist
  if (content === null || content === undefined) {
    const { NotFoundError } = await import('../../errors/NotFoundError.ts')
    throw new NotFoundError('.gitmodules')
  }
  
  const buffer = UniversalBuffer.isBuffer(content) ? content : UniversalBuffer.from(content as string, 'utf8')
  const config = parseConfig(buffer)

  config.set(`submodule.${name}.url`, url)

  const updatedConfig = serializeConfig(config)
  await effectiveFs.write(gitmodulesPath, updatedConfig)
}

