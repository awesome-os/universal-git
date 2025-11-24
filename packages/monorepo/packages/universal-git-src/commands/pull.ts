import { MissingNameError } from "../errors/MissingNameError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { normalizeAuthorObject } from "../utils/normalizeAuthorObject.ts"
import { normalizeCommitterObject } from "../utils/normalizeCommitterObject.ts"
import { Repository } from "../core-utils/Repository.ts"
import { _fetch } from "./fetch.ts"
import { _merge } from "./merge.ts"
import { _currentBranch } from "./currentBranch.ts"
import { RefManager } from "../core-utils/refs/RefManager.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type {
  HttpClient,
  ProgressCallback,
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
} from "../git/remote/GitRemoteHTTP.ts"
import type { MessageCallback } from './push.ts'
import type { Author } from "../models/GitCommit.ts"
import type { TcpClient } from "../daemon/TcpClient.ts"

/**
 * Fetch and merge commits from a remote repository
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {HttpClient} args.http - an HTTP client
 * @param {ProgressCallback} [args.onProgress] - optional progress event callback
 * @param {MessageCallback} [args.onMessage] - optional message event callback
 * @param {AuthCallback} [args.onAuth] - optional auth fill callback
 * @param {AuthFailureCallback} [args.onAuthFailure] - optional auth rejected callback
 * @param {AuthSuccessCallback} [args.onAuthSuccess] - optional auth approved callback
 * @param {string} args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} [args.ref] - Which branch to merge into. By default this is the currently checked out branch.
 * @param {string} [args.url] - (Added in 1.1.0) The URL of the remote repository. The default is the value set in the git config for that remote.
 * @param {string} [args.remote] - (Added in 1.1.0) If URL is not specified, determines which remote to use.
 * @param {string} [args.remoteRef] - (Added in 1.1.0) The name of the branch on the remote to fetch. By default this is the configured remote tracking branch.
 * @param {boolean} [args.prune = false] - Delete local remote-tracking branches that are not present on the remote
 * @param {boolean} [args.pruneTags = false] - Prune local tags that don't exist on the remote, and force-update those tags that differ
 * @param {string} [args.corsProxy] - Optional [CORS proxy](https://www.npmjs.com/%40universal-git/cors-proxy). Overrides value in repo config.
 * @param {boolean} [args.singleBranch = false] - Instead of the default behavior of fetching all the branches, only fetch a single branch.
 * @param {boolean} [args.fastForward = true] -  If false, only create merge commits.
 * @param {boolean} [args.fastForwardOnly = false] - Only perform simple fast-forward merges. (Don't create merge commits.)
 * @param {Object<string, string>} [args.headers] - Additional headers to include in HTTP requests, similar to git's `extraHeader` config
 * @param {Object} [args.author] - The details about the author.
 * @param {string} [args.author.name] - Default is `user.name` config.
 * @param {string} [args.author.email] - Default is `user.email` config.
 * @param {number} [args.author.timestamp=Math.floor(Date.now()/1000)] - Set the author timestamp field. This is the integer number of seconds since the Unix epoch (1970-01-01 00:00:00).
 * @param {number} [args.author.timezoneOffset] - Set the author timezone offset field. This is the difference, in minutes, from the current timezone to UTC. Default is `(new Date()).getTimezoneOffset()`.
 * @param {Object} [args.committer = author] - The details about the commit committer, in the same format as the author parameter. If not specified, the author details are used.
 * @param {string} [args.committer.name] - Default is `user.name` config.
 * @param {string} [args.committer.email] - Default is `user.email` config.
 * @param {number} [args.committer.timestamp=Math.floor(Date.now()/1000)] - Set the committer timestamp field. This is the integer number of seconds since the Unix epoch (1970-01-01 00:00:00).
 * @param {number} [args.committer.timezoneOffset] - Set the committer timezone offset field. This is the difference, in minutes, from the current timezone to UTC. Default is `(new Date()).getTimezoneOffset()`.
 * @param {string} [args.signingKey] - passed to [commit](commit.md) when creating a merge commit
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<void>} Resolves successfully when pull operation completes
 *
 * @example
 * await git.pull({
 *   fs,
 *   http,
 *   dir: '/tutorial',
 *   ref: 'main',
 *   singleBranch: true
 * })
 * console.log('done')
 *
 */
