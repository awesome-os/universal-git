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

export type RemoteBackendOptions = {
  url: string
  http?: HttpClient
  ssh?: SshClient
  tcp?: TcpClient
  fs?: FileSystemProvider
  auth?: ForgeAuth
  useRestApi?: boolean
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


