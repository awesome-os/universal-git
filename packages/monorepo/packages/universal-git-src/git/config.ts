import { serialize as serializeConfig, type ConfigObject } from '../core-utils/ConfigParser.ts'
import { join } from '../core-utils/GitPath.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import { loadAllConfigs } from './config/loader.ts'
import { mergeConfigs, getConfigDefault } from './config/merge.ts'
import { parse as parseConfig } from '../core-utils/ConfigParser.ts'

/**
 * Read configuration value from the repository
 * 
 * Uses the capability module pattern: loads all configs, merges them, and returns the value.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param path - Config path (e.g., 'user.name', 'remote.origin.url')
 * @param systemConfigPath - Optional path to system config
 * @param globalConfigPath - Optional path to global config
 * @returns Promise resolving to the config value, or undefined if not found
 */
export async function getConfig({
  fs,
  gitdir,
  path,
  systemConfigPath,
  globalConfigPath,
}: {
  fs: FileSystemProvider
  gitdir: string
  path: string
  systemConfigPath?: string
  globalConfigPath?: string
}): Promise<unknown> {
  // Load all config sources
  const { system, global, local, worktree } = await loadAllConfigs({
    fs,
    gitdir,
    systemConfigPath,
    globalConfigPath,
  })

  // Merge configs with proper precedence
  const merged = mergeConfigs(system, global, local, worktree)

  // Get value from merged config
  const result = merged.get(path)

  // If result is undefined, check for defaults
  if (result === undefined) {
    return getConfigDefault(path, system, global, local)
  }

  return result
}

/**
 * Set configuration value in the repository
 * 
 * Uses the capability module pattern: loads local config, sets value, and saves.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param path - Config path (e.g., 'user.name', 'remote.origin.url')
 * @param value - Value to set
 * @param scope - Config scope: 'local' (default), 'global', or 'system'
 * @param systemConfigPath - Optional path to system config (required for 'system' scope)
 * @param globalConfigPath - Optional path to global config (required for 'global' scope)
 */
export async function setConfig({
  fs,
  gitdir,
  path,
  value,
  scope = 'local',
  systemConfigPath,
  globalConfigPath,
}: {
  fs: FileSystemProvider
  gitdir: string
  path: string
  value: unknown
  scope?: 'local' | 'global' | 'system'
  systemConfigPath?: string
  globalConfigPath?: string
}): Promise<void> {
  const { loadLocalConfig, loadGlobalConfig, loadSystemConfig } = await import('./config/loader.ts')
  const { serialize: serializeConfig } = await import('../core-utils/ConfigParser.ts')
  const { join } = await import('../core-utils/GitPath.ts')

  if (scope === 'local') {
    const localConfig = await loadLocalConfig(fs, gitdir)
    localConfig.set(path, value)
    const configBuffer = serializeConfig(localConfig)
    await fs.write(join(gitdir, 'config'), configBuffer)
  } else if (scope === 'global' && globalConfigPath) {
    const globalConfig = await loadGlobalConfig(fs, globalConfigPath)
    globalConfig.set(path, value)
    const configBuffer = serializeConfig(globalConfig)
    await fs.write(globalConfigPath, configBuffer)
  } else if (scope === 'system' && systemConfigPath) {
    const systemConfig = await loadSystemConfig(fs, systemConfigPath)
    systemConfig.set(path, value)
    const configBuffer = serializeConfig(systemConfig)
    await fs.write(systemConfigPath, configBuffer)
  } else {
    throw new Error(`Cannot set ${scope} config: path not provided`)
  }
}

/**
 * Get all configuration values matching a path pattern from all sources
 * 
 * Uses the capability module pattern: loads all configs and returns values with scope.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param path - Config path pattern (e.g., 'remote.*.url')
 * @param systemConfigPath - Optional path to system config
 * @param globalConfigPath - Optional path to global config
 * @returns Promise resolving to array of config values with their paths and scopes
 */
export async function getConfigAll({
  fs,
  gitdir,
  path,
  systemConfigPath,
  globalConfigPath,
}: {
  fs: FileSystemProvider
  gitdir: string
  path: string
  systemConfigPath?: string
  globalConfigPath?: string
}): Promise<Array<{ path: string; value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }>> {
  const { loadAllConfigs } = await import('./config/loader.ts')
  
  // Load all config sources
  const { system, global, local, worktree } = await loadAllConfigs({
    fs,
    gitdir,
    systemConfigPath,
    globalConfigPath,
  })

  const results: Array<{ path: string; value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }> = []
  
  // Get all values from each config source
  const systemValues = system.getall(path) || []
  for (const value of systemValues) {
    if (value !== undefined) {
      results.push({ path, value, scope: 'system' })
    }
  }
  
  const globalValues = global.getall(path) || []
  for (const value of globalValues) {
    if (value !== undefined) {
      results.push({ path, value, scope: 'global' })
    }
  }
  
  const localValues = local.getall(path) || []
  for (const value of localValues) {
    if (value !== undefined) {
      results.push({ path, value, scope: 'local' })
    }
  }
  
  const worktreeValues = worktree.getall(path) || []
  for (const value of worktreeValues) {
    if (value !== undefined) {
      results.push({ path, value, scope: 'worktree' })
    }
  }
  
  return results
}

/**
 * Read the raw local config file
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @returns Promise resolving to the parsed config object
 */
export async function readConfig({
  fs,
  gitdir,
}: {
  fs: FileSystemProvider
  gitdir: string
}): Promise<ConfigObject> {
  const configPath = join(gitdir, 'config')
  try {
    const buffer = await fs.read(configPath)
    const configBuffer = UniversalBuffer.isBuffer(buffer) ? buffer : UniversalBuffer.from(buffer as string | Uint8Array)
    return parseConfig(configBuffer)
  } catch {
    // Config doesn't exist yet - return empty config
    return parseConfig(UniversalBuffer.alloc(0))
  }
}

/**
 * Write the raw local config file
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param config - Config object to write
 */
export async function writeConfig({
  fs,
  gitdir,
  config,
}: {
  fs: FileSystemProvider
  gitdir: string
  config: ConfigObject
}): Promise<void> {
  const configPath = join(gitdir, 'config')
  const serialized = serializeConfig(config)
  await fs.write(configPath, serialized)
}

// Export worktree config functions
export {
  readWorktreeConfig,
  writeWorktreeConfig,
  hasWorktreeConfig,
} from './config/worktreeConfig.ts'

// Export branch tracking functions
export {
  getBranchTracking,
  setBranchTracking,
  removeBranchTracking,
} from './config/branchTracking.ts'

