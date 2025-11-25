import { _currentBranch } from './currentBranch.ts'
import { _isDescendent } from './isDescendent.ts'
import { listCommitsAndTags } from './listCommitsAndTags.ts'
import { listObjects } from './listObjects.ts'
import { _pack } from './pack.ts'
import { GitPushError } from "../errors/GitPushError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { ParseError } from "../errors/ParseError.ts"
import { PushRejectedError } from "../errors/PushRejectedError.ts"
import { UserCanceledError } from "../errors/UserCanceledError.ts"
import { ConfigAccess } from "../utils/configAccess.ts"
import { expandRef, expandRefAgainstMap, resolveRefAgainstMap } from "../git/refs/expandRef.ts"
import { resolveRef } from "../git/refs/readRef.ts"
import { writeRef } from "../git/refs/writeRef.ts"
import { deleteRef } from "../git/refs/deleteRef.ts"
import { Repository } from "../core-utils/Repository.ts"
import { findMergeBase } from "../core-utils/algorithms/CommitGraphWalker.ts"
import { getRemoteHelperFor } from "../git/remote/getRemoteHelper.ts"
import { RemoteBackendRegistry } from "../git/remote/RemoteBackendRegistry.ts"
import { GitSideBand } from "../models/GitSideBand.ts"
import { filterCapabilities } from "../utils/filterCapabilities.ts"
import { collect } from "../utils/collect.ts"
import { forAwait } from "../utils/forAwait.ts"
import { fromValue } from "../utils/fromValue.ts"
import { pkg } from "../utils/pkg.ts"
import { splitLines } from "../utils/splitLines.ts"
import { parseReceivePackResponse } from "../wire/parseReceivePackResponse.ts"
import { writeReceivePackRequest } from "../wire/writeReceivePackRequest.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type {
  HttpClient,
  ProgressCallback,
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
} from "../git/remote/types.ts"
import type { GitRemoteBackend } from "../git/remote/GitRemoteBackend.ts"
import type { TcpClient, TcpProgressCallback } from "../daemon/TcpClient.ts"
import type { SshClient, SshProgressCallback } from "../ssh/SshClient.ts"
import { GitRemoteDaemon } from "../git/remote/GitRemoteDaemon.ts"
import { GitRemoteHTTP } from "../git/remote/GitRemoteHTTP.ts"
import { GitRemoteSSH } from "../git/remote/GitRemoteSSH.ts"
import type { ClientRef } from "../git/refs/types.ts"
import type { RefUpdateStatus } from "../git/refs/types.ts"

// ============================================================================
// PUSH TYPES
// ============================================================================

/**
 * Message callback for logging/status messages
 */
export type MessageCallback = (message: string) => void | Promise<void>

/**
 * Pre-push hook parameters
 */
export type PrePushParams = {
  remote: string // Expanded name of target remote
  url: string // URL address of target remote
  localRef: ClientRef // Ref which the client wants to push to the remote
  remoteRef: ClientRef // Ref which is known by the remote
}

/**
 * Pre-push callback
 */
export type PrePushCallback = (args: PrePushParams) => boolean | Promise<boolean>

/**
 * Push operation result
 */
export type PushResult = {
  ok: boolean
  refs: Record<string, RefUpdateStatus>
  headers?: Record<string, string>
}

/**
 * Push a branch or tag
 */
export async function push({
  repo: _repo,
  fs: _fs,
  remoteBackend,
  http,
  tcp,
  ssh,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  onPrePush,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  remoteRef,
  remote = 'origin',
  url,
  force = false,
  delete: _delete = false,
  corsProxy,
  headers = {},
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  remoteBackend?: GitRemoteBackend // Optional: use provided backend or auto-detect
  http?: HttpClient // Required for HTTP/HTTPS URLs if remoteBackend not provided
  tcp?: TcpClient // Required for git:// URLs if remoteBackend not provided
  ssh?: SshClient | Promise<SshClient> // Required for SSH URLs if remoteBackend not provided
  onProgress?: ProgressCallback | TcpProgressCallback | SshProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  onPrePush?: PrePushCallback
  dir?: string
  gitdir?: string
  ref?: string
  remoteRef?: string
  remote?: string
  url?: string
  force?: boolean
  delete?: boolean
  corsProxy?: string
  headers?: Record<string, string>
  cache?: Record<string, unknown>
}): Promise<PushResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      http,
      tcp,
      ssh,
      onProgress,
      onMessage,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      onPrePush,
      ref,
      remoteRef,
      remote,
      url,
      force,
      delete: _delete,
      corsProxy,
      headers,
    })

    return await _push({
      repo,
      fs,
      cache: effectiveCache,
      remoteBackend,
      http,
      tcp,
      ssh,
      onProgress,
      onMessage,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      onPrePush,
      gitdir: effectiveGitdir,
      ref,
      remoteRef,
      remote,
      url,
      force,
      delete: _delete,
      corsProxy,
      headers,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.push'
    throw err
  }
}

