import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

/**
 * Discovers system and global git config paths following Git's precedence rules.
 * 
 * This function follows the same logic as Git's config file discovery:
 * - System config: GIT_CONFIG_SYSTEM env var or platform-specific defaults
 * - Global config: GIT_CONFIG_GLOBAL env var, XDG_CONFIG_HOME, or HOME/.gitconfig
 * 
 * @param fs - File system provider
 * @param env - Environment variables (defaults to process.env if available)
 * @returns Object with systemConfigPath and globalConfigPath (if they exist)
 */
export async function discoverConfigPaths(
  fs: FileSystemProvider,
  env?: Record<string, string>
): Promise<{ systemConfigPath?: string; globalConfigPath?: string }> {
  const result: { systemConfigPath?: string; globalConfigPath?: string } = {}
  const envVars = env || (typeof process !== 'undefined' && process.env ? process.env : {})

  // System config path
  // 1. Check GIT_CONFIG_SYSTEM environment variable
  if (envVars.GIT_CONFIG_SYSTEM) {
    const systemPath = envVars.GIT_CONFIG_SYSTEM
    if (await fs.exists(systemPath)) {
      result.systemConfigPath = systemPath
    }
  } else {
    // 2. Platform-specific defaults
    // On Windows: C:\ProgramData\Git\config
    // On Unix: /etc/gitconfig
    const isWindows = typeof process !== 'undefined' && process.platform === 'win32'
    const defaultSystemPath = isWindows
      ? 'C:\\ProgramData\\Git\\config'
      : '/etc/gitconfig'
    
    if (await fs.exists(defaultSystemPath)) {
      result.systemConfigPath = defaultSystemPath
    }
  }

  // Global config path
  // 1. Check GIT_CONFIG_GLOBAL environment variable
  if (envVars.GIT_CONFIG_GLOBAL) {
    const globalPath = envVars.GIT_CONFIG_GLOBAL
    if (await fs.exists(globalPath)) {
      result.globalConfigPath = globalPath
    }
  } else {
    // 2. Check XDG_CONFIG_HOME/git/config (if XDG_CONFIG_HOME is set)
    if (envVars.XDG_CONFIG_HOME) {
      const xdgPath = join(envVars.XDG_CONFIG_HOME, 'git', 'config')
      if (await fs.exists(xdgPath)) {
        result.globalConfigPath = xdgPath
      }
    }
    
    // 3. Check HOME/.gitconfig (or USERPROFILE\.gitconfig on Windows)
    if (!result.globalConfigPath) {
      const homeDir = envVars.HOME || envVars.USERPROFILE
      if (homeDir) {
        const homeConfigPath = join(homeDir, '.gitconfig')
        if (await fs.exists(homeConfigPath)) {
          result.globalConfigPath = homeConfigPath
        }
      }
    }
  }

  return result
}

