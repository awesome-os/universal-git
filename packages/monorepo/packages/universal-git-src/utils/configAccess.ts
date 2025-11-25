import type { FileSystemProvider } from "../models/FileSystem.ts"
import { loadAllConfigs, loadLocalConfig, loadGlobalConfig, loadSystemConfig } from "../git/config/loader.ts"
import { mergeConfigs, getConfigDefault } from "../git/config/merge.ts"
import { serialize as serializeConfig } from "../core-utils/ConfigParser.ts"
import { join } from "../core-utils/GitPath.ts"

/**
 * Unified config access utility
 * Provides a simpler API using capability modules (git/config/loader.ts, git/config/merge.ts)
 * Replaces direct UnifiedConfigService usage
 */
export class ConfigAccess {
  private readonly fs: FileSystemProvider
  private readonly gitdir: string
  private readonly systemConfigPath?: string
  private readonly globalConfigPath?: string

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
   * Gets a single config value (returns first match from merged config)
   */
  async getConfigValue(path: string): Promise<unknown> {
    const { system, global, local, worktree } = await loadAllConfigs({
      fs: this.fs,
      gitdir: this.gitdir,
      systemConfigPath: this.systemConfigPath,
      globalConfigPath: this.globalConfigPath,
    })
    const merged = mergeConfigs(system, global, local, worktree)
    const result = merged.get(path)
    if (result === undefined) {
      return getConfigDefault(path, system, global, local)
    }
    return result
  }

