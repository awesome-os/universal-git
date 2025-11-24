import { UnifiedConfigService } from '../core-utils/UnifiedConfigService.ts'
import { parse as parseConfig, serialize as serializeConfig, type ConfigObject } from '../core-utils/ConfigParser.ts'
import { join } from '../core-utils/GitPath.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'

/**
 * Read configuration value from the repository
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
  const service = new UnifiedConfigService(fs, gitdir, systemConfigPath, globalConfigPath)
  await service.load()
  return service.get(path)
}

/**
 * Set configuration value in the repository
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param path - Config path (e.g., 'user.name', 'remote.origin.url')
 * @param value - Value to set
 * @param systemConfigPath - Optional path to system config
 * @param globalConfigPath - Optional path to global config
 */
export async function setConfig({
  fs,
  gitdir,
  path,
  value,
  systemConfigPath,
  globalConfigPath,
}: {
  fs: FileSystemProvider
  gitdir: string
  path: string
  value: unknown
  systemConfigPath?: string
  globalConfigPath?: string
}): Promise<void> {
  const service = new UnifiedConfigService(fs, gitdir, systemConfigPath, globalConfigPath)
  await service.load()
  // UnifiedConfigService.set() automatically saves, no need to call save()
  await service.set(path, value)
}

/**
 * Get all configuration values matching a path pattern
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param path - Config path pattern (e.g., 'remote.*.url')
 * @param systemConfigPath - Optional path to system config
 * @param globalConfigPath - Optional path to global config
 * @returns Promise resolving to array of config values with their paths
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
}): Promise<Array<{ path: string; value: unknown }>> {
  const service = new UnifiedConfigService(fs, gitdir, systemConfigPath, globalConfigPath)
  await service.load()
  const results = await service.getAll(path)
  // Convert ConfigValueWithScope[] to { path: string; value: unknown }[]
  return results.map(({ value }) => ({ path, value }))
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

