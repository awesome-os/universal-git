import { parse as parseConfig, type ConfigObject } from '../../core-utils/ConfigParser.ts'
import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Loads system config from the specified path.
 * Returns empty config if path is not provided or file doesn't exist.
 */
export async function loadSystemConfig(
  fs: FileSystemProvider,
  systemConfigPath?: string
): Promise<ConfigObject> {
  if (!systemConfigPath) {
    return parseConfig(UniversalBuffer.alloc(0))
  }

  try {
    const systemBuffer = await fs.read(systemConfigPath)
    return parseConfig(
      UniversalBuffer.isBuffer(systemBuffer) ? systemBuffer : UniversalBuffer.from(systemBuffer as string, 'utf8')
    )
  } catch {
    // System config doesn't exist, that's okay
    return parseConfig(UniversalBuffer.alloc(0))
  }
}

/**
 * Loads global config from the specified path.
 * Returns empty config if path is not provided or file doesn't exist.
 */
export async function loadGlobalConfig(
  fs: FileSystemProvider,
  globalConfigPath?: string
): Promise<ConfigObject> {
  if (!globalConfigPath) {
    return parseConfig(UniversalBuffer.alloc(0))
  }

  try {
    const globalBuffer = await fs.read(globalConfigPath)
    return parseConfig(
      UniversalBuffer.isBuffer(globalBuffer) ? globalBuffer : UniversalBuffer.from(globalBuffer as string, 'utf8')
    )
  } catch {
    // Global config doesn't exist, that's okay
    return parseConfig(UniversalBuffer.alloc(0))
  }
}

/**
 * Loads local config from the repository's .git/config file.
 * Returns empty config if file doesn't exist.
 * 
 * @param gitBackend - GitBackend instance to read config from
 * @param fs - Optional filesystem (for backward compatibility, deprecated)
 * @param gitdir - Optional gitdir (for backward compatibility, deprecated)
 */
export async function loadLocalConfig(
  gitBackend?: import('../../backends/GitBackend.ts').GitBackend,
  fs?: FileSystemProvider,
  gitdir?: string
): Promise<ConfigObject> {
  // Use gitBackend if provided (preferred)
  if (gitBackend) {
    try {
      const configBuffer = await gitBackend.readConfig()
      return parseConfig(configBuffer)
    } catch {
      // Local config doesn't exist yet
      return parseConfig(UniversalBuffer.alloc(0))
    }
  }
  
  // Fallback to fs-based read (for backward compatibility, deprecated)
  if (fs && gitdir) {
    const localConfigPath = join(gitdir, 'config')
    try {
      const localBuffer = await fs.read(localConfigPath)
      return parseConfig(
        UniversalBuffer.isBuffer(localBuffer) ? localBuffer : UniversalBuffer.from(localBuffer as string, 'utf8')
      )
    } catch {
      // Local config doesn't exist yet
      return parseConfig(UniversalBuffer.alloc(0))
    }
  }
  
  // No backend or fs - return empty config
  return parseConfig(UniversalBuffer.alloc(0))
}

/**
 * Loads worktree config if we're in a worktree.
 * Returns empty config if not in a worktree or file doesn't exist.
 */
export async function loadWorktreeConfig(
  fs: FileSystemProvider,
  gitdir: string
): Promise<ConfigObject> {
  const { isWorktreeGitdir } = await import('../refs/worktreeRefs.ts')
  if (isWorktreeGitdir(gitdir)) {
    const { readWorktreeConfig } = await import('./worktreeConfig.ts')
    const worktreeConfig = await readWorktreeConfig({ fs, gitdir })
    // If worktree config doesn't exist, use empty config
    if (!worktreeConfig) {
      return parseConfig(UniversalBuffer.alloc(0))
    }
    return worktreeConfig
  }
  return parseConfig(UniversalBuffer.alloc(0))
}

/**
 * Loads all config sources (system, global, local, worktree).
 * This is a convenience function that loads all configs in one call.
 * 
 * @param gitBackend - GitBackend instance to read local config from (preferred)
 * @param fs - Optional filesystem for system/global config and backward compatibility
 * @param gitdir - Optional gitdir for backward compatibility (deprecated, use gitBackend instead)
 * @param systemConfigPath - Optional path to system config (for CLI usage)
 * @param globalConfigPath - Optional path to global config (for CLI usage)
 */
export async function loadAllConfigs({
  gitBackend,
  fs,
  gitdir,
  systemConfigPath,
  globalConfigPath,
}: {
  gitBackend?: import('../../backends/GitBackend.ts').GitBackend
  fs?: FileSystemProvider
  gitdir?: string
  systemConfigPath?: string
  globalConfigPath?: string
}): Promise<{
  system: ConfigObject
  global: ConfigObject
  local: ConfigObject
  worktree: ConfigObject
}> {
  // Load local config from backend (preferred) or fs (backward compatibility)
  const localPromise = loadLocalConfig(gitBackend, fs, gitdir)
  
  // Load worktree config (still uses fs/gitdir for now, as it's worktree-specific)
  const worktreePromise = fs && gitdir ? loadWorktreeConfig(fs, gitdir) : Promise.resolve(parseConfig(UniversalBuffer.alloc(0)))
  
  // Load system/global config (only if fs is provided - for CLI usage)
  const systemPromise = fs ? loadSystemConfig(fs, systemConfigPath) : Promise.resolve(parseConfig(UniversalBuffer.alloc(0)))
  const globalPromise = fs ? loadGlobalConfig(fs, globalConfigPath) : Promise.resolve(parseConfig(UniversalBuffer.alloc(0)))
  
  const [system, global, local, worktree] = await Promise.all([
    systemPromise,
    globalPromise,
    localPromise,
    worktreePromise,
  ])

  return { system, global, local, worktree }
}