  /**
   * Gets all config values for a path (from all scopes)
   */
  async getAllConfigValues(path: string): Promise<Array<{ value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }>> {
    const { system, global, local, worktree } = await loadAllConfigs({
      fs: this.fs,
      gitdir: this.gitdir,
      systemConfigPath: this.systemConfigPath,
      globalConfigPath: this.globalConfigPath,
    })
    
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

  /**
   * Sets a config value in the specified scope
   */
  async setConfigValue(
    path: string,
    value: unknown,
    scope: 'local' | 'global' | 'system' = 'local'
  ): Promise<void> {
    if (scope === 'local') {
      const localConfig = await loadLocalConfig(undefined, this.fs, this.gitdir)
      localConfig.set(path, value, false)
      const configBuffer = serializeConfig(localConfig)
      await this.fs.write(join(this.gitdir, 'config'), configBuffer)
    } else if (scope === 'global' && this.globalConfigPath) {
      const globalConfig = await loadGlobalConfig(this.fs, this.globalConfigPath)
      globalConfig.set(path, value, false)
      const configBuffer = serializeConfig(globalConfig)
      await this.fs.write(this.globalConfigPath, configBuffer)
    } else if (scope === 'system' && this.systemConfigPath) {
      const systemConfig = await loadSystemConfig(this.fs, this.systemConfigPath)
      systemConfig.set(path, value, false)
      const configBuffer = serializeConfig(systemConfig)
      await this.fs.write(this.systemConfigPath, configBuffer)
    } else {
      throw new Error(`Cannot set ${scope} config: path not provided`)
    }
  }

  /**
   * Appends a config value (for multi-valued configs)
   */
  async appendConfigValue(
    path: string,
    value: unknown,
    scope: 'local' | 'global' | 'system' = 'local'
  ): Promise<void> {
    if (scope === 'local') {
      const localConfig = await loadLocalConfig(undefined, this.fs, this.gitdir)
      localConfig.set(path, value, true)
      const configBuffer = serializeConfig(localConfig)
      await this.fs.write(join(this.gitdir, 'config'), configBuffer)
    } else if (scope === 'global' && this.globalConfigPath) {
      const globalConfig = await loadGlobalConfig(this.fs, this.globalConfigPath)
      globalConfig.set(path, value, true)
      const configBuffer = serializeConfig(globalConfig)
      await this.fs.write(this.globalConfigPath, configBuffer)
    } else if (scope === 'system' && this.systemConfigPath) {
      const systemConfig = await loadSystemConfig(this.fs, this.systemConfigPath)
      systemConfig.set(path, value, true)
      const configBuffer = serializeConfig(systemConfig)
      await this.fs.write(this.systemConfigPath, configBuffer)
    } else {
      throw new Error(`Cannot set ${scope} config: path not provided`)
    }
  }

  /**
   * Deletes a config value (sets to undefined)
   */
  async deleteConfigValue(path: string, scope: 'local' | 'global' | 'system' = 'local'): Promise<void> {
    await this.setConfigValue(path, undefined, scope)
  }

  /**
   * Gets all subsections for a section
   */
  async getSubsections(section: string): Promise<(string | null)[]> {
    const { system, global, local, worktree } = await loadAllConfigs({
      fs: this.fs,
      gitdir: this.gitdir,
      systemConfigPath: this.systemConfigPath,
      globalConfigPath: this.globalConfigPath,
    })
    const merged = mergeConfigs(system, global, local, worktree)
    return merged.getSubsections(section)
  }

  /**
   * Reloads config from all sources (no-op: configs are loaded fresh on each call)
   */
  async reload(): Promise<void> {
    // No-op: configs are loaded fresh on each call
    // This maintains backward compatibility
  }

  /**
   * Provides a config helper service similar to Repository.getConfig()
   * Each call returns a fresh helper that reads config from disk.
   */
  async getService(): Promise<{
    get(path: string): Promise<unknown>
    set(path: string, value: unknown, scope?: 'local' | 'global' | 'system', append?: boolean): Promise<void>
    getAll(path: string): Promise<Array<{ value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }>>
    getSubsections(section: string): Promise<(string | null)[]>
    getSections(): Promise<string[]>
    reload(): Promise<void>
  }> {
    const access = this
    const loadMerged = async () => {
      const { system, global, local, worktree } = await loadAllConfigs({
        gitBackend: undefined, // configAccess doesn't have backend access
        fs: this.fs,
        gitdir: this.gitdir,
        systemConfigPath: this.systemConfigPath,
        globalConfigPath: this.globalConfigPath,
      })
      return { system, global, local, worktree, merged: mergeConfigs(system, global, local, worktree) }
    }

    return {
      async get(path: string): Promise<unknown> {
        const { system, global, local, merged } = await loadMerged()
        const result = merged.get(path)
        if (result === undefined) {
          return getConfigDefault(path, system, global, local)
        }
        return result
      },

      async set(path: string, value: unknown, scope: 'local' | 'global' | 'system' = 'local', append = false): Promise<void> {
        if (append) {
          await access.appendConfigValue(path, value, scope)
          return
        }
        if (value == null) {
          await access.deleteConfigValue(path, scope)
          return
        }
        await access.setConfigValue(path, value, scope)
      },

      async getAll(path: string): Promise<Array<{ value: unknown; scope: 'system' | 'global' | 'local' | 'worktree' }>> {
        return access.getAllConfigValues(path)
      },

      async getSubsections(section: string): Promise<(string | null)[]> {
        return access.getSubsections(section)
      },

      async getSections(): Promise<string[]> {
        const { merged } = await loadMerged()
        const sections = new Set<string>()
        if ((merged as any).parsedConfig) {
          for (const entry of (merged as any).parsedConfig) {
            if (entry.isSection && entry.section) {
              sections.add(entry.section)
            }
          }
        }
        return Array.from(sections)
      },

      async reload(): Promise<void> {
        // No-op: configs are loaded fresh on each call
      },
    }
  }
}

/**
 * Convenience function to get a config value
 */
export async function getConfigValue(
  fs: FileSystemProvider,
  gitdir: string,
  path: string,
  systemConfigPath?: string,
  globalConfigPath?: string
): Promise<unknown> {
  const access = new ConfigAccess(fs, gitdir, systemConfigPath, globalConfigPath)
  return access.getConfigValue(path)
}

/**
 * Convenience function to set a config value
 */
export async function setConfigValue(
  fs: FileSystemProvider,
  gitdir: string,
  path: string,
  value: unknown,
  scope: 'local' | 'global' | 'system' = 'local',
  systemConfigPath?: string,
  globalConfigPath?: string
): Promise<void> {
  const access = new ConfigAccess(fs, gitdir, systemConfigPath, globalConfigPath)
  await access.setConfigValue(path, value, scope)
}

