import type {
  RemoteConnectOptions,
  RemoteConnection,
  RemoteDiscoverOptions,
  RemoteDiscoverResult,
} from './types.ts'
import type {
  PullRequest,
  CreatePROptions,
  ListPROptions,
  Issue,
  CreateIssueOptions,
  ListIssuesOptions,
  Release,
  CreateReleaseOptions,
} from '../forge/types.ts'

/**
 * Interface for Git remote backends that handle communication with remote Git repositories.
 * 
 * Each backend represents a specific protocol (HTTP, SSH, Git daemon, etc.) and provides
 * methods for discovering remote references and connecting for fetch/push operations.
 * 
 * Backends are created by the `RemoteBackendRegistry` based on the remote URL protocol.
 * They can be created in two modes:
 * - **Full mode**: Requires protocol-specific clients (http, ssh, tcp) for actual operations
 * - **URL-only mode**: Can be created without clients when only the URL is needed (e.g., for `listRemotes`)
 * 
 * @example
 * ```typescript
 * // Get a remote backend from Repository
 * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
 * const originBackend = await repo.getRemote('origin', { urlOnly: true })
 * 
 * // Get the URL without requiring clients
 * const url = originBackend.getUrl() // 'https://github.com/user/repo.git'
 * 
 * // For actual operations, provide clients
 * const originBackendWithClient = await repo.getRemote('origin', { http: httpClient })
 * const refs = await originBackendWithClient.discover({ service: 'git-upload-pack', url })
 * ```
 */
export interface GitRemoteBackend {
  /** The name of the backend protocol (e.g., 'http', 'ssh', 'tcp') */
  readonly name: string
  
  /** The base URL for this remote backend (typically the full remote URL) */
  readonly baseUrl: string

  /**
   * Returns the full URL for this remote backend.
   * 
   * This method provides a consistent way to retrieve the remote URL from any backend instance,
   * regardless of the protocol. The URL is the same as `baseUrl` but accessed through this method
   * for consistency and potential future extensibility.
   * 
   * This is particularly useful for commands like `listRemotes` that need to display remote URLs
   * without requiring protocol-specific clients to be provided.
   * 
   * @returns The full remote URL as configured in `.git/config` (e.g., 'https://github.com/user/repo.git', 'git@github.com:user/repo.git')
   * 
   * @example
   * ```typescript
   * const repo = await Repository.open({ fs, dir: '/path/to/repo' })
   * const remotes = await repo.listRemotes()
   * for (const { name, backend } of remotes) {
   *   console.log(`${name}: ${backend.getUrl()}`)
   * }
   * ```
   */
  getUrl(): string

  discover(options: RemoteDiscoverOptions): Promise<RemoteDiscoverResult>
  connect(options: RemoteConnectOptions): Promise<RemoteConnection>

  supportsRestApi(): boolean

  createPullRequest?(
    owner: string,
    repo: string,
    options: CreatePROptions
  ): Promise<PullRequest>
  listPullRequests?(
    owner: string,
    repo: string,
    options?: ListPROptions
  ): Promise<PullRequest[]>
  createIssue?(
    owner: string,
    repo: string,
    options: CreateIssueOptions
  ): Promise<Issue>
  listIssues?(
    owner: string,
    repo: string,
    options?: ListIssuesOptions
  ): Promise<Issue[]>
  createRelease?(
    owner: string,
    repo: string,
    options: CreateReleaseOptions
  ): Promise<Release>
}


