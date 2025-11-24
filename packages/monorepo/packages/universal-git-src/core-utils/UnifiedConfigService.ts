import { parse as parseConfig, serialize as serializeConfig, type ConfigObject } from './ConfigParser.ts'
import { join } from './GitPath.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

type ConfigValueWithScope = {
  value: unknown
  scope: 'system' | 'global' | 'local'
}

/**
 * Unified Configuration Service that merges config from multiple sources
 * with proper precedence: worktree > local > global > system
 */
export class UnifiedConfigService {
  private readonly fs: FileSystemProvider
  private readonly gitdir: string
  private readonly systemConfigPath?: string
  private readonly globalConfigPath?: string

  private _worktreeConfig: ConfigObject | null = null
  private _localConfig: ConfigObject | null = null
  private _globalConfig: ConfigObject | null = null
  private _systemConfig: ConfigObject | null = null
  private _mergedConfig: ConfigObject | null = null
  private _deletedConfigs: Set<string> = new Set()

  constructor(
    fs: FileSystemProvider,
    gitdir: string,
    systemConfigPath?: string,
    globalConfigPath?: string
  ) {
    this.fs = fs
    this.gitdir = gitdir
    this.systemConfigPath = systemConfigPath
    this.globalConfigPath = globalConfigPath
  }

  /**
   * Loads all config sources and merges them
   */
  async load(): Promise<void> {
    // Load system config
    if (this.systemConfigPath) {
      try {
        const systemBuffer = await this.fs.read(this.systemConfigPath)
        this._systemConfig = parseConfig(
          UniversalBuffer.isBuffer(systemBuffer) ? systemBuffer : UniversalBuffer.from(systemBuffer as string, 'utf8')
        )
      } catch {
        // System config doesn't exist, that's okay
        this._systemConfig = parseConfig(UniversalBuffer.alloc(0))
      }
    } else {
      this._systemConfig = parseConfig(UniversalBuffer.alloc(0))
    }

    // Load global config
    if (this.globalConfigPath) {
      try {
        const globalBuffer = await this.fs.read(this.globalConfigPath)
        this._globalConfig = parseConfig(
          UniversalBuffer.isBuffer(globalBuffer) ? globalBuffer : UniversalBuffer.from(globalBuffer as string, 'utf8')
        )
      } catch {
        // Global config doesn't exist, that's okay
        this._globalConfig = parseConfig(UniversalBuffer.alloc(0))
      }
    } else {
      this._globalConfig = parseConfig(UniversalBuffer.alloc(0))
    }

    // Load local config (from main repository)
    const localConfigPath = join(this.gitdir, 'config')
    try {
      const localBuffer = await this.fs.read(localConfigPath)
      this._localConfig = parseConfig(
        UniversalBuffer.isBuffer(localBuffer) ? localBuffer : UniversalBuffer.from(localBuffer as string, 'utf8')
      )
    } catch (err) {
      // Local config doesn't exist yet
      this._localConfig = parseConfig(UniversalBuffer.alloc(0))
    }

    // Load worktree config (if we're in a worktree)
    // Worktree config is at .git/worktrees/<name>/config
    const { isWorktreeGitdir } = await import('../git/refs/worktreeRefs.ts')
    if (isWorktreeGitdir(this.gitdir)) {
      const { readWorktreeConfig } = await import('../git/config/worktreeConfig.ts')
      this._worktreeConfig = await readWorktreeConfig({ fs: this.fs, gitdir: this.gitdir })
      // If worktree config doesn't exist, use empty config
      if (!this._worktreeConfig) {
        this._worktreeConfig = parseConfig(UniversalBuffer.alloc(0))
      }
    } else {
      this._worktreeConfig = parseConfig(UniversalBuffer.alloc(0))
    }

    // Merge configs (worktree > local > global > system)
    this._mergedConfig = this._mergeConfigs(
      this._systemConfig,
      this._globalConfig,
      this._localConfig,
      this._worktreeConfig
    )
  }

