import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Walker creation for GitBackendFs
 */

export async function createTreeWalker(this: GitBackendFs, ref: string = 'HEAD', cache: Record<string, unknown> = {}): Promise<import('../../models/GitWalkerRepo.ts').GitWalkerRepo> {
  const { GitWalkerRepo } = await import('../../models/GitWalkerRepo.ts')
  return new GitWalkerRepo({ gitBackend: this, ref, cache })
}

export async function createIndexWalker(this: GitBackendFs, cache: Record<string, unknown> = {}): Promise<import('../../models/GitWalkerIndex.ts').GitWalkerIndex> {
  const { GitWalkerIndex } = await import('../../models/GitWalkerIndex.ts')
  return new GitWalkerIndex({ gitBackend: this, cache })
}

