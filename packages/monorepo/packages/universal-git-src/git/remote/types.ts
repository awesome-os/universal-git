import type { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type {
  PullRequest,
  CreatePROptions,
  ListPROptions,
  Issue,
  CreateIssueOptions,
  ListIssuesOptions,
  Release,
  CreateReleaseOptions,
  ForgeAuth,
} from '../forge/types.ts'

export type GitProgressEvent = {
  phase: string
  loaded: number
  total: number
}

export type ProgressCallback = (
  progress: GitProgressEvent
) => void | Promise<void>

export type GitHttpRequest = {
  url: string
  method?: string
  headers?: Record<string, string>
  agent?: unknown
  body?: AsyncIterableIterator<Uint8Array>
  onProgress?: ProgressCallback
  signal?: unknown
}

export type GitHttpResponse = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: AsyncIterableIterator<Uint8Array>
  statusCode: number
  statusMessage: string
}

export type HttpFetch = (request: GitHttpRequest) => Promise<GitHttpResponse>

export type HttpClient = {
  request: HttpFetch
}

export type GitAuth = {
  username?: string
  password?: string
  headers?: Record<string, string>
  cancel?: boolean
}

export type AuthCallback = (
  url: string,
  auth: GitAuth
) => GitAuth | void | Promise<GitAuth | void>

export type AuthFailureCallback = (
  url: string,
  auth: GitAuth
) => GitAuth | void | Promise<GitAuth | void>

export type AuthSuccessCallback = (
  url: string,
  auth: GitAuth
) => void | Promise<void>

// Protocol-specific client types
export type SshClient = import('../../ssh/SshClient.ts').SshClient
export type SshProgressCallback = import('../../ssh/SshClient.ts').SshProgressCallback
export type TcpClient = import('../../daemon/TcpClient.ts').TcpClient
export type TcpProgressCallback = import('../../daemon/TcpClient.ts').TcpProgressCallback
export type FileSystemProvider = import('../../models/FileSystem.ts').FileSystemProvider

// Protocol-agnostic discover options
export type RemoteDiscoverOptions = {
  service: 'git-upload-pack' | 'git-receive-pack'
  url: string
  protocolVersion?: 1 | 2
  onProgress?: ProgressCallback | SshProgressCallback | TcpProgressCallback
  // HTTP-specific options
  http?: HttpClient
  headers?: Record<string, string>
  corsProxy?: string
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  // SSH-specific options
  ssh?: SshClient
  // TCP/Daemon-specific options
  tcp?: TcpClient
  // Filesystem-specific options
  fs?: FileSystemProvider
}

export type RemoteDiscoverResult =
  | {
      protocolVersion: 1
      refs: Map<string, string>
      symrefs: Map<string, string>
      capabilities: Set<string>
      auth: GitAuth
    }
  | {
      protocolVersion: 2
      capabilities2: Record<string, string | true>
      auth: GitAuth
    }

// Protocol-agnostic connect options
export type RemoteConnectOptions = {
  service: 'git-upload-pack' | 'git-receive-pack'
  url: string
  protocolVersion?: 1 | 2
  onProgress?: ProgressCallback | SshProgressCallback | TcpProgressCallback
  body?:
    | AsyncIterableIterator<Uint8Array>
    | Uint8Array
    | UniversalBuffer
    | UniversalBuffer[]
  // HTTP-specific options
  http?: HttpClient
  headers?: Record<string, string>
  auth?: GitAuth
  corsProxy?: string
  command?: string
  // SSH-specific options
  ssh?: SshClient
  // TCP/Daemon-specific options
  tcp?: TcpClient
  // Filesystem-specific options
  fs?: FileSystemProvider
}

// Protocol-agnostic connection response
export type RemoteConnection = {
  body: AsyncIterableIterator<Uint8Array>
  // HTTP-specific fields (optional)
  url?: string
  method?: string
  headers?: Record<string, string>
  statusCode?: number
  statusMessage?: string
}

/**
 * Options for creating a Git remote backend via `RemoteBackendRegistry.getBackend()`.
 * 
 * The registry automatically detects the protocol from the URL and creates the appropriate
 * backend implementation (HTTP, SSH, Git daemon, etc.).
 * 
 * @property {string} url - The remote repository URL (required)
 * @property {HttpClient} [http] - HTTP client for HTTP/HTTPS URLs (required for HTTP operations, optional if `urlOnly: true`)
 * @property {SshClient} [ssh] - SSH client for SSH URLs (required for SSH operations, optional if `urlOnly: true`)
 * @property {TcpClient} [tcp] - TCP client for git:// URLs (required for Git daemon operations, optional if `urlOnly: true`)
 * @property {FileSystemProvider} [fs] - File system provider for file:// URLs
 * @property {ForgeAuth} [auth] - Authentication credentials for forge APIs (GitHub, GitLab, etc.)
 * @property {boolean} [useRestApi] - Whether to use REST API backends for supported forges
 * @property {boolean} [urlOnly] - If `true`, allows creating backends without protocol clients for URL-only operations
 * 
 * **URL-Only Mode**:
 * 
 * When `urlOnly: true`, the registry will create backend instances without requiring
 * protocol-specific clients (http, ssh, tcp). This is useful for operations that only
 * need to read or display the remote URL, such as:
 * - `listRemotes` - Listing configured remotes with their URLs
 * - Displaying remote information in UI
 * - Validating remote URLs
 * 
 * Backends created with `urlOnly: true` can still call `getUrl()` to retrieve the URL,
 * but attempting to use `discover()` or `connect()` will fail if the required clients
 * are not provided at that time.
 * 
 * **Full Mode** (default):
 * 
 * When `urlOnly` is `false` or `undefined`, the registry requires protocol-specific clients
 * to be provided based on the URL protocol:
 * - HTTP/HTTPS URLs require `http` client
 * - SSH URLs (ssh:// or git@host:path) require `ssh` client
 * - Git daemon URLs (git://) require `tcp` client
 * 
 * @example
 * ```typescript
 * // URL-only mode: Create backend just to get the URL
 * const backend = RemoteBackendRegistry.getBackend({
 *   url: 'git@github.com:user/repo.git',
 *   urlOnly: true // No ssh client required
 * })
 * const url = backend.getUrl() // 'git@github.com:user/repo.git'
 * 
 * // Full mode: Create backend with client for actual operations
 * const backendWithClient = RemoteBackendRegistry.getBackend({
 *   url: 'https://github.com/user/repo.git',
 *   http: httpClient // Required for discover()/connect()
 * })
 * const refs = await backendWithClient.discover({ service: 'git-upload-pack', url: '...' })
 * ```
 */
export type RemoteBackendOptions = {
  url: string
  http?: HttpClient
  ssh?: SshClient
  tcp?: TcpClient
  fs?: FileSystemProvider
  auth?: ForgeAuth
  useRestApi?: boolean
  urlOnly?: boolean
}

export type RemoteRestCapabilities = {
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


