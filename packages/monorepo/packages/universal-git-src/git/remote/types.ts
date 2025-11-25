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

export type RemoteDiscoverOptions = {
  http: HttpClient
  service: 'git-upload-pack' | 'git-receive-pack'
  url: string
  headers?: Record<string, string>
  protocolVersion?: 1 | 2
  corsProxy?: string
  onProgress?: ProgressCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
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

export type RemoteConnectOptions = {
  http: HttpClient
  service: 'git-upload-pack' | 'git-receive-pack'
  url: string
  headers?: Record<string, string>
  auth: GitAuth
  corsProxy?: string
  onProgress?: ProgressCallback
  protocolVersion?: 1 | 2
  command?: string
  body?:
    | AsyncIterableIterator<Uint8Array>
    | Uint8Array
    | UniversalBuffer
    | UniversalBuffer[]
}

export type RemoteConnection = GitHttpResponse

export type RemoteBackendOptions = {
  url: string
  http?: HttpClient
  ssh?: unknown
  fs?: unknown
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


