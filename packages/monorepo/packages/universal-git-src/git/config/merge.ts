import { parse as parseConfig, type ConfigObject } from '../../core-utils/ConfigParser.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Merges multiple config objects with proper precedence.
 * Precedence: worktree > local > global > system (later overrides earlier)
 * 
 * @param system - System config
 * @param global - Global config
 * @param local - Local config
 * @param worktree - Worktree config
 * @returns Merged config object
 */
export function mergeConfigs(
  system: ConfigObject,
  global: ConfigObject,
  local: ConfigObject,
  worktree: ConfigObject
): ConfigObject {
  // Create a new config object
  const merged = parseConfig(UniversalBuffer.alloc(0))

  // Helper to copy all values from source to target
  // We iterate through parsedConfig to get all paths
  const copyConfig = (source: ConfigObject | null, target: ConfigObject): void => {
    if (source?.parsedConfig) {
      for (const entry of source.parsedConfig) {
        if (entry.path && entry.value !== undefined && entry.value !== null) {
          // Only copy variable entries, not section headers
          if (entry.name) {
            target.set(entry.path, entry.value)
          }
        }
      }
    }
  }

  // Merge in order: system, global, local, worktree (later overrides earlier)
  copyConfig(system, merged)
  copyConfig(global, merged)
  copyConfig(local, merged)
  copyConfig(worktree, merged)

  return merged
}

/**
 * Gets platform-specific defaults (e.g., Git for Windows defaults).
 * 
 * @param path - Config path (e.g., 'core.autocrlf')
 * @returns Default value for the path, or undefined if no default
 */
export function getPlatformDefault(path: string): unknown {
  const isWindows = typeof process !== 'undefined' && process.platform === 'win32'
  
  if (!isWindows) {
    return undefined
  }
  
  // Git for Windows compiled-in defaults
  // These match what Git for Windows uses when config values are not set
  const windowsDefaults: Record<string, unknown> = {
    'core.autocrlf': true,  // Git for Windows default: true
    // Add other Windows-specific defaults here as needed
  }
  
  return windowsDefaults[path]
}

/**
 * Gets default value for a config path based on Git's behavior.
 * This includes platform-specific defaults and boolean config defaults.
 * 
 * @param path - Config path (e.g., 'core.autocrlf')
 * @param system - System config (to check for deletion markers)
 * @param global - Global config (to check for deletion markers)
 * @param local - Local config (to check for deletion markers)
 * @returns Default value, or undefined if no default should be applied
 */
export function getConfigDefault(
  path: string,
  system?: ConfigObject,
  global?: ConfigObject,
  local?: ConfigObject
): unknown {
  // First, check if there's a deletion marker in any config source
  // This must be checked BEFORE the default logic
  const hasDeletionMarker = 
    local?.parsedConfig.some(c => c.path === path + '.deleted') ||
    global?.parsedConfig.some(c => c.path === path + '.deleted') ||
    system?.parsedConfig.some(c => c.path === path + '.deleted')
  
  // If there's a deletion marker, return undefined (it was explicitly deleted)
  if (hasDeletionMarker) {
    return undefined
  }
  
  // Check if config exists in any source (as a regular config, not a deletion marker)
  const existsInLocal = local?.parsedConfig.some(c => c.path === path && c.name && !c.path.endsWith('.deleted')) || false
  const existsInGlobal = global?.parsedConfig.some(c => c.path === path && c.name && !c.path.endsWith('.deleted')) || false
  const existsInSystem = system?.parsedConfig.some(c => c.path === path && c.name && !c.path.endsWith('.deleted')) || false
  const existsAnywhere = existsInLocal || existsInGlobal || existsInSystem
  
  // If it exists anywhere but result is undefined, it means it was deleted
  // In that case, return undefined (not default)
  if (existsAnywhere) {
    return undefined
  }
  
  // Check for platform-specific defaults (e.g., Git for Windows defaults)
  const platformDefault = getPlatformDefault(path)
  if (platformDefault !== undefined) {
    return platformDefault
  }
  
  // Apply defaults for boolean configs that should default to false when never set
  // Note: We don't return defaults for configs like merge.ff here because that changes the API
  // Callers should handle defaults based on their needs (e.g., merge command handles merge.ff default)
  const parts = path.split('.')
  if (parts.length >= 2) {
    const section = parts[0]
    const name = parts.slice(1).join('.')
    
    // Boolean configs in core section that should default to false when never set
    const booleanConfigsFalse: Record<string, string[]> = {
      core: ['symlinks', 'filemode', 'bare', 'logallrefupdates', 'ignorecase']
    }
    if (booleanConfigsFalse[section]?.includes(name)) {
      return false
    }
  }
  
  return undefined
}

