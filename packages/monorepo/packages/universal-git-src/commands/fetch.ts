import { _currentBranch } from './currentBranch.ts'
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { RemoteCapabilityError } from "../errors/RemoteCapabilityError.ts"
import { ConfigAccess } from "../utils/configAccess.ts"
import { expandRef, resolveRefAgainstMap } from "../git/refs/expandRef.ts"
import { resolveRef } from "../git/refs/readRef.ts"
import { listRefs } from "../git/refs/listRefs.ts"
import { updateRemoteRefs } from "../git/refs/updateRemoteRefs.ts"
import { readShallow, writeShallow } from "../git/shallow.ts"
import { getRemoteHelperFor } from "../git/remote/getRemoteHelper.ts"
import { RemoteBackendRegistry } from "../git/remote/RemoteBackendRegistry.ts"
import { GitCommit } from "../models/GitCommit.ts"
import { GitPackIndex } from "../models/GitPackIndex.ts"
import { hasObject } from "../git/objects/hasObject.ts"
import { readObject } from "../git/objects/readObject.ts"
import { abbreviateRef } from "../utils/abbreviateRef.ts"
import { collect } from "../utils/collect.ts"
import { emptyPackfile } from "../utils/emptyPackfile.ts"
import { filterCapabilities } from "../utils/filterCapabilities.ts"
import { forAwait } from "../utils/forAwait.ts"
import { fromValue } from "../utils/fromValue.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { pkg } from "../utils/pkg.ts"
import { splitLines } from "../utils/splitLines.ts"
import { parseUploadPackResponse } from "../wire/parseUploadPackResponse.ts"
import { writeUploadPackRequest } from "../wire/writeUploadPackRequest.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { createFileSystem } from "../utils/createFileSystem.ts"
import { Repository } from "../core-utils/Repository.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { FileSystem } from "../models/FileSystem.ts"
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

// ============================================================================
// FETCH TYPES
// ============================================================================

/**
 * Message callback for logging/status messages
 */
export type MessageCallback = (message: string) => void | Promise<void>

/**
 * Fetch operation result
 */
export type FetchResult = {
  defaultBranch: string | null
  fetchHead: string | null
  fetchHeadDescription: string | null
  headers?: Record<string, string>
  pruned?: string[]
  packfile?: string
}

/**
 * Fetch commits from a remote repository
 */
export async function fetch({
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
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  remote,
  remoteRef,
  url,
  corsProxy,
  depth = null,
  since = null,
  exclude = [],
  relative = false,
  tags = false,
  singleBranch = false,
  headers = {},
  prune = false,
  pruneTags = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystem
  remoteBackend?: GitRemoteBackend // Optional: use provided backend or auto-detect
  http?: HttpClient // Required for HTTP/HTTPS URLs if remoteBackend not provided
  tcp?: TcpClient // Required for git:// URLs if remoteBackend not provided
  ssh?: SshClient // Required for SSH URLs if remoteBackend not provided
  onProgress?: ProgressCallback | TcpProgressCallback | SshProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  dir?: string
  gitdir?: string
  ref?: string
  remote?: string
  remoteRef?: string
  url?: string
  corsProxy?: string
  depth?: number | null
  since?: Date | null
  exclude?: string[]
  relative?: boolean
  tags?: boolean
  singleBranch?: boolean
  headers?: Record<string, string>
  prune?: boolean
  pruneTags?: boolean
  cache?: Record<string, unknown>
}): Promise<FetchResult> {
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
      ref,
      remote,
      remoteRef,
      url,
      corsProxy,
      depth,
      since,
      exclude,
      relative,
      tags,
      singleBranch,
      headers,
      prune,
      pruneTags,
    })

    return await _fetch({
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
      gitdir: effectiveGitdir,
      ref,
      remote,
      remoteRef,
      url,
      corsProxy,
      depth,
      since,
      exclude,
      relative,
      tags,
      singleBranch,
      headers,
      prune,
      pruneTags,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.fetch'
    throw err
  }
}

/**
 * Internal fetch implementation
 * @internal - Exported for use by other commands (e.g., clone)
 */
