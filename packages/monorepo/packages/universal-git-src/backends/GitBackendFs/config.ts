import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Config operations for GitBackendFs
 */

let _configProvider: import('../../git/config/LocalConfigProvider.ts').LocalConfigProvider | null = null

/**
 * Get or create LocalConfigProvider (lazy initialization)
 */
async function getConfigProvider(this: GitBackendFs): Promise<import('../../git/config/LocalConfigProvider.ts').LocalConfigProvider> {
  if (!_configProvider) {
    const { LocalConfigProvider } = await import('../../git/config/LocalConfigProvider.ts')
    _configProvider = new LocalConfigProvider(this)
  }
  return _configProvider
}

export async function getConfig(this: GitBackendFs, path: string): Promise<unknown> {
  const configProvider = await getConfigProvider.call(this)
  return configProvider.get(path)
}

/**
 * Set a config value (only local config is supported)
 * Note: 'worktree' scope is handled by WorktreeBackend, not GitBackend
 */
export async function setConfig(
  this: GitBackendFs,
  path: string,
  value: unknown,
  scope?: 'local' | 'global' | 'system',
  append?: boolean
): Promise<void> {
  const configProvider = await getConfigProvider.call(this)
  return configProvider.set(path, value, scope, append)
}

/**
 * Get all values for a config path (only from local config)
 */
export async function getAllConfig(this: GitBackendFs, path: string): Promise<Array<{ value: unknown; scope: 'local' }>> {
  const configProvider = await getConfigProvider.call(this)
  return configProvider.getAll(path)
}

/**
 * Get all subsections for a section
 */
export async function getConfigSubsections(this: GitBackendFs, section: string): Promise<(string | null)[]> {
  const configProvider = await getConfigProvider.call(this)
  return configProvider.getSubsections(section)
}

/**
 * Get all section names
 */
export async function getConfigSections(this: GitBackendFs): Promise<string[]> {
  const configProvider = await getConfigProvider.call(this)
  return configProvider.getSections()
}

/**
 * Reload config (re-reads from filesystem/storage)
 */
export async function reloadConfig(this: GitBackendFs): Promise<void> {
  const configProvider = await getConfigProvider.call(this)
  return configProvider.reload()
}