export async function pull({
  repo: _repo,
  fs: _fs,
  http,
  tcp,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  url,
  remote,
  remoteRef,
  prune = false,
  pruneTags = false,
  fastForward = true,
  fastForwardOnly = false,
  corsProxy,
  singleBranch,
  headers = {},
  author: _author,
  committer: _committer,
  signingKey,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  http?: HttpClient // Required if tcp is not provided
  tcp?: TcpClient // Required if http is not provided (for git:// protocol)
  onProgress?: ProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  dir?: string
  gitdir?: string
  ref?: string
  url?: string
  remote?: string
  remoteRef?: string
  prune?: boolean
  pruneTags?: boolean
  fastForward?: boolean
  fastForwardOnly?: boolean
  corsProxy?: string
  singleBranch?: boolean
  headers?: Record<string, string>
  author?: Partial<Author>
  committer?: Partial<Author>
  signingKey?: string
  cache?: Record<string, unknown>
}): Promise<void> {
  try {
    // Require either http or tcp
    if (!http && !tcp) {
      throw new MissingParameterError('http OR tcp')
    }

    const { repo, fs, gitdir: effectiveGitdir, dir: effectiveDir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      http,
      tcp,
      onProgress,
      onMessage,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      ref,
      url,
      remote,
      remoteRef,
      prune,
      pruneTags,
      fastForward,
      fastForwardOnly,
      corsProxy,
      singleBranch,
      headers,
      author: _author,
      committer: _committer,
      signingKey,
    })

    const author = await normalizeAuthorObject({ repo, author: _author })
    if (!author) throw new MissingNameError('author')

    const committer = await normalizeCommitterObject({
      repo,
      author,
      committer: _committer,
    })
    if (!committer) throw new MissingNameError('committer')

    return await _pull({
      repo,
      fs,
      cache,
      http,
      tcp,
      onProgress,
      onMessage,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      dir: effectiveDir,
      gitdir: effectiveGitdir,
      ref,
      url,
      remote,
      remoteRef,
      fastForward,
      fastForwardOnly,
      corsProxy,
      singleBranch,
      headers,
      author,
      committer,
      signingKey,
      prune,
      pruneTags,
      protocolVersion: 2,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.pull'
    throw err
  }
}

/**
 * Internal pull implementation
 * @internal - Exported for use by other commands (e.g., fastForward)
 */
export async function _pull({
  repo,
  fs,
  cache,
  http,
  tcp,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  dir,
  gitdir,
  ref: _ref,
  remote,
  remoteRef,
  url,
  fastForward = true,
  fastForwardOnly = false,
  corsProxy,
  singleBranch,
  headers = {},
  author,
  committer,
  signingKey,
  prune = false,
  pruneTags = false,
  protocolVersion = 2,
}: {
  repo: Repository
  fs: FileSystemProvider
  cache: Record<string, unknown>
  http?: HttpClient // Required if tcp is not provided
  tcp?: TcpClient // Required if http is not provided (for git:// protocol)
  onProgress?: ProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  dir?: string
  gitdir: string
  ref?: string
  remote?: string
  remoteRef?: string
  url?: string
  fastForward?: boolean
  fastForwardOnly?: boolean
  corsProxy?: string
  singleBranch?: boolean
  headers?: Record<string, string>
  author: Author
  committer: Author
  signingKey?: string
  prune?: boolean
  pruneTags?: boolean
  protocolVersion?: 1 | 2
}): Promise<void> {
  const ref = _ref || (await _currentBranch({ fs, gitdir }))
  if (typeof ref === 'undefined') {
    throw new MissingParameterError('ref')
  }

  // Repository is already provided as parameter, use it

  // Step 1: Fetch from remote
  await _fetch({
    fs,
    cache,
    http,
    tcp,
    onProgress,
    onMessage,
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    gitdir,
    ref,
    remote,
    remoteRef,
    url,
    corsProxy,
    singleBranch,
    headers,
    prune,
    pruneTags,
    protocolVersion,
  })

  // Step 2: Determine the remote tracking branch to merge
  const remoteTrackingRef = remoteRef || `refs/remotes/${remote || 'origin'}/${ref.replace('refs/heads/', '')}`
  
  // Resolve the remote tracking branch OID
  const theirOid = await RefManager.resolve({ fs, gitdir, ref: remoteTrackingRef })
  
  // Step 3: Merge the fetched changes
  await _merge({
    repo,
    theirs: theirOid,
    fastForward,
    fastForwardOnly,
    author,
    committer,
    signingKey,
    allowUnrelatedHistories: false,
  })
}
