import type { Repository } from './Repository.ts'

/**
 * Gets the unified configuration service
 * Merges configs from GitBackend (system/global/local) and WorktreeBackend (worktree)
 */
export async function getConfig(this: Repository): Promise<{
  get(path: string): Promise<unknown>
  set(path: string, value: unknown, scope?: 'local' | 'global' | 'system' | 'worktree', append?: boolean): Promise<void>
  getAll(path: string): Promise<Array<{ value: unknown; scope: 'local' | 'worktree' }>>
  getSubsections(section: string): Promise<(string | null)[]>
  getSections(): Promise<string[]>
  reload(): Promise<void>
}> {
  const repo = this as any
  
  return {
    // Get config value - merge from GitBackend (local) and WorktreeBackend (worktree takes precedence)
    get: async (path: string) => {
      // First try worktree config (highest precedence)
      if (repo._worktreeBackend) {
        const worktreeValue = await repo._gitBackend.getWorktreeConfig(repo._worktreeBackend, path)
        if (worktreeValue !== undefined) {
          return worktreeValue
        }
      }
      
      // Then try local/global/system config
      return await repo._gitBackend.getConfig(path)
    },
    
    // Set config value
    set: async (path: string, value: unknown, scope?: 'local' | 'global' | 'system' | 'worktree', append?: boolean) => {
      if (scope === 'worktree') {
        if (!repo._worktreeBackend) {
          throw new Error('Cannot set worktree config: no worktree backend available')
        }
        return await repo._gitBackend.setWorktreeConfig(repo._worktreeBackend, path, value, append)
      }
      
      // Default to local config if scope not specified or local/global/system
      return await repo._gitBackend.setConfig(path, value, scope || 'local', append)
    },
    
    // Get all values
    getAll: async (path: string) => {
      const result: Array<{ value: unknown; scope: 'local' | 'worktree' }> = []
      
      // Get worktree values
      if (repo._worktreeBackend) {
        const worktreeValues = await repo._gitBackend.getAllWorktreeConfig(repo._worktreeBackend, path)
        result.push(...worktreeValues)
      }
      
      // Get local values
      const localValues = await repo._gitBackend.getAllConfig(path)
      result.push(...localValues)
      
      return result
    },
    
    // Get subsections
    getSubsections: async (section: string) => {
      const subsections = new Set<string | null>()
      
      // Get from worktree config
      if (repo._worktreeBackend) {
        const worktreeSubsections = await repo._gitBackend.getWorktreeConfigSubsections(repo._worktreeBackend, section)
        worktreeSubsections.forEach(s => subsections.add(s))
      }
      
      // Get from local config
      const localSubsections = await repo._gitBackend.getConfigSubsections(section)
      localSubsections.forEach(s => subsections.add(s))
      
      return Array.from(subsections)
    },
    
    // Get sections
    getSections: async () => {
      const sections = new Set<string>()
      
      // Get from worktree config
      if (repo._worktreeBackend) {
        const worktreeSections = await repo._gitBackend.getWorktreeConfigSections(repo._worktreeBackend)
        worktreeSections.forEach(s => sections.add(s))
      }
      
      // Get from local config
      const localSections = await repo._gitBackend.getConfigSections()
      localSections.forEach(s => sections.add(s))
      
      return Array.from(sections)
    },
    
    // Reload config
    reload: async () => {
      if (repo._worktreeBackend) {
        await repo._gitBackend.reloadWorktreeConfig(repo._worktreeBackend)
      }
      await repo._gitBackend.reloadConfig()
    }
  }
}

