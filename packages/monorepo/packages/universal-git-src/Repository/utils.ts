import type { Repository } from './Repository.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'

/**
 * Detects system and global git config paths
 */
export async function detectConfigPaths(
  fs: FileSystemProvider,
  env?: Record<string, string>
): Promise<{ systemConfigPath?: string; globalConfigPath?: string }> {
  const { discoverConfigPaths } = await import('../git/config/discover.ts')
  return discoverConfigPaths(fs, env)
}

/**
 * Analyze the changes needed to checkout a commit
 */
export async function analyzeCheckout(
  this: Repository,
  params: {
    ref?: string
    force?: boolean
    sparsePatterns?: string[]
    filepaths?: string[]
  }
): Promise<Array<['create' | 'update' | 'delete' | 'delete-index' | 'mkdir' | 'conflict' | 'keep', string, ...unknown[]]>> {
  const repo = this as any
  const gitdir = await this.getGitdir()
  const { WorkdirManager } = await import('../git/worktree/WorkdirManager.ts')
  
  // Ensure index is synchronized before analysis
  const { GitIndex } = await import('../git/index/GitIndex.ts')
  const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
  
  let index: GitIndex
  if (repo._gitBackend) {
    let indexBuffer: UniversalBuffer
    try {
      indexBuffer = await repo._gitBackend.readIndex()
    } catch {
      indexBuffer = UniversalBuffer.alloc(0)
    }
    
    if (indexBuffer.length === 0) {
      index = new GitIndex()
    } else {
      const objectFormat = await this.getObjectFormat()
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
  } else {
    // Fallback to fs if no backend (shouldn't happen, but handle gracefully)
    const { readIndex } = await import('../git/index/readIndex.ts')
    index = await readIndex({ fs: repo._fs!, gitdir })
  }
  
  // Ensure dir is defined for analyzeCheckout
  // analyzeCheckout currently requires dir string. 
  // If worktreeBackend is present, we try to get dir from it or use repo._dir.
  let dir = repo._dir
  if (!dir && repo._worktreeBackend && repo._worktreeBackend.getDirectory) {
    dir = repo._worktreeBackend.getDirectory()
  }
  
  if (!dir) {
    throw new Error('Repository dir is required for analyzeCheckout')
  }
  return await WorkdirManager.analyzeCheckout({
    fs: this.fs,
    dir: dir,
    gitdir,
    cache: this.cache,
    index,
    ...params,
  })
}


