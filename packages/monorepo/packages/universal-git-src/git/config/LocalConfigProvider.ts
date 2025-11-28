import type { ConfigObject } from '../../core-utils/ConfigParser.ts'
import { parse as parseConfig, serialize as serializeConfig } from '../../core-utils/ConfigParser.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { GitBackend } from '../../backends/GitBackend.ts'

/**
 * Default config values (like git does)
 * These are used when a config value is not found in the local config file
 */
const DEFAULT_CONFIG: Record<string, unknown> = {
  'core.filemode': 'false',
  'core.symlinks': 'false',
  'core.ignorecase': 'true',
  'init.defaultBranch': 'master',
  'core.repositoryformatversion': '0',
  'core.bare': 'false',
  'core.logallrefupdates': 'true',
}

/**
 * LocalConfigProvider - Simple config provider that only handles local config
 * 
 * This implementation:
 * - Only reads/writes local config from GitBackend (gitdir/config)
 * - Provides default values when config is missing (like git does)
 * - Is mutable - config can be changed without recreating Repository
 * - No system/global config support
 */
export class LocalConfigProvider {
  private readonly gitBackend: GitBackend
  private _localConfig: ConfigObject | null = null
  private _configLoaded = false

  constructor(gitBackend: GitBackend) {
    this.gitBackend = gitBackend
  }

  /**
   * Load local config from GitBackend (lazy loading)
   */
  private async _loadConfig(): Promise<ConfigObject> {
    if (this._configLoaded && this._localConfig !== null) {
      return this._localConfig
    }

    try {
      const configBuffer = await this.gitBackend.readConfig()
      if (configBuffer.length === 0) {
        this._localConfig = parseConfig(UniversalBuffer.alloc(0))
      } else {
        this._localConfig = parseConfig(configBuffer)
      }
    } catch {
      // Config doesn't exist or can't be read - use empty config
      this._localConfig = parseConfig(UniversalBuffer.alloc(0))
    }
    
    this._configLoaded = true
    return this._localConfig
  }

  /**
   * Save local config to GitBackend
   */
  private async _saveConfig(): Promise<void> {
    if (this._localConfig === null) {
      await this._loadConfig()
    }
    
    const serialized = serializeConfig(this._localConfig!)
    await this.gitBackend.writeConfig(serialized)
  }

  /**
   * Get a config value (from local config, with defaults)
   * @param path - Config path (e.g., 'core.filemode')
   * @returns Config value or default value if not found
   */
  async get(path: string): Promise<unknown> {
    const config = await this._loadConfig()
    const value = config.get(path)
    
    // If not found in local config (undefined, null, or empty string), return default
    if (value === undefined || value === null || value === '') {
      const defaultValue = DEFAULT_CONFIG[path]
      // Only return default if one exists, otherwise return undefined
      return defaultValue !== undefined ? defaultValue : undefined
    }
    
    return value
  }

  /**
   * Set a config value (only local config is supported)
   * @param path - Config path (e.g., 'core.filemode')
   * @param value - Config value
   * @param scope - Must be 'local' or undefined (other scopes are ignored)
   * @param append - Whether to append to existing values (default: false)
   */
  async set(path: string, value: unknown, scope?: 'local' | 'global' | 'system' | 'worktree', append?: boolean): Promise<void> {
    // Only support local config
    if (scope && scope !== 'local') {
      throw new Error(`Only 'local' config scope is supported. Got: ${scope}`)
    }

    const config = await this._loadConfig()
    
    if (append) {
      // Append to existing values
      const existing = config.getall(path) || []
      const newValue = Array.isArray(value) ? value : [value]
      // For append, we need to set each value individually
      for (const val of newValue) {
        config.set(path, val, true) // true = append
      }
    } else {
      // Set single value
      config.set(path, value)
    }
    
    await this._saveConfig()
  }

  /**
   * Get all values for a config path (only from local config)
   * @param path - Config path (e.g., 'user.name')
   * @returns Array of values with scope 'local'
   */
  async getAll(path: string): Promise<Array<{ value: unknown; scope: 'local' }>> {
    const config = await this._loadConfig()
    const values = config.getall(path) || []
    
    return values.map(value => ({ value, scope: 'local' as const }))
  }

  /**
   * Get all subsections for a section
   * @param section - Section name (e.g., 'remote')
   * @returns Array of subsection names
   */
  async getSubsections(section: string): Promise<(string | null)[]> {
    const config = await this._loadConfig()
    return config.getSubsections(section) || []
  }

  /**
   * Get all section names
   * @returns Array of section names
   */
  async getSections(): Promise<string[]> {
    const config = await this._loadConfig()
    // Extract unique section names from parsedConfig
    const sections = new Set<string>()
    for (const entry of config.parsedConfig) {
      if (entry.section) {
        sections.add(entry.section)
      }
    }
    return Array.from(sections)
  }

  /**
   * Reload config from GitBackend (clears cache and re-reads)
   */
  async reload(): Promise<void> {
    this._configLoaded = false
    this._localConfig = null
    await this._loadConfig()
  }
}

