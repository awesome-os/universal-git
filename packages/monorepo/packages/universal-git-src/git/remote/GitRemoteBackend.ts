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

export interface GitRemoteBackend {
  readonly name: string
  readonly baseUrl: string

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