export async function _fetch({
  repo: _repo,
  fs: _fs,
  cache: _cache,
  remoteBackend,
  http,
  tcp,
  ssh,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  gitdir: _gitdir,
  ref: _ref,
  remoteRef: _remoteRef,
  remote: _remote,
  url: _url,
  corsProxy,
  depth = null,
  since = null,
  exclude = [],
  relative = false,
  tags = false,
  singleBranch = false,
  headers = {},
  prune = false,
  pruneTags = false,
  protocolVersion = 2,
}: {
  repo?: Repository
  fs?: FileSystem
  cache?: Record<string, unknown>
  remoteBackend?: GitRemoteBackend // Optional: use provided backend or auto-detect
  http?: HttpClient // Required for HTTP/HTTPS URLs if remoteBackend not provided
  tcp?: TcpClient // Required for git:// URLs if remoteBackend not provided
  ssh?: SshClient // Required for SSH URLs if remoteBackend not provided
  onProgress?: ProgressCallback | TcpProgressCallback | SshProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  gitdir?: string
  ref?: string
  remoteRef?: string
  remote?: string
  url?: string
  corsProxy?: string
  depth?: number | null
  since?: Date | null
  exclude?: string[]
  relative?: boolean
  tags?: boolean
  singleBranch?: boolean
  headers?: Record<string, string>
  prune?: boolean
  pruneTags?: boolean
  protocolVersion?: 1 | 2
}): Promise<FetchResult> {
  // Backward compatibility: Create Repository if not provided
  let repo: Repository
  let fs: FileSystem
  let cache: Record<string, unknown>
  let gitdir: string

  if (_repo) {
    repo = _repo
    fs = repo.fs
    cache = repo.cache
    gitdir = await repo.getGitdir()
  } else {
    if (!_fs) {
      throw new MissingParameterError('fs')
    }
    if (!_gitdir) {
      throw new MissingParameterError('gitdir')
    }
    fs = createFileSystem(_fs)
    cache = _cache || {}
    gitdir = _gitdir
    
    // OPTIMIZATION: If remote is provided but url is not, validate remote exists early
    // This avoids expensive Repository.open() if the remote doesn't exist
    if (_remote && !_url) {
      const { join } = await import('../utils/join.ts')
      const configPath = join(gitdir, 'config')
      try {
        const configContent = await fs.read(configPath, 'utf8')
        if (typeof configContent === 'string') {
          // Quick check: does the config contain the remote section?
          const remoteSection = `[remote "${_remote}"]`
          if (!configContent.includes(remoteSection)) {
            throw new MissingParameterError('remote OR url')
          }
        }
      } catch (err) {
        // If config file doesn't exist or can't be read, let Repository.open() handle it
        // But if we got a MissingParameterError, throw it immediately
        if (err instanceof MissingParameterError) {
          throw err
        }
      }
    }
    
    repo = await Repository.open({ fs, dir: undefined, gitdir, cache, autoDetectConfig: true })
    gitdir = await repo.getGitdir()
    cache = repo.cache
  }

  const ref = _ref || (await _currentBranch({ repo, test: true }))
  const configService = await repo.getConfig()
  
  // Figure out what remote to use
  const remote = _remote || (ref && ((await configService.get(`branch.${ref}.remote`)) as string)) || 'origin'
  
  // Lookup the URL for the given remote
  const url = _url || ((await configService.get(`remote.${remote}.url`)) as string)
  if (typeof url === 'undefined') {
    throw new MissingParameterError('remote OR url')
  }
  
  // Figure out what remote ref to use
  const remoteRef =
    _remoteRef ||
    (ref && ((await configService.get(`branch.${ref}.merge`)) as string)) ||
    _ref ||
    'HEAD'

  if (corsProxy === undefined) {
    corsProxy = (await configService.get('http.corsProxy')) as string | undefined
  }

  // Use provided backend or auto-detect from URL
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
      useRestApi: false, // fetch only uses Git protocol, not REST API
    })
  }
  
  console.log(`[Git Protocol] Starting fetch operation, requesting protocol version ${protocolVersion}`)
  
  // Call backend.discover() with protocol-agnostic options
  let remoteHTTP: any
  try {
    // Resolve ssh if it's a Promise
    const resolvedSsh = ssh instanceof Promise ? await ssh : ssh
    
    remoteHTTP = await backend.discover({
      service: 'git-upload-pack',
      url,
      protocolVersion,
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
  } catch (error: any) {
    // If smart HTTP fails, provide helpful error message
    if (error.statusCode === 404 || error.message?.includes('not found')) {
      throw new Error(
        `Smart HTTP protocol failed for ${url}. ` +
        `The server may only support legacy "dumb" HTTP protocol. ` +
        `HTTP Dumb protocol support is available but requires explicit configuration.`
      )
    }
    throw error
  }
  
  const auth = remoteHTTP.auth
  
  // Handle protocol v2: fetch refs separately using ls-refs command
  let remoteRefs: Map<string, string>
  let symrefs: Map<string, string>
  
  if (remoteHTTP.protocolVersion === 2) {
    console.log(`[Git Protocol] Server responded with v2, fetching refs separately using ls-refs command`)
    
    // Protocol v2 requires separate ls-refs command to get refs
    const { writeListRefsRequest } = await import('../wire/writeListRefsRequest.ts')
    const { parseListRefsResponse } = await import('../wire/parseListRefsResponse.ts')
    
    const body = await writeListRefsRequest({ symrefs: true })
    
    // Create an async iterator that yields individual buffers as Uint8Array
    const bodyIterator = (async function* () {
      for (const buf of body) {
        yield new Uint8Array(buf)
      }
    })()
    
    // Call backend.connect() for ls-refs command (protocol v2)
    const resolvedSsh = ssh instanceof Promise ? await ssh : ssh
    const connectRes = await backend.connect({
      service: 'git-upload-pack',
      url,
      protocolVersion: 2,
      command: 'ls-refs',
      body: bodyIterator,
      onProgress,
      // HTTP-specific options
      http,
      headers,
      auth,
      corsProxy,
      // SSH-specific options
      ssh: resolvedSsh,
      // TCP/Daemon-specific options
      tcp,
    })
    
    // Normalize response format (all backends return RemoteConnection, but HTTP has extra fields)
    const normalizedConnectRes = {
      body: connectRes.body,
      headers: connectRes.headers || {},
      statusCode: connectRes.statusCode || 200,
      statusMessage: connectRes.statusMessage || 'OK',
    }
    
    if (!normalizedConnectRes.body) {
      throw new Error('No response body from ls-refs command')
    }
    
    const serverRefs = await parseListRefsResponse(normalizedConnectRes.body)
    remoteRefs = new Map<string, string>()
    symrefs = new Map<string, string>()
    
    for (const serverRef of serverRefs) {
      remoteRefs.set(serverRef.ref, serverRef.oid)
      if (serverRef.target) {
        symrefs.set(serverRef.ref, serverRef.target)
      }
    }
    
    console.log(`[Git Protocol] Fetched ${remoteRefs.size} refs via protocol v2 ls-refs command`)
  } else {
    // Protocol v1: refs are in the initial response
    remoteRefs = remoteHTTP.refs
    symrefs = remoteHTTP.symrefs
    
    if (!remoteRefs) {
      throw new Error('Protocol error: refs not available in protocol v1 response')
    }
    
    console.log(`[Git Protocol] Fetch using protocol v${remoteHTTP.protocolVersion}, found ${remoteRefs.size} refs`)
  }
  
  // For the special case of an empty repository with no refs, return null
  if (remoteRefs.size === 0) {
    return {
      defaultBranch: null,
      fetchHead: null,
      fetchHeadDescription: null,
    }
  }
  
  // Get capabilities (different format for v1 vs v2)
  let capabilities: Set<string>
  let fetchCapabilities: string[] = [] // For protocol v2 fetch sub-capabilities
  
  if (remoteHTTP.protocolVersion === 2) {
    // Protocol v2: capabilities are structured differently
    // Top-level capabilities are in capabilities2
    // Fetch sub-capabilities are in fetch=shallow filter ... format
    capabilities = new Set<string>()
    for (const [key, value] of Object.entries(remoteHTTP.capabilities2)) {
      if (value === true) {
        capabilities.add(key)
      } else {
        capabilities.add(`${key}=${value}`)
        // Extract fetch sub-capabilities (e.g., "fetch=shallow filter" -> ["shallow", "filter"])
        if (key === 'fetch' && typeof value === 'string') {
          fetchCapabilities = value.split(' ').filter(cap => cap.length > 0)
        }
      }
    }
  } else {
    // GitRemoteHTTP.discover() returns capabilities as string[], but parseRefsAdResponse returns Set<string>
    // Convert to Set for consistency
    capabilities = remoteHTTP.capabilities instanceof Set 
      ? remoteHTTP.capabilities 
      : new Set(remoteHTTP.capabilities || [])
  }
  
  // Helper function to check if a capability is supported
  const hasCapability = (capName: string): boolean => {
    if (remoteHTTP.protocolVersion === 2) {
      // For protocol v2, check fetch sub-capabilities
      if (['shallow', 'deepen-since', 'deepen-not', 'deepen-relative'].includes(capName)) {
        return fetchCapabilities.includes(capName)
      }
      // For other capabilities, check top-level
      return capabilities.has(capName)
    } else {
      // Protocol v1: all capabilities are top-level
      return capabilities.has(capName)
    }
  }
  
  // Check that the remote supports the requested features
  if (depth !== null && !hasCapability('shallow')) {
    throw new RemoteCapabilityError('shallow', 'depth')
  }
  if (since !== null && !hasCapability('deepen-since')) {
    throw new RemoteCapabilityError('deepen-since', 'since')
  }
  if (exclude.length > 0 && !hasCapability('deepen-not')) {
    throw new RemoteCapabilityError('deepen-not', 'exclude')
  }
  if (relative === true && !hasCapability('deepen-relative')) {
    throw new RemoteCapabilityError('deepen-relative', 'relative')
  }
  
  const { oid, fullref } = resolveRefAgainstMap({
    ref: remoteRef,
    map: remoteRefs,
  })
  
  // Filter out refs we want to ignore
  for (const remoteRef of remoteRefs.keys()) {
    if (
      remoteRef === fullref ||
      remoteRef === 'HEAD' ||
      remoteRef.startsWith('refs/heads/') ||
      (tags && remoteRef.startsWith('refs/tags/'))
    ) {
      continue
    }
    remoteRefs.delete(remoteRef)
  }
  
  // Assemble the application/x-git-upload-pack-request
  // Use the capabilities we extracted (works for both v1 and v2)
  const filteredCaps = filterCapabilities(
    [...capabilities],
    [
      'multi_ack_detailed',
      'no-done',
      'side-band-64k',
      'ofs-delta',
      `agent=${pkg.agent}`,
    ]
  )
  if (relative) filteredCaps.push('deepen-relative')
  
  // Start figuring out which oids from the remote we want to request
  const wants = singleBranch ? [oid] : Array.from(remoteRefs.values())
  
  // Come up with a reasonable list of oids to tell the remote we already have
  const haveRefs = singleBranch
    ? ref ? [ref] : []
    : await listRefs({
        fs,
        gitdir,
        filepath: 'refs',
      })
  
  let haves: string[] = []
  for (let ref of haveRefs) {
    try {
      ref = await expandRef({ fs, gitdir, ref })
      const oid = await resolveRef({ fs, gitdir, ref })
      if (await hasObject({ fs, cache, gitdir, oid })) {
        haves.push(oid)
      }
    } catch {
      // Ignore errors
    }
  }
  haves = [...new Set(haves)]
  
  const oids = await readShallow({ fs, gitdir })
  const shallows = capabilities.has('shallow') ? [...oids] : []
  
  const packstream = writeUploadPackRequest({
    capabilities: filteredCaps,
    wants: wants as never[],
    haves: haves as never[],
    shallows: shallows as never[],
    depth: depth === null || depth === undefined ? undefined : depth,
    since: since === null || since === undefined ? undefined : since,
    exclude: exclude as never[],
    protocolVersion: remoteHTTP.protocolVersion,
  })
  // CodeCommit will hang up if we don't send a Content-Length header
  // Collect all pkt-line buffers into a single request body buffer
  // This ensures the body is complete before sending and can be read by the mock server
  const packbuffer = UniversalBuffer.from(await collect(packstream))
  
  // Call backend.connect() for fetch-pack request
  const resolvedSshForFetch = ssh instanceof Promise ? await ssh : ssh
  const rawConnection = await backend.connect({
    service: 'git-upload-pack',
    url,
    protocolVersion: remoteHTTP.protocolVersion,
    command: remoteHTTP.protocolVersion === 2 ? 'fetch' : undefined,
    body: [packbuffer], // Array of Buffers (backend will convert to async iterator)
    onProgress,
    // HTTP-specific options
    http,
    headers,
    auth,
    corsProxy,
    // SSH-specific options
    ssh: resolvedSshForFetch,
    // TCP/Daemon-specific options
    tcp,
  })
  
  // Normalize response format (all backends return RemoteConnection, but HTTP has extra fields)
  const raw = {
    body: rawConnection.body,
    headers: rawConnection.headers || {},
    statusCode: rawConnection.statusCode || 200,
    statusMessage: rawConnection.statusMessage || 'OK',
  }
  
  const response = await parseUploadPackResponse(raw.body, remoteHTTP.protocolVersion)
  if (raw.headers) {
    response.headers = raw.headers
  }
  
  // Apply all the 'shallow' and 'unshallow' commands
  for (const oid of response.shallows) {
    if (!oids.has(oid)) {
      try {
        const { object } = await readObject({ fs, cache, gitdir, oid })
        const commit = new GitCommit(object)
        const parents = commit.headers()?.parent
        let haveAllParents = false
        if (parents && parents.length > 0) {
          const hasParents = await Promise.all(
            parents.map(oid => hasObject({ fs, cache, gitdir, oid }))
          )
          haveAllParents = hasParents.every(has => has)
        } else {
          haveAllParents = true
        }
        if (!haveAllParents) {
          oids.add(oid)
        }
      } catch {
        oids.add(oid)
      }
    }
  }
  for (const oid of response.unshallows) {
    oids.delete(oid)
  }
  
  await writeShallow({ fs, gitdir, oids })
  
  // Update local remote refs
  if (singleBranch) {
    // Normalize fullref to ensure it's in the correct format for updateRemoteRefs
    // If fullref is 'HEAD', resolve it to the actual branch using symrefs
    // If fullref is just a branch name (e.g., "test"), try to find it in remoteRefs with refs/heads/ prefix
    // If fullref is undefined (no explicit ref provided), use the default branch from HEAD symref
    let normalizedFullref = fullref
    if (normalizedFullref === 'HEAD') {
      // HEAD was requested, resolve it to the actual branch via symrefs
      const headSymref = symrefs?.get('HEAD')
      if (headSymref && remoteRefs.has(headSymref)) {
        normalizedFullref = headSymref
      } else {
        // Fallback: find the first branch in remoteRefs
        for (const [ref, _oid] of remoteRefs.entries()) {
          if (ref.startsWith('refs/heads/')) {
            normalizedFullref = ref
            break
          }
        }
      }
    } else if (!normalizedFullref) {
      // No explicit ref provided, try to find the default branch from HEAD symref
      const headSymref = symrefs?.get('HEAD')
      if (headSymref && remoteRefs.has(headSymref)) {
        normalizedFullref = headSymref
      } else {
        // Fallback: find the first branch in remoteRefs
        for (const [ref, _oid] of remoteRefs.entries()) {
          if (ref.startsWith('refs/heads/')) {
            normalizedFullref = ref
            break
          }
        }
      }
    }
    
    // Ensure we have a valid ref
    if (!normalizedFullref) {
      throw new Error('Cannot determine branch to fetch when singleBranch is true and no ref is provided')
    }
    
    if (!normalizedFullref.startsWith('refs/heads/') && !normalizedFullref.startsWith('refs/tags/') && !normalizedFullref.startsWith('refs/')) {
      // Try to find the ref in remoteRefs with refs/heads/ prefix
      const fullRefPath = `refs/heads/${normalizedFullref}`
      if (remoteRefs.has(fullRefPath)) {
        normalizedFullref = fullRefPath
      }
    }
    
    const refs = new Map([[normalizedFullref, oid]])
    const localSymrefs = new Map()
    let bail = 10
    let key = normalizedFullref
    while (bail--) {
      const value = symrefs?.get(key)
      if (value === undefined) break
      localSymrefs.set(key, value)
      key = value
    }
    const realRef = remoteRefs.get(key)
    if (realRef && (!singleBranch || key !== 'HEAD')) {
      refs.set(key, realRef)
    }
    // When singleBranch is true, filter out HEAD from both refs and symrefs to prevent creating
    // refs/remotes/origin/HEAD which might point to a branch we didn't fetch (e.g., main)
    const filteredRefs = singleBranch ? new Map([...refs.entries()].filter(([k]) => k !== 'HEAD' && k !== undefined)) : refs
    const filteredSymrefs = singleBranch ? new Map([...localSymrefs.entries()].filter(([k]) => k !== 'HEAD' && k !== undefined)) : localSymrefs
    const { pruned } = await updateRemoteRefs({
      fs,
      gitdir,
      remote,
      refs: filteredRefs,
      symrefs: filteredSymrefs,
      tags,
      prune,
    })
    if (prune) {
      response.pruned = pruned
    }
  } else {
    const { pruned } = await updateRemoteRefs({
      fs,
      gitdir,
      remote,
      refs: remoteRefs,
      symrefs: symrefs,
      tags,
      prune,
      pruneTags,
    })
    if (prune) {
      response.pruned = pruned
    }
  }
  
  response.HEAD = symrefs.get('HEAD')
  if (response.HEAD === undefined) {
    const { oid } = resolveRefAgainstMap({
      ref: 'HEAD',
      map: remoteRefs,
    })
    for (const [key, value] of remoteRefs.entries()) {
      if (key !== 'HEAD' && value === oid) {
        response.HEAD = key
        break
      }
    }
  }
  
  const noun = fullref.startsWith('refs/tags') ? 'tag' : 'branch'
  response.FETCH_HEAD = {
    oid,
    description: `${noun} '${abbreviateRef(fullref)}' of ${url}`,
  }

  if (onProgress || onMessage) {
    const lines = splitLines(response.progress)
    forAwait(lines, async line => {
      const msg = typeof line === 'string' ? line : (line instanceof UniversalBuffer ? line.toString('utf8') : String(line));
      if (onMessage) await onMessage(msg);
      if (onProgress) {
        const matches = msg.match(/([^:]*).*\((\d+?)\/(\d+?)\)/);
        if (matches) {
          await onProgress({
            phase: matches[1].trim(),
            loaded: parseInt(matches[2], 10),
            total: parseInt(matches[3], 10),
          })
        }
      }
    })
  }
  
  console.log(`[DEBUG fetch] About to collect packfile from FIFO...`)
  console.log(`[DEBUG fetch] Protocol version: ${remoteHTTP.protocolVersion}`)
  console.log(`[DEBUG fetch] Response acks: ${response.acks.length}, nak: ${response.nak}`)
  console.log(`[DEBUG fetch] Response shallows: ${response.shallows.length}, unshallows: ${response.unshallows.length}`)
  
  // For protocol v2, we need to ensure the packfile stream is actually receiving data
  // Check if packfile FIFO has any data before waiting
  let packfileCheckInterval: NodeJS.Timeout | null = null
  if (remoteHTTP.protocolVersion === 2) {
    console.log(`[DEBUG fetch] Protocol v2: Setting up packfile stream monitoring...`)
    // Monitor the packfile stream to see if data is arriving
    const checkPackfile = () => {
      // Check if packfile FIFO has data (this is a bit hacky but helps debug)
      const packfileAny = response.packfile as any
      if (packfileAny && packfileAny._buffer) {
        const bufferSize = packfileAny._buffer.length || 0
        if (bufferSize > 0) {
          console.log(`[DEBUG fetch] Protocol v2: Packfile FIFO has ${bufferSize} bytes buffered`)
        }
      }
    }
    packfileCheckInterval = setInterval(checkPackfile, 1000) // Check every second
  }
  
  const responseFinishedWaitStart = Date.now()
  console.log(`[DEBUG fetch] Waiting for response.finished signal...`)
  // Wait for the stream to finish processing before collecting the packfile.
  // This ensures that all data has been written to the FIFO and it has been ended.
  await response.finished
  if (packfileCheckInterval) {
    clearInterval(packfileCheckInterval)
  }
  console.log(
    `[DEBUG fetch] response.finished resolved in ${Date.now() - responseFinishedWaitStart}ms`
  )
  console.log(`[DEBUG fetch] Collecting packfile stream into buffer...`)
  const collectStart = Date.now()
  const rawPackfile = await collect(response.packfile)
  const collectDuration = Date.now() - collectStart
  console.log(
    `[DEBUG fetch] Packfile stream collected in ${collectDuration}ms (bytes=${rawPackfile.length})`
  )
  const packfile = UniversalBuffer.from(rawPackfile)
  console.log(`[DEBUG fetch] Collected packfile: size=${packfile.length} bytes`)
  
  if (packfile.length === 0) {
    console.warn(`[DEBUG fetch] WARNING: Packfile is empty! This might indicate a protocol v2 parsing issue.`)
    console.warn(`[DEBUG fetch] Response state: acks=${response.acks.length}, nak=${response.nak}, shallows=${response.shallows.length}`)
    console.warn(`[DEBUG fetch] This could mean:`)
    console.warn(`[DEBUG fetch]   1. The server didn't send packfile data`)
    console.warn(`[DEBUG fetch]   2. The side-band demux isn't routing packfile data correctly`)
    console.warn(`[DEBUG fetch]   3. The packfile stream ended before data arrived`)
  }
  if (raw.body.error) throw raw.body.error
  const packfileSha = packfile.length >= 20 ? packfile.slice(-20).toString('hex') : ''
  const isEmpty = packfile.length > 0 ? emptyPackfile(packfile) : true
  console.log(`[DEBUG fetch] Packfile info: sha=${packfileSha}, size=${packfile.length}, empty=${isEmpty}`)
  const res: FetchResult = {
    defaultBranch: response.HEAD || null,
    fetchHead: response.FETCH_HEAD.oid,
    fetchHeadDescription: response.FETCH_HEAD.description,
  }
  if (response.headers) {
    res.headers = response.headers
  }
  if (prune) {
    res.pruned = response.pruned
  }
  
  if (packfileSha !== '' && !emptyPackfile(packfile)) {
    console.log(`[DEBUG fetch] Packfile is valid, will write to disk`)
    res.packfile = `objects/pack/pack-${packfileSha}.pack`
    const fullpath = join(gitdir, res.packfile)
    // Ensure the pack directory exists
    // FileSystem.mkdir already implements recursive directory creation
    const packDir = join(gitdir, 'objects', 'pack')
    await fs.mkdir(packDir)
    
    // Create index from packfile first (before writing to disk)
    // We need getExternalRefDelta to be able to read from the packfile being indexed
    // packfile is already a UniversalBuffer, no need to convert again
    const packfileBuffer = packfile
    
    // Create a getExternalRefDelta that can read from the packfile being indexed
    // The key insight: during fromPack, the GitPackIndex instance 'p' is created and
    // objects are resolved incrementally. We need to make getExternalRefDelta use 'p'
    // to read objects that have already been resolved.
    // Since fromPack doesn't expose 'p' to getExternalRefDelta, we'll use a workaround:
    // we'll modify fromPack to pass 'p' via a closure, or we'll scan the packfile.
    // Actually, the simplest solution is to make getExternalRefDelta use the packfile
    // buffer directly by creating a temporary index for reading.
    
    // Create the index
    // The modified fromPack will now use the index being built to resolve ref-deltas
    // We need to make sure getExternalRefDelta doesn't throw errors for objects that
    // might be in the packfile but not yet resolved - the multi-pass will handle those
    const idx = await GitPackIndex.fromPack({
      pack: packfile,
      getExternalRefDelta: async (oid: string) => {
        // The modified fromPack checks offsets first, so if we get here, the object
        // is not in the packfile being indexed. Try to read from disk (other packfiles or loose).
        try {
          const result = await readObject({ fs, cache, gitdir, oid })
          return { type: result.type || '', object: result.object }
        } catch (err) {
          // If we can't find it on disk, it might be in the packfile but not yet resolved
          // This can happen if the object is a ref-delta that depends on another ref-delta
          // The multi-pass will retry in the next pass
          // However, if the base object truly doesn't exist, we need to throw the error
          // so the object gets skipped and retried
          throw err
        }
      },
      onProgress,
    })
    
    // OPTIMIZATION: Write packfile first (non-blocking for index operations)
    // This makes the packfile available immediately while index is being prepared
    console.log(`[DEBUG fetch] Writing packfile to: ${fullpath}`)
    const packfileWritePromise = fs.write(fullpath, packfile)
    
    // Prepare index buffer (this will trigger lazy CRC computation if needed)
    const indexPath = fullpath.replace(/\.pack$/, '.idx')
    const indexBuffer = await idx.toBuffer()
    console.log(`[DEBUG fetch] Writing packfile index to: ${indexPath} (size: ${indexBuffer.length} bytes, objects: ${idx.offsets.size})`)
    
    // Write index after packfile completes (ensures packfile is on disk first)
    await packfileWritePromise
    await fs.write(indexPath, indexBuffer)
    
    // Verify the index file was written correctly
    if (!(await fs.exists(indexPath))) {
      throw new Error(`Failed to write packfile index: ${indexPath}`)
    }
    console.log(`[DEBUG fetch] Packfile index verified to exist: ${indexPath}`)
    
    // Store the index in cache so it's immediately available for reading
    // This ensures objects can be found right after fetch completes
    // Populate both cache systems: loadIndex (symbol) and readPackIndex (string)
    idx.pack = Promise.resolve(packfileBuffer)
    
    // Cache for loadIndex (used by readPacked in PackfileReader)
    // Use the same Symbol constant as pack.ts for consistency
    // Note: TypeScript doesn't allow Symbols as Record keys, but we cast to work around this
    const PackfileCache = Symbol.for('PackfileCache')
    if (!(cache as any)[PackfileCache]) {
      (cache as any)[PackfileCache] = new Map<string, GitPackIndex>()
    }
    const cacheMap1 = (cache as any)[PackfileCache] as Map<string, GitPackIndex>
    cacheMap1.set(indexPath, idx)
    
    // Cache for readPackIndex (used by packfileIterator)  
    const readPackIndexCacheKey = 'readPackIndexCache'
    if (!cache[readPackIndexCacheKey]) {
      cache[readPackIndexCacheKey] = new Map<string, Promise<GitPackIndex | undefined>>()
    }
    const cacheMap2 = cache[readPackIndexCacheKey] as Map<string, Promise<GitPackIndex | undefined>>
    cacheMap2.set(indexPath, Promise.resolve(idx))
    
    // Also cache using just the filename (not full path) in case that's what's used
    const filename = indexPath.split('/').pop() || indexPath.split('\\').pop() || ''
    if (filename) {
      const filenamePath = `${gitdir}/objects/pack/${filename}`
      cacheMap1.set(filenamePath, idx)
      cacheMap2.set(filenamePath, Promise.resolve(idx))
    }
    
      // Verify that fetchHead is in the index after fromPack completes
      // If it's not, the object might still be readable from the packfile
      // (e.g., if it's a ref-delta that couldn't be resolved during indexing)
      if (res.fetchHead) {
        const fetchHeadInIndex = idx.offsets.has(res.fetchHead)
        if (!fetchHeadInIndex) {
          // The fetchHead might be in the packfile but not indexed
          // This can happen if it's a ref-delta whose base object wasn't available during indexing
          // Try to read it directly - if it works, that's fine (readObject will handle it)
          // If it doesn't work, we'll get an error during checkout which is more informative
          console.warn(`[Packfile Index] fetchHead ${res.fetchHead} not found in packfile index after indexing. Total objects in index: ${idx.offsets.size}`)
          
          // Try to find it by scanning the packfile
          try {
            const testRead = await idx.read({ oid: res.fetchHead })
            console.log(`[Packfile Index] fetchHead ${res.fetchHead} is readable via packfile read() even though not in index`)
          } catch (err) {
            console.error(`[Packfile Index] fetchHead ${res.fetchHead} cannot be read from packfile:`, err)
          }
        } else {
          console.log(`[Packfile Index] fetchHead ${res.fetchHead} found in index at offset ${idx.offsets.get(res.fetchHead)}`)
        }
      }
    }

    return res
}

