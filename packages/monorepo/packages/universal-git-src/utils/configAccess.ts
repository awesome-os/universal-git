import { UnifiedConfigService } from "../core-utils/UnifiedConfigService.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Unified config access utility
 * Provides a simpler API around UnifiedConfigService
 * Replaces direct _getConfig() calls and GitConfigManager usage
 */
export class ConfigAccess {
  private _service: UnifiedConfigService | null = null
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
   * Gets the UnifiedConfigService instance, loading configs if needed
   * CRITICAL: Always reload to ensure we have the latest config changes from disk
   * This is necessary because setConfig() writes to disk, and we need to read the latest state
   */
  async getService(): Promise<UnifiedConfigService> {
    if (!this._service) {
      this._service = new UnifiedConfigService(this.fs, this.gitdir, this.systemConfigPath, this.globalConfigPath)
    }
    // Always reload to ensure we have the latest config from disk
    // This is critical because setConfig() may have written changes after this instance was created
    await this._service.reload()
    return this._service
  }

  /**
   * Gets a single config value (returns first match from merged config)
   */
  async getConfigValue(path: string): Promise<unknown> {
    const service = await this.getService()
    return service.get(path)
  }

  /**
   * Gets all config values for a path (from all scopes)
   */
  async getAllConfigValues(path: string): Promise<Array<{ value: unknown; scope: 'system' | 'global' | 'local' }>> {
    const service = await this.getService()
    return service.getAll(path)
  }

  /**
   * Sets a config value in the specified scope
   */
  async setConfigValue(
    path: string,
    value: unknown,
    scope: 'local' | 'global' | 'system' = 'local'
  ): Promise<void> {
    const service = await this.getService()
    await service.set(path, value, scope, false)
  }

  /**
   * Appends a config value (for multi-valued configs)
   */
  async appendConfigValue(
    path: string,
    value: unknown,
    scope: 'local' | 'global' | 'system' = 'local'
  ): Promise<void> {
    const service = await this.getService()
    await service.append(path, value, scope)
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
    const service = await this.getService()
    return service.getSubsections(section)
  }

  /**
   * Reloads config from all sources
   */
  async reload(): Promise<void> {
    if (this._service) {
      await this._service.load()
    } else {
      await this.getService()
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