  /**
   * Merges multiple config objects with precedence
   * Precedence: worktree > local > global > system (later overrides earlier)
   * @private
   */
  private _mergeConfigs(
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
   * Gets platform-specific defaults (e.g., Git for Windows defaults)
   * @private
   */
  private _getPlatformDefaults(path: string): unknown {
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
   * Gets a config value with proper precedence (local > global > system)
   * Returns default values for certain configs to match native git behavior
   */
  async get(path: string): Promise<unknown> {
    if (!this._mergedConfig) {
      await this.load()
    }
    
    // Check if it was explicitly deleted first (before checking merged config)
    // This handles deletions within the same service instance
    if (this._deletedConfigs.has(path)) {
      return undefined
    }
    
    // The merged config's get() method also checks for deletion markers in the file
    if (!this._mergedConfig) {
      await this.load()
    }
    const result = this._mergedConfig!.get(path)
    
    // If result is undefined, check for defaults and deletion markers
    if (result === undefined) {
      // First, check if there's a deletion marker in any config source
      // This must be checked BEFORE the default logic
      const hasDeletionMarker = 
        this._localConfig?.parsedConfig.some(c => c.path === path + '.deleted') ||
        this._globalConfig?.parsedConfig.some(c => c.path === path + '.deleted') ||
        this._systemConfig?.parsedConfig.some(c => c.path === path + '.deleted')
      
      // If there's a deletion marker, return undefined (it was explicitly deleted)
      if (hasDeletionMarker) {
        return undefined
      }
      
      // Check if config exists in any source (as a regular config, not a deletion marker)
      const existsInLocal = this._localConfig?.parsedConfig.some(c => c.path === path && c.name && !c.path.endsWith('.deleted')) || false
      const existsInGlobal = this._globalConfig?.parsedConfig.some(c => c.path === path && c.name && !c.path.endsWith('.deleted')) || false
      const existsInSystem = this._systemConfig?.parsedConfig.some(c => c.path === path && c.name && !c.path.endsWith('.deleted')) || false
      const existsAnywhere = existsInLocal || existsInGlobal || existsInSystem
      
      // If it exists anywhere but result is undefined, it means it was deleted
      // In that case, return undefined (not default)
      if (existsAnywhere) {
        return undefined
      }
      
      // Check for platform-specific defaults (e.g., Git for Windows defaults)
      const platformDefault = this._getPlatformDefaults(path)
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
    }
    return result
  }

  /**
   * Gets all values for a path from all sources
   */
  async getAll(path: string): Promise<ConfigValueWithScope[]> {
    if (!this._localConfig || !this._globalConfig || !this._systemConfig) {
      await this.load()
    }

    const results: ConfigValueWithScope[] = []
    // Use getall() to get all values from each config source
    const systemValues = this._systemConfig?.getall(path) || []
    for (const value of systemValues) {
      if (value !== undefined) {
        results.push({ value, scope: 'system' })
      }
    }
    const globalValues = this._globalConfig?.getall(path) || []
    for (const value of globalValues) {
      if (value !== undefined) {
        results.push({ value, scope: 'global' })
      }
    }
    const localValues = this._localConfig?.getall(path) || []
    for (const value of localValues) {
      if (value !== undefined) {
        results.push({ value, scope: 'local' })
      }
    }
    return results
  }

  /**
   * Sets a config value in the specified scope
   * Note: 'worktree' scope is not supported via set() - use worktree config functions directly
   */
  async set(path: string, value: unknown, scope: 'local' | 'global' | 'system' = 'local', append = false): Promise<void> {
    if (scope === 'local') {
      if (!this._localConfig) {
        await this.load()
      }
      // Check if config existed before deletion
      const existedBefore = this._localConfig!.parsedConfig.some(c => c.path === path && c.name)
      this._localConfig!.set(path, value, append)
      // Track deletions - if it existed before and we're deleting it, mark it as deleted
      if (value == null && existedBefore) {
        this._deletedConfigs.add(path)
      } else {
        this._deletedConfigs.delete(path)
      }
      const configBuffer = serializeConfig(this._localConfig!)
      await this.fs.write(join(this.gitdir, 'config'), configBuffer)
      // Reload to update merged config
      await this.load()
    } else if (scope === 'global' && this.globalConfigPath) {
      if (!this._globalConfig) {
        await this.load()
      }
      // Check if config existed before deletion
      const existedBefore = this._globalConfig!.parsedConfig.some(c => c.path === path && c.name)
      this._globalConfig!.set(path, value, append)
      // Track deletions - if it existed before and we're deleting it, mark it as deleted
      if (value == null && existedBefore) {
        this._deletedConfigs.add(path)
      } else {
        this._deletedConfigs.delete(path)
      }
      const configBuffer = serializeConfig(this._globalConfig!)
      await this.fs.write(this.globalConfigPath, configBuffer)
      await this.load()
    } else if (scope === 'system' && this.systemConfigPath) {
      if (!this._systemConfig) {
        await this.load()
      }
      // Check if config existed before deletion
      const existedBefore = this._systemConfig!.parsedConfig.some(c => c.path === path && c.name)
      this._systemConfig!.set(path, value, append)
      // Track deletions - if it existed before and we're deleting it, mark it as deleted
      if (value == null && existedBefore) {
        this._deletedConfigs.add(path)
      } else {
        this._deletedConfigs.delete(path)
      }
      const configBuffer = serializeConfig(this._systemConfig!)
      await this.fs.write(this.systemConfigPath, configBuffer)
      await this.load()
    } else {
      throw new Error(`Cannot set ${scope} config: path not provided`)
    }
  }

  /**
   * Appends a config value (for multi-valued configs)
   */
  async append(path: string, value: unknown, scope: 'local' | 'global' | 'system' = 'local'): Promise<void> {
    await this.set(path, value, scope, true)
  }

  /**
   * Gets all subsections for a section from merged config
   */
  async getSubsections(section: string): Promise<(string | null)[]> {
    if (!this._mergedConfig) {
      await this.load()
    }
    return this._mergedConfig!.getSubsections(section)
  }

  /**
   * Gets all sections from merged config
   */
  async getSections(): Promise<string[]> {
    if (!this._mergedConfig) {
      await this.load()
    }
    const sections = new Set<string>()
    if (this._mergedConfig!.parsedConfig) {
      for (const entry of this._mergedConfig!.parsedConfig) {
        if (entry.isSection && entry.section) {
          sections.add(entry.section)
        }
      }
    }
    return Array.from(sections)
  }

  /**
   * Reloads all config sources
   */
  async reload(): Promise<void> {
    this._worktreeConfig = null
    this._localConfig = null
    this._globalConfig = null
    this._systemConfig = null
    this._mergedConfig = null
    await this.load()
  }

  /**
   * Gets the raw merged config object (for advanced usage)
   */
  async getRawConfig(): Promise<ConfigObject> {
    if (!this._mergedConfig) {
      await this.load()
    }
    return this._mergedConfig!
  }
}

