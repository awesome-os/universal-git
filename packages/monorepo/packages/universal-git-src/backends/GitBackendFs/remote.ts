import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Remote operations for GitBackendFs
 */

export async function getRemoteInfo(
  this: GitBackendFs,
  url: string,
  options?: {
    http?: import('../../git/remote/types.ts').HttpClient
    ssh?: import('../../ssh/SshClient.ts').SshClient
    tcp?: import('../../daemon/TcpClient.ts').TcpClient
    fs?: import('../../models/FileSystem.ts').FileSystemProvider
    onAuth?: import('../../git/remote/types.ts').AuthCallback
    onAuthSuccess?: import('../../git/remote/types.ts').AuthSuccessCallback
    onAuthFailure?: import('../../git/remote/types.ts').AuthFailureCallback
    onProgress?: import('../../git/remote/types.ts').ProgressCallback | import('../../ssh/SshClient.ts').SshProgressCallback | import('../../daemon/TcpClient.ts').TcpProgressCallback
    corsProxy?: string
    headers?: Record<string, string>
    forPush?: boolean
    protocolVersion?: 1 | 2
  }
): Promise<import('../../commands/getRemoteInfo.ts').GetRemoteInfoResult> {
  const { RemoteBackendRegistry } = await import('../../git/remote/RemoteBackendRegistry.ts')
  const { formatInfoRefs } = await import('../../utils/formatInfoRefs.ts')
  
  // Get remote backend from registry
  const backend = RemoteBackendRegistry.getBackend({
    url,
    http: options?.http,
    ssh: options?.ssh,
    tcp: options?.tcp,
    fs: options?.fs || this.getFs(),
    useRestApi: false, // getRemoteInfo only uses Git protocol, not REST API
  })
  
  // Call backend.discover() with protocol-agnostic options
  const remote = await backend.discover({
    service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
    url,
    protocolVersion: options?.protocolVersion || 2,
    onProgress: options?.onProgress,
    // HTTP-specific options
    http: options?.http,
    headers: options?.headers,
    corsProxy: options?.corsProxy,
    onAuth: options?.onAuth,
    onAuthSuccess: options?.onAuthSuccess,
    onAuthFailure: options?.onAuthFailure,
    // SSH-specific options
    ssh: options?.ssh,
    // TCP/Daemon-specific options
    tcp: options?.tcp,
  })
  
  // Convert RemoteDiscoverResult to GetRemoteInfoResult format
  if (remote.protocolVersion === 2) {
    return {
      protocolVersion: 2,
      capabilities: remote.capabilities2,
    }
  }
  
  // Protocol version 1: convert Set to object and format refs
  const capabilities: Record<string, string | true> = {}
  for (const cap of remote.capabilities) {
    const [key, value] = cap.split('=')
    if (value) {
      capabilities[key] = value
    } else {
      capabilities[key] = true
    }
  }
  
  return {
    protocolVersion: 1,
    capabilities,
    refs: formatInfoRefs({ refs: remote.refs, symrefs: remote.symrefs }, '', true, true),
  }
}

export async function listServerRefs(
  this: GitBackendFs,
  url: string,
  options?: {
    http?: import('../../git/remote/types.ts').HttpClient
    ssh?: import('../../ssh/SshClient.ts').SshClient
    tcp?: import('../../daemon/TcpClient.ts').TcpClient
    fs?: import('../../models/FileSystem.ts').FileSystemProvider
    onAuth?: import('../../git/remote/types.ts').AuthCallback
    onAuthSuccess?: import('../../git/remote/types.ts').AuthSuccessCallback
    onAuthFailure?: import('../../git/remote/types.ts').AuthFailureCallback
    onProgress?: import('../../git/remote/types.ts').ProgressCallback | import('../../ssh/SshClient.ts').SshProgressCallback | import('../../daemon/TcpClient.ts').TcpProgressCallback
    corsProxy?: string
    headers?: Record<string, string>
    forPush?: boolean
    protocolVersion?: 1 | 2
    prefix?: string
    symrefs?: boolean
    peelTags?: boolean
  }
): Promise<import('../../git/refs/types.ts').ServerRef[]> {
  const { RemoteBackendRegistry } = await import('../../git/remote/RemoteBackendRegistry.ts')
  const { formatInfoRefs } = await import('../../utils/formatInfoRefs.ts')
  const { writeListRefsRequest } = await import('../../wire/writeListRefsRequest.ts')
  const { parseListRefsResponse } = await import('../../wire/parseListRefsResponse.ts')
  
  // Get remote backend from registry
  const backend = RemoteBackendRegistry.getBackend({
    url,
    http: options?.http,
    ssh: options?.ssh,
    tcp: options?.tcp,
    fs: options?.fs || this.getFs(),
    useRestApi: false, // listServerRefs only uses Git protocol, not REST API
  })
  
  // Step 1: Discover capabilities and refs (for protocol v1)
  const remote = await backend.discover({
    service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
    url,
    protocolVersion: options?.protocolVersion || 2,
    onProgress: options?.onProgress,
    // HTTP-specific options
    http: options?.http,
    headers: options?.headers,
    corsProxy: options?.corsProxy,
    onAuth: options?.onAuth,
    onAuthSuccess: options?.onAuthSuccess,
    onAuthFailure: options?.onAuthFailure,
    // SSH-specific options
    ssh: options?.ssh,
    // TCP/Daemon-specific options
    tcp: options?.tcp,
  })
  
  // For protocol v1, refs are in the discovery response
  if (remote.protocolVersion === 1) {
    return formatInfoRefs(
      { refs: remote.refs, symrefs: remote.symrefs },
      options?.prefix || '',
      options?.symrefs || false,
      options?.peelTags || false
    )
  }
  
  // Protocol Version 2 - use ls-refs command via connect()
  const body = await writeListRefsRequest({
    prefix: options?.prefix,
    symrefs: options?.symrefs,
    peelTags: options?.peelTags,
  })
  
  // Create an async iterator that yields individual buffers as Uint8Array
  const bodyIterator = (async function* () {
    for (const buf of body) {
      yield new Uint8Array(buf)
    }
  })()
  
  // Step 2: Connect and send ls-refs command
  const res = await backend.connect({
    service: options?.forPush ? 'git-receive-pack' : 'git-upload-pack',
    url,
    protocolVersion: 2,
    command: 'ls-refs',
    body: bodyIterator,
    onProgress: options?.onProgress,
    // HTTP-specific options
    http: options?.http,
    headers: options?.headers,
    auth: remote.auth, // Use auth from discover response
    corsProxy: options?.corsProxy,
    // SSH-specific options
    ssh: options?.ssh,
    // TCP/Daemon-specific options
    tcp: options?.tcp,
  })
  
  if (!res.body) {
    throw new Error('No response body from server')
  }
  return parseListRefsResponse(res.body)
}

