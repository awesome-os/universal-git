/**
 * Transport Types
 * Types for Git HTTP transport operations
 */

export type GitProgressEvent = {
  phase: string;
  loaded: number;
  total: number;
};

export type ProgressCallback = (
  progress: GitProgressEvent
) => void | Promise<void>;

export type GitHttpRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: AsyncIterableIterator<Uint8Array> | Uint8Array[];
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
};

export type GitHttpResponse = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: AsyncIterableIterator<Uint8Array>;
  statusCode: number;
  statusMessage: string;
};

export type HttpFetch = (request: GitHttpRequest) => Promise<GitHttpResponse>;

export type HttpClient = {
  request: HttpFetch;
};

export type GitAuth = {
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  cancel?: boolean;
};

export type AuthCallback = (
  url: string,
  auth: GitAuth
) => GitAuth | void | Promise<GitAuth | void>;

export type AuthFailureCallback = (
  url: string,
  auth: GitAuth
) => GitAuth | void | Promise<GitAuth | void>;

export type AuthSuccessCallback = (
  url: string,
  auth: GitAuth
) => void | Promise<void>;

export type RemoteDiscoverOptions = {
  service: 'git-upload-pack' | 'git-receive-pack';
  url: string;
  protocolVersion?: 1 | 2;
  onProgress?: ProgressCallback;
  http?: HttpClient;
  headers?: Record<string, string>;
  corsProxy?: string;
  onAuth?: AuthCallback;
  onAuthSuccess?: AuthSuccessCallback;
  onAuthFailure?: AuthFailureCallback;
};

export type RemoteDiscoverResult =
  | {
      protocolVersion: 1;
      refs: Map<string, string>;
      symrefs: Map<string, string>;
      capabilities: Set<string>;
      auth: GitAuth;
    }
  | {
      protocolVersion: 2;
      capabilities2: Record<string, string | true>;
      auth: GitAuth;
    };

export type RemoteConnectOptions = {
  service: 'git-upload-pack' | 'git-receive-pack';
  url: string;
  protocolVersion?: 1 | 2;
  onProgress?: ProgressCallback;
  body?: AsyncIterableIterator<Uint8Array> | Uint8Array[];
  http?: HttpClient;
  headers?: Record<string, string>;
  auth?: GitAuth;
  corsProxy?: string;
  command?: string;
};

export type RemoteConnection = {
  body: AsyncIterableIterator<Uint8Array>;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  statusCode?: number;
  statusMessage?: string;
};
