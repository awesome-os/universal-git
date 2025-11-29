import type { Repository } from './Repository.ts'
import type { ProgressCallback } from '../git/remote/types.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'

/**
 * Gets a remote backend for a configured remote name.
 */
export async function getRemote(
  this: Repository,
  name: string,
  options?: {
    http?: import('../git/remote/types.ts').HttpClient
    ssh?: import('../ssh/SshClient.ts').SshClient
    tcp?: import('../daemon/TcpClient.ts').TcpClient
    fs?: FileSystemProvider
    auth?: import('../git/forge/types.ts').ForgeAuth
    useRestApi?: boolean
    urlOnly?: boolean
  }
): Promise<import('../git/remote/GitRemoteBackend.ts').GitRemoteBackend> {
  const repo = this as any
  
  // Check cache first
  if (repo._remoteBackends.has(name)) {
    return repo._remoteBackends.get(name)!
  }
  
  // Read remote URL from config
  const config = await this.getConfig()
  const url = await config.get(`remote.${name}.url`) as string | undefined
  if (!url) {
    const { NotFoundError } = await import('../errors/NotFoundError.ts')
    throw new NotFoundError(`Remote '${name}' not found`)
  }
  
  // Create backend using RemoteBackendRegistry
  const { RemoteBackendRegistry } = await import('../git/remote/RemoteBackendRegistry.ts')
  const backend = RemoteBackendRegistry.getBackend({
    url,
    http: options?.http,
    ssh: options?.ssh,
    tcp: options?.tcp,
    fs: options?.fs || this.fs,
    auth: options?.auth,
    useRestApi: options?.useRestApi,
    urlOnly: options?.urlOnly,
  })
  
  // Cache backend
  repo._remoteBackends.set(name, backend)
  return backend
}

/**
 * Lists all configured remotes with their backend instances from the remote registry.
 */
export async function listRemotes(this: Repository): Promise<Array<{ name: string; backend: import('../git/remote/GitRemoteBackend.ts').GitRemoteBackend }>> {
  const config = await this.getConfig()
  const remoteNames = await config.getSubsections('remote')
  const remotes = await Promise.all(
    remoteNames.map(async name => ({
      name: name!,
      backend: await this.getRemote(name!, { urlOnly: true }),
    }))
  )
  return remotes
}

/**
 * Invalidates the remote backend cache
 */
export function invalidateRemoteCache(this: Repository): void {
  const repo = this as any
  repo._remoteBackends.clear()
}

/**
 * Fetch from a remote
 */
export async function fetch(
  this: Repository,
  remote: string = 'origin',
  options: {
    ref?: string
    depth?: number
    since?: Date
    exclude?: string[]
    relative?: boolean
    tags?: boolean
    singleBranch?: boolean
    onProgress?: ProgressCallback
    http?: import('../git/remote/types.ts').HttpClient
    ssh?: import('../ssh/SshClient.ts').SshClient
    tcp?: import('../daemon/TcpClient.ts').TcpClient
  } = {}
): Promise<void> {
  const { fetch: _fetch } = await import('../commands/fetch.ts')
  const gitdir = await this.getGitdir()
  return _fetch({
    repo: this,
    fs: this.fs,
    gitdir,
    cache: this.cache,
    remote,
    ...options,
  })
}

/**
 * Push to a remote
 */
export async function push(
  this: Repository,
  remote: string = 'origin',
  ref?: string,
  options: {
    force?: boolean
    onProgress?: ProgressCallback
    http?: import('../git/remote/types.ts').HttpClient
    ssh?: import('../ssh/SshClient.ts').SshClient
    tcp?: import('../daemon/TcpClient.ts').TcpClient
    includeSubmodules?: boolean
    submoduleRecurse?: boolean
  } = {}
): Promise<import('../commands/push.ts').PushResult> {
  const { push: _push } = await import('../commands/push.ts')
  const gitdir = await this.getGitdir()
  return _push({
    repo: this,
    fs: this.fs,
    gitdir,
    cache: this.cache,
    remote,
    ref,
    ...options,
  })
}

/**
 * Pull from a remote (fetch + merge)
 */
export async function pull(
  this: Repository,
  remote: string = 'origin',
  ref?: string,
  options: {
    fastForward?: boolean
    fastForwardOnly?: boolean
    onProgress?: ProgressCallback
    http?: import('../git/remote/types.ts').HttpClient
    ssh?: import('../ssh/SshClient.ts').SshClient
    tcp?: import('../daemon/TcpClient.ts').TcpClient
  } = {}
): Promise<import('../commands/pull.ts').PullResult> {
  const repo = this as any
  if (!this.fs) {
    throw new Error('Cannot pull: filesystem is required. Checkout to a WorktreeBackend first.')
  }
  // isBare() is async
  // Since we are extracting methods, we can't assume isBare is available on 'this' if not bound properly
  // But we will bind it in Repository.ts. However, we might want to use gitBackend.isBare logic directly or call the method.
  // Repository.ts will have isBare() method.
  // For now, assume isBare() exists.
  
  // Use gitBackend check directly to avoid circular dependency on isBare if it's in another file
  // Or just call this.isBare() assuming it will be there.
  // Let's implement a quick check using private props if possible, or trust the method.
  // The 'this' context is Repository, so this.isBare() should work if defined.
  
  // Note: pull needs worktreeBackend
  if (!repo._worktreeBackend) {
    throw new Error('Cannot pull: worktreeBackend is required. Checkout to a WorktreeBackend first.')
  }
  
  const { pull: _pull } = await import('../commands/pull.ts')
  const gitdir = await this.getGitdir()
  
  // worktreeBackend is a black box - pass repo directly to pull command
  return _pull({
    repo: this,
    fs: this.fs,
    dir: repo._dir || undefined, // legacy dir support
    gitdir,
    cache: this.cache,
    remote,
    ref,
    ...options,
  })
}