/**
 * Internal push implementation
 */
async function _push({
  repo,
  fs,
  cache,
  remoteBackend,
  http,
  tcp,
  ssh,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  onPrePush,
  gitdir,
  ref: _ref,
  remoteRef: _remoteRef,
  remote,
  url: _url,
  force = false,
  delete: _delete = false,
  corsProxy,
  headers = {},
}: {
  repo: Repository
  fs: FileSystemProvider
  cache: Record<string, unknown>
  remoteBackend?: GitRemoteBackend // Optional: use provided backend or auto-detect
  http?: HttpClient // Required for HTTP/HTTPS URLs if remoteBackend not provided
  tcp?: TcpClient // Required for git:// URLs if remoteBackend not provided
  ssh?: SshClient | Promise<SshClient> // Required for SSH URLs if remoteBackend not provided
  onProgress?: ProgressCallback | TcpProgressCallback | SshProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  onPrePush?: PrePushCallback
  gitdir: string
  ref?: string
  remoteRef?: string
  remote?: string
  url?: string
  force?: boolean
  delete?: boolean
  corsProxy?: string
  headers?: Record<string, string>
}): Promise<PushResult> {
  const ref = _ref || (await _currentBranch({ repo }))
  if (typeof ref === 'undefined') {
    throw new MissingParameterError('ref')
  }
  
  // Use Repository for config access
  const configService = await repo.getConfig()
  
  // Extract branch name from ref for config lookup (branch.master.merge, not branch.refs/heads/master.merge)
  // If ref is already a branch name (no refs/heads/ prefix), use it as-is
  // Otherwise, extract the branch name from refs/heads/branch-name
  const branchName = ref.startsWith('refs/heads/') 
    ? ref.replace('refs/heads/', '')
    : ref.startsWith('refs/')
    ? ref.replace(/^refs\/[^/]+\//, '') // Remove refs/heads/ or refs/remotes/origin/ etc.
    : ref
  
  // Figure out what remote to use
  remote =
    remote ||
    ((await configService.get(`branch.${branchName}.pushRemote`)) as string) ||
    ((await configService.get('remote.pushDefault')) as string) ||
    ((await configService.get(`branch.${branchName}.remote`)) as string) ||
    'origin'
  
  // Lookup the URL for the given remote
  const url =
    _url ||
    ((await configService.get(`remote.${remote}.pushurl`)) as string) ||
    ((await configService.get(`remote.${remote}.url`)) as string)
  if (typeof url === 'undefined') {
    throw new MissingParameterError('remote OR url')
  }

  if (corsProxy === undefined) {
    corsProxy = (await configService.get('http.corsProxy')) as string | undefined
  }

  // Use provided backend or auto-detect from URL
  // This will throw MissingParameterError for missing http/tcp/ssh if needed
  let backend: GitRemoteBackend
  if (remoteBackend) {
    backend = remoteBackend
  } else {
    // Auto-detect backend from URL using registry
    // For git:// protocol, try to get default TCP client if not provided
    if (url.startsWith('git://') && !tcp) {
      try {
        const { tcpClient } = await import('../daemon/node/index.ts')
        tcp = tcpClient
      } catch {
        // If we can't import TCP client, let RemoteBackendRegistry handle the error
      }
    }
    
    backend = RemoteBackendRegistry.getBackend({
      url,
      http,
      tcp,
      ssh,
      useRestApi: false, // push only uses Git protocol, not REST API
    })
  }

  // Figure out what remote ref to use (after backend detection, so http/tcp/ssh errors come first)
  const remoteRef = _remoteRef || ((await configService.get(`branch.${branchName}.merge`)) as string)
  if (typeof remoteRef === 'undefined') {
    throw new MissingParameterError('remoteRef')
  }

  // Use capability modules for basic ref operations
  const fullRef = await expandRef({ fs, gitdir, ref })
  const oid = _delete
    ? '0000000000000000000000000000000000000000'
    : await resolveRef({ fs, gitdir, ref: fullRef })

  // Call backend.discover() for git-receive-pack (push service)
  const resolvedSsh = ssh instanceof Promise ? await ssh : ssh
  const remoteInfo = await backend.discover({
    service: 'git-receive-pack',
    url,
    protocolVersion: 2,
    onProgress,
    // HTTP-specific options
    http,
    headers,
    corsProxy,
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    // SSH-specific options
    ssh: resolvedSsh,
    // TCP/Daemon-specific options
    tcp,
  })

  // Convert capabilities to Set for compatibility
  // Handle both protocol v1 (Set<string>) and v2 (Record<string, string | true>)
  let capabilitiesSet: Set<string>
  if (remoteInfo.protocolVersion === 2) {
    capabilitiesSet = new Set<string>()
    for (const [key, value] of Object.entries(remoteInfo.capabilities2)) {
      if (value === true) {
        capabilitiesSet.add(key)
      } else {
        capabilitiesSet.add(`${key}=${value}`)
      }
    }
  } else {
    capabilitiesSet = remoteInfo.capabilities instanceof Set
      ? remoteInfo.capabilities
      : new Set(remoteInfo.capabilities || [])
  }

  const auth = remoteInfo.auth
  let fullRemoteRef: string
  if (!remoteRef) {
    fullRemoteRef = fullRef
  } else {
    try {
      fullRemoteRef = expandRefAgainstMap({
        ref: remoteRef,
        map: remoteInfo.refs,
      })
    } catch (err) {
      if (err instanceof NotFoundError) {
        // The remote reference doesn't exist yet
        fullRemoteRef = remoteRef.startsWith('refs/') ? remoteRef : `refs/heads/${remoteRef}`
      } else {
        throw err
      }
    }
  }
  const oldoid =
    remoteInfo.refs.get(fullRemoteRef) || '0000000000000000000000000000000000000000'

  // Run pre-push hook (before push operation)
  try {
    const { runHook } = await import('../git/hooks/runHook.ts')
    const worktree = repo.getWorktree()
    
    // Pre-push hook receives stdin with lines: <local ref> <local oid> <remote ref> <remote oid>
    const localRefName = _delete ? '(delete)' : fullRef
    const localOid = _delete ? '0000000000000000000000000000000000000000' : oid
    const remoteOid = oldoid
    const prePushStdin = `${localRefName} ${localOid} ${fullRemoteRef} ${remoteOid}\n`
    
    await runHook({
      fs,
      gitdir,
      hookName: 'pre-push',
      context: {
        gitdir,
        workTree: worktree?.dir,
        remote,
        remoteUrl: url,
        pushedRefs: [{
          ref: fullRef,
          oldOid: oldoid,
          newOid: localOid,
        }],
      },
      stdin: prePushStdin,
    })
  } catch (hookError: any) {
    // Pre-push hook failures abort the push
    if (hookError.exitCode !== undefined && hookError.exitCode !== 0) {
      const error = hookError instanceof Error ? hookError : new Error(hookError.stderr || hookError.message || 'Unknown error')
      throw new UserCanceledError(error)
    }
    // If it's a spawn/environment error, wrap it to include hook context
    if (hookError.code === 'ENOENT' || hookError.message?.includes('spawn')) {
      const error = hookError instanceof Error ? hookError : new Error(hookError.message || 'Unknown error')
      throw new UserCanceledError(error)
    }
    // Re-throw other errors
    throw hookError
  }

  // Call manual pre-push callback if provided (for backward compatibility)
  if (onPrePush) {
    const hookCancel = await onPrePush({
      remote,
      url,
      localRef: { ref: _delete ? '(delete)' : fullRef, oid },
      remoteRef: { ref: fullRemoteRef, oid: oldoid },
    })
    if (!hookCancel) throw new UserCanceledError()
  }

  // Remotes can always accept thin-packs UNLESS they specify the 'no-thin' capability
  const thinPack = !capabilitiesSet.has('no-thin')

  let objects = new Set<string>()
  if (!_delete) {
    const finish = [...remoteInfo.refs.values()]
    let skipObjects = new Set<string>()

    // If remote branch is present, look for a common merge base
    if (oldoid !== '0000000000000000000000000000000000000000') {
      // Use CommitGraphWalker.findMergeBase
      const mergebase = await findMergeBase({
        fs,
        cache,
        gitdir,
        commits: [oid, oldoid],
      })
      for (const oid of mergebase) finish.push(oid)
      if (thinPack) {
        skipObjects = await listObjects({ fs, cache, gitdir, oids: mergebase })
      }
    }

    // If remote does not have the commit, figure out the objects to send
    if (!finish.includes(oid)) {
      const commits = await listCommitsAndTags({
        fs,
        cache,
        gitdir,
        start: [oid],
        finish,
      })
      objects = await listObjects({ fs, cache, gitdir, oids: commits })
    }

    if (thinPack) {
      // If there's a default branch for the remote lets skip those objects too
      try {
        const ref = await resolveRef({
          fs,
          gitdir,
          ref: `refs/remotes/${remote}/HEAD`,
          depth: 2,
        })
        const { oid } = resolveRefAgainstMap({
          ref: ref.replace(`refs/remotes/${remote}/`, ''),
          fullref: ref,
          map: remoteInfo.refs,
        })
        const oids = [oid]
        for (const oid of await listObjects({ fs, cache, gitdir, oids })) {
          skipObjects.add(oid)
        }
      } catch {
        // Ignore errors
      }

      // Remove objects that we know the remote already has
      for (const oid of skipObjects) {
        objects.delete(oid)
      }
    }

    if (oid === oldoid) force = true
    if (!force) {
      // Is it a tag that already exists?
      if (
        fullRef.startsWith('refs/tags') &&
        oldoid !== '0000000000000000000000000000000000000000'
      ) {
        throw new PushRejectedError('tag-exists')
      }
      // Is it a non-fast-forward commit?
      if (
        oid !== '0000000000000000000000000000000000000000' &&
        oldoid !== '0000000000000000000000000000000000000000' &&
        !(await _isDescendent({
          fs,
          cache,
          gitdir,
          oid,
          ancestor: oldoid,
          depth: -1,
        }))
      ) {
        throw new PushRejectedError('not-fast-forward')
      }
    }
  }
  
  // We can only safely use capabilities that the server also understands
  const capabilities = filterCapabilities(
    [...capabilitiesSet],
    ['report-status', 'side-band-64k', `agent=${pkg.agent}`]
  )
  
  const packstream1 = await writeReceivePackRequest({
    capabilities,
    triplets: [{ oldoid, oid, fullRef: fullRemoteRef }],
  })
  
  const packstream2 = _delete
    ? []
    : await _pack({
        fs,
        cache,
        gitdir,
        oids: [...objects],
      })
  
  // Call backend.connect() for git-receive-pack (push)
  const resolvedSshForPush = ssh instanceof Promise ? await ssh : ssh
  const rawConnection = await backend.connect({
    service: 'git-receive-pack',
    url,
    protocolVersion: remoteInfo.protocolVersion,
    body: [...packstream1, ...packstream2], // Array of Buffers (backend will convert to async iterator)
    onProgress,
    // HTTP-specific options
    http,
    headers,
    auth: remoteInfo.auth,
    corsProxy,
    // SSH-specific options
    ssh: resolvedSshForPush,
    // TCP/Daemon-specific options
    tcp,
  })
  
  // Normalize response format (all backends return RemoteConnection, but HTTP has extra fields)
  const res = {
    body: rawConnection.body,
    headers: rawConnection.headers || {},
    statusCode: rawConnection.statusCode || 200,
    statusMessage: rawConnection.statusMessage || 'OK',
  }
  
  // Collect the response body into a buffer so we can use it multiple times
  const bodyBuffer = UniversalBuffer.from(await collect(res.body))
  
  // Create an async iterable from the buffer that can be used multiple times
  const createBodyStream = (): AsyncIterableIterator<Uint8Array> => {
    let yielded = false
    return {
      async next(): Promise<IteratorResult<Uint8Array>> {
        if (yielded) {
          return { done: true, value: undefined }
        }
        yielded = true
        return { done: false, value: bodyBuffer }
      },
      [Symbol.asyncIterator]() {
        return this
      },
    }
  }
  
  // Check if server supports side-band-64k
  const usesSideBand = capabilitiesSet.has('side-band-64k') || capabilitiesSet.has('side-band')
  
  let result: PushResult
  if (usesSideBand) {
    // Try to demux the response (in case server uses side-band)
    const bodyStream = createBodyStream()
    const { packetlines, packfile, progress } = await GitSideBand.demux(bodyStream)
    if (onMessage) {
      const lines = splitLines(progress)
      forAwait(lines, async line => {
        const msg = typeof line === 'string' ? line : (line instanceof UniversalBuffer ? line.toString('utf8') : String(line))
        await onMessage(msg)
      })
    }
    
    // Parse the response from packetlines (decoded lines)
    result = {
      ok: false,
      refs: {},
    }
    let response = ''
    await forAwait(packetlines as unknown as AsyncIterable<UniversalBuffer>, async (line: UniversalBuffer) => {
      response += line.toString('utf8') + '\n'
    })
    
    // If packetlines was empty, the server didn't use side-band encoding
    // Fall back to parsing the raw response
    if (response.trim() === '') {
      const bodyStream2 = createBodyStream()
      result = await parseReceivePackResponse(bodyStream2)
    } else {
      const lines = response.split('\n')
      // We're expecting "unpack {unpack-result}"
      const firstLine = lines.shift()
      if (!firstLine || !firstLine.startsWith('unpack ')) {
        throw new ParseError('unpack ok" or "unpack [error message]', firstLine || '')
      }
      result.ok = firstLine === 'unpack ok'
      result.refs = {}
      for (const line of lines) {
        if (line.trim() === '') continue
        // Lines should be in format: "ok ref\n" or "ok ref error message\n" or "ng ref error message\n"
        if (line.length < 3) continue
        const status = line.slice(0, 2)
        if (status !== 'ok' && status !== 'ng') continue
        const refAndMessage = line.slice(3).trim() // Trim to remove trailing newline
        let space = refAndMessage.indexOf(' ')
        if (space === -1) space = refAndMessage.length
        const ref = refAndMessage.slice(0, space)
        const error = refAndMessage.slice(space + 1).trim() || undefined
        result.refs[ref] = {
          ok: status === 'ok',
          error: error,
        }
      }
    }
  } else {
    // Server doesn't support side-band, parse response directly
    const bodyStream = createBodyStream()
    result = await parseReceivePackResponse(bodyStream)
  }
  if (res.headers) {
    result.headers = res.headers
  }

  // Update the local copy of the remote ref
  if (
    remote &&
    result.ok &&
    result.refs[fullRemoteRef] &&
    result.refs[fullRemoteRef].ok &&
    !fullRef.startsWith('refs/tags')
  ) {
    const ref = `refs/remotes/${remote}/${fullRemoteRef.replace('refs/heads', '')}`
    
    // Read old remote ref OID for reflog before updating
    let oldRemoteRefOid: string | undefined
    try {
      oldRemoteRefOid = await resolveRef({ fs, gitdir, ref })
    } catch {
      // Remote ref doesn't exist yet
      oldRemoteRefOid = undefined
    }
    
    if (_delete) {
      await deleteRef({ fs, gitdir, ref })
      
      // Add descriptive reflog entry for remote ref deletion
      if (oldRemoteRefOid) {
        const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
        const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
        await logRefUpdate({
          fs,
          gitdir,
          ref,
          oldOid: oldRemoteRefOid,
          newOid: '0000000000000000000000000000000000000000', // Zero OID for deletion
          message: REFLOG_MESSAGES.PUSH_DELETE(),
        }).catch(() => {
          // Silently ignore reflog errors (Git's behavior)
        })
      }
    } else {
      await writeRef({ fs, gitdir, ref, value: oid })
      
      // Add descriptive reflog entry for remote ref update
      if (oldRemoteRefOid !== oid) {
        const { logRefUpdate } = await import('../git/logs/logRefUpdate.ts')
        const { REFLOG_MESSAGES } = await import('../git/logs/messages.ts')
        await logRefUpdate({
          fs,
          gitdir,
          ref,
          oldOid: oldRemoteRefOid || '0000000000000000000000000000000000000000',
          newOid: oid,
          message: REFLOG_MESSAGES.PUSH_UPDATE(),
        }).catch(() => {
          // Silently ignore reflog errors (Git's behavior)
        })
      }
    }
  }
  
  if (result.ok && Object.values(result.refs).every(result => result.ok)) {
    // Run post-push hook (after successful push)
    try {
      const { runHook } = await import('../git/hooks/runHook.ts')
      const { Repository } = await import('../core-utils/Repository.ts')
      const repo = await Repository.open({ fs, dir: undefined, gitdir, cache, autoDetectConfig: true })
      const worktree = repo.getWorktree()
      
      await runHook({
        fs,
        gitdir,
        hookName: 'post-push',
        context: {
          gitdir,
          workTree: worktree?.dir,
          remote,
          remoteUrl: url,
          pushedRefs: [{
            ref: fullRef,
            oldOid: oldoid,
            newOid: _delete ? '0000000000000000000000000000000000000000' : oid,
          }],
        },
      })
    } catch (hookError: any) {
      // Post-push hook failures don't abort the push (it's already done)
      // But we log the error for debugging
      if (process.env.DEBUG_HOOKS === 'true') {
        console.warn(`post-push hook failed: ${hookError.stderr || hookError.message}`)
      }
    }
    
    return result
  } else {
    const prettyDetails = Object.entries(result.refs)
      .filter(([k, v]) => !v.ok)
      .map(([k, v]) => `\n  - ${k}: ${v.error}`)
      .join('')
    throw new GitPushError(prettyDetails, result)
  }
}

