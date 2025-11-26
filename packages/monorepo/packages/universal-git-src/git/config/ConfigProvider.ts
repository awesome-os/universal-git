import type { ConfigObject } from '../../core-utils/ConfigParser.ts'
import { parse as parseConfig, serialize as serializeConfig } from '../../core-utils/ConfigParser.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * ConfigProvider - Abstract interface for managing all Git config (system, global, local, worktree)
 * 
 * This interface abstracts all config management, allowing implementations to use
 * filesystem, in-memory storage, or other mechanisms.
 * 
 * The ConfigProvider is responsible for:
 * - Loading all config sources (system, global, local, worktree)
 * - Merging configs according to Git's precedence rules
 * - Providing unified get/set operations
 */
export interface ConfigProvider {
  /**
   * Get a config value (merged from all sources)
   * @param path - Config path (e.g., 'core.filemode')
   * @returns Config value or undefined if not found
   */
  get(path: string): Promise<unknown>

  /**
   * Set a config value
   * @param path - Config path (e.g., 'core.filemode')
   * @param value - Config value
   * @param scope - Config scope: 'local' (repository), 'global' (user), 'system' (system-wide), or 'worktree' (worktree-specific)
   * @param append - Whether to append to existing values (default: false)
   */
  set(path: string, value: unknown, scope?: 'local' | 'global' | 'system' | 'worktree', append?: boolean): Promise<void>

  /**
   * Get all values for a config path from all scopes
   * @param path - Config path (e.g., 'user.name')
   * @returns Array of values with their scopes
   */
  getAll(path: string): Promise<Array<{ value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }>>

  /**
   * Get all subsections for a section
   * @param section - Section name (e.g., 'remote')
   * @returns Array of subsection names
   */
  getSubsections(section: string): Promise<(string | null)[]>

  /**
   * Get all section names
   * @returns Array of section names
   */
  getSections(): Promise<string[]>

  /**
   * Reload all configs (no-op for static providers, but may reload from filesystem for others)
   */
  reload(): Promise<void>
}

/**
 * StaticConfigProvider - Implementation that handles all config sources
 * 
 * This implementation:
 * - Stores system and global config as static data provided in the constructor
 * - Loads local config from GitBackend
 * - Loads worktree config from filesystem (if in a worktree)
 * - Merges all configs according to Git's precedence rules
 * 
 * For now, system and global config are static. Future implementations could:
 * - Persist to filesystem (FilesystemConfigProvider)
 * - Store in database (DatabaseConfigProvider)
 * - Use environment variables (EnvConfigProvider)
 */
export class StaticConfigProvider implements ConfigProvider {
  private systemConfig: ConfigObject
  private globalConfig: ConfigObject
  private readonly gitBackend?: import('../../backends/GitBackend.ts').GitBackend
  private readonly worktreeBackend?: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
  private readonly fs?: import('../../models/FileSystem.ts').FileSystemProvider
  private readonly gitdir?: string

  constructor(
    systemConfig?: ConfigObject | UniversalBuffer | string,
    globalConfig?: ConfigObject | UniversalBuffer | string,
    gitBackend?: import('../../backends/GitBackend.ts').GitBackend,
    worktreeBackend?: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
    fs?: import('../../models/FileSystem.ts').FileSystemProvider,
    gitdir?: string
  ) {
    // Parse system config
    if (systemConfig === undefined) {
      this.systemConfig = parseConfig(UniversalBuffer.alloc(0))
    } else if (systemConfig instanceof UniversalBuffer || typeof systemConfig === 'string') {
      this.systemConfig = parseConfig(
        systemConfig instanceof UniversalBuffer
          ? systemConfig
          : UniversalBuffer.from(systemConfig, 'utf8')
      )
    } else {
      this.systemConfig = systemConfig
    }

    // Parse global config
    if (globalConfig === undefined) {
      this.globalConfig = parseConfig(UniversalBuffer.alloc(0))
    } else if (globalConfig instanceof UniversalBuffer || typeof globalConfig === 'string') {
      this.globalConfig = parseConfig(
        globalConfig instanceof UniversalBuffer
          ? globalConfig
          : UniversalBuffer.from(globalConfig, 'utf8')
      )
    } else {
      this.globalConfig = globalConfig
    }

    this.gitBackend = gitBackend
    this.worktreeBackend = worktreeBackend
    this.fs = fs
    this.gitdir = gitdir
  }

  /**
   * Load all config sources and merge them
   */
  private async loadMerged(): Promise<{
    system: ConfigObject
    global: ConfigObject
    local: ConfigObject
    worktree: ConfigObject
    merged: ConfigObject
  }> {
    const { loadLocalConfig } = await import('./loader.ts')
    const { mergeConfigs } = await import('./merge.ts')

    // Load local config from backend (preferred) or fs (backward compatibility)
    const local = await loadLocalConfig(this.gitBackend, this.fs, this.gitdir)

    // Load worktree config from worktree backend (preferred) or fs (backward compatibility)
    let worktree: ConfigObject
    if (this.worktreeBackend && this.gitdir) {
      // Use worktree backend (preferred)
      const worktreeConfig = await this.worktreeBackend.readWorktreeConfig(this.gitdir)
      worktree = worktreeConfig || parseConfig(UniversalBuffer.alloc(0))
    } else if (this.fs && this.gitdir) {
      // Fallback to direct filesystem access (backward compatibility)
      const { loadWorktreeConfig } = await import('./loader.ts')
      worktree = await loadWorktreeConfig(this.fs, this.gitdir) || parseConfig(UniversalBuffer.alloc(0))
    } else {
      worktree = parseConfig(UniversalBuffer.alloc(0))
    }

    // Merge all configs (system < global < local < worktree)
    const merged = mergeConfigs(this.systemConfig, this.globalConfig, local, worktree)

    return {
      system: this.systemConfig,
      global: this.globalConfig,
      local,
      worktree,
      merged,
    }
  }

  async get(path: string): Promise<unknown> {
    const { system, global, local, merged } = await this.loadMerged()
    const { getConfigDefault } = await import('./merge.ts')
    const result = merged.get(path)
    if (result === undefined) {
      return getConfigDefault(path, system, global, local)
    }
    return result
  }

  async set(path: string, value: unknown, scope: 'local' | 'global' | 'system' | 'worktree' = 'local', append = false): Promise<void> {
    if (scope === 'local') {
      // Read current local config from backend
      const { loadLocalConfig } = await import('./loader.ts')
      let localConfig: ConfigObject
      if (this.gitBackend) {
        try {
          const configBuffer = await this.gitBackend.readConfig()
          localConfig = parseConfig(configBuffer)
        } catch {
          // Config doesn't exist yet - create empty config
          localConfig = parseConfig(UniversalBuffer.alloc(0))
        }
      } else if (this.fs && this.gitdir) {
        // Fallback to fs-based read (backward compatibility)
        localConfig = await loadLocalConfig(undefined, this.fs, this.gitdir)
      } else {
        throw new Error('Cannot set local config: no gitBackend or fs/gitdir available')
      }

      localConfig.set(path, value, append)
      const configBuffer = serializeConfig(localConfig)

      // Write back to backend or fs
      if (this.gitBackend) {
        await this.gitBackend.writeConfig(configBuffer)
      } else if (this.fs && this.gitdir) {
        const { join } = await import('../../core-utils/GitPath.ts')
        await this.fs.write(join(this.gitdir, 'config'), configBuffer)
      } else {
        throw new Error('Cannot set local config: no gitBackend or fs/gitdir available')
      }
    } else if (scope === 'global') {
      this.globalConfig.set(path, value, append)
    } else if (scope === 'system') {
      this.systemConfig.set(path, value, append)
    } else if (scope === 'worktree') {
      if (!this.gitdir) {
        throw new Error('Cannot set worktree config: gitdir is required')
      }
      if (!this.worktreeBackend) {
        throw new Error('Cannot set worktree config: worktreeBackend is required')
      }
      // Use worktree backend (required for worktree config)
      const existingConfig = await this.worktreeBackend.readWorktreeConfig(this.gitdir)
      const worktreeConfig = existingConfig || parseConfig(UniversalBuffer.alloc(0))
      worktreeConfig.set(path, value, append)
      await this.worktreeBackend.writeWorktreeConfig(this.gitdir, worktreeConfig)
    } else {
      throw new Error(`Invalid config scope: ${scope}`)
    }
  }

  async getAll(path: string): Promise<Array<{ value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }>> {
    const { system, global, local, worktree } = await this.loadMerged()
    const results: Array<{ value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }> = []

    const systemValues = system.getall(path) || []
    for (const value of systemValues) {
      if (value !== undefined) results.push({ value, scope: 'system' })
    }

    const globalValues = global.getall(path) || []
    for (const value of globalValues) {
      if (value !== undefined) results.push({ value, scope: 'global' })
    }

    const localValues = local.getall(path) || []
    for (const value of localValues) {
      if (value !== undefined) results.push({ value, scope: 'local' })
    }

    const worktreeValues = worktree.getall(path) || []
    for (const value of worktreeValues) {
      if (value !== undefined) results.push({ value, scope: 'worktree' })
    }

    return results
  }

  async getSubsections(section: string): Promise<(string | null)[]> {
    const { merged } = await this.loadMerged()
    return merged.getSubsections(section)
  }

  async getSections(): Promise<string[]> {
    const { merged } = await this.loadMerged()
    const sections = new Set<string>()
    if (merged.parsedConfig) {
      for (const entry of merged.parsedConfig) {
        if (entry.isSection && entry.section) {
          sections.add(entry.section)
        }
      }
    }
    return Array.from(sections)
  }

  async reload(): Promise<void> {
    // No-op: configs are loaded fresh on each call
    // This maintains backward compatibility with code that calls reload()
  }
}

