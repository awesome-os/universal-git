import { ParseError } from '../../errors/ParseError.ts'
import { EmptyServerResponseError } from '../../errors/EmptyServerResponseError.ts'
import { parseRefsAdResponse } from '../../wire/parseRefsAdResponse.ts'
import type { SshClient, SshConnection, SshProgressCallback } from '../../ssh/SshClient.ts'
import { GitPktLine } from '../../models/GitPktLine.ts'
import { collect } from '../../utils/collect.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

// ============================================================================
// SSH PROTOCOL TYPES
// ============================================================================

/**
 * Git SSH response structure
 */
export type GitSshResponse = {
  body: AsyncIterableIterator<Uint8Array>
}

/**
 * Git auth (SSH uses key-based or password auth)
 */
export type GitAuth = {
  username?: string
  password?: string
  privateKey?: string | UniversalBuffer
  passphrase?: string
  headers?: Record<string, string>
  cancel?: boolean
}

// ============================================================================
// URL PARSING
// ============================================================================

/**
 * Parse an SSH URL into host, port, username, and path components
 * 
 * Supports formats:
 * - ssh://user@host/path/to/repo.git
 * - ssh://user@host:port/path/to/repo.git
 * - git@host:path/to/repo.git (scp-style)
 */
function parseSshUrl(url: string): { host: string; port: number; username: string; path: string } {
  // Handle scp-style: git@host:path
  if (url.includes('@') && url.includes(':') && !url.startsWith('ssh://')) {
    const match = url.match(/^([^@]+)@([^:]+):(.+)$/)
    if (match) {
      return {
        username: match[1],
        host: match[2],
        port: 22,
        path: match[3],
      }
    }
  }

  // Handle ssh:// format
  if (!url.startsWith('ssh://')) {
    throw new ParseError('Invalid SSH URL', url)
  }

  const withoutProtocol = url.slice(6) // Remove 'ssh://'
  
  // Parse user@host:port/path or user@host/path
  const match = withoutProtocol.match(/^(?:([^@]+)@)?([^:/]+)(?::(\d+))?(?:\/(.+))?$/)
  if (!match) {
    throw new ParseError('Invalid SSH URL format', url)
  }

  const username = match[1] || 'git'
  const host = match[2]
  const port = match[3] ? parseInt(match[3], 10) : 22
  const path = match[4] || ''

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ParseError('Invalid port number', url)
  }

  // Ensure path starts with / for absolute paths, or keep relative
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return { host, port, username, path: normalizedPath }
}

// ============================================================================
// GIT REMOTE SSH CLASS
// ============================================================================

export class GitRemoteSSH {
  /**
   * Returns the capabilities of the GitRemoteSSH class.
   */
  static async capabilities(): Promise<string[]> {
    return ['discover', 'connect']
  }

  /**
   * Discovers references from a remote Git repository via SSH protocol.
   * 
   * Protocol flow:
   * 1. Connect to SSH server
   * 2. Execute: git-upload-pack '/path/to/repo.git'
   * 3. Read reference advertisement (pkt-line format)
   * 4. Parse capabilities and refs
   */
  static async discover({
    ssh,
    service,
    url: _origUrl,
    onProgress,
    protocolVersion = 1,
  }: {
    ssh: SshClient
    service: string
    url: string
    onProgress?: SshProgressCallback
    protocolVersion?: 1 | 2
  }): Promise<{
    refs: Map<string, string>
    symrefs: Map<string, string>
    capabilities: string[]
    auth: GitAuth
    protocolVersion: 1 | 2
  }> {
    const { host, port, username, path } = parseSshUrl(_origUrl)

    // Connect to SSH server
    const connection = await ssh.connect({
      host,
      port,
      username,
      onProgress,
    })

    try {
      // Execute Git command: git-upload-pack '/path/to/repo.git'
      const gitCommand = `${service} '${path}'`
      const { stdout, exitCode } = await connection.execute(gitCommand)

      // Read the reference advertisement
      // The server responds with:
      // 1. "# service=<service>\n" (pkt-line format)
      // 2. Reference list (pkt-line format)
      const responseStream = stdout

      // Parse the reference advertisement
      const result = await parseRefsAdResponse(responseStream, { service })

      // Wait for command to complete
      const code = await exitCode
      if (code !== 0) {
        throw new Error(`SSH command failed with exit code ${code}`)
      }

      // Log protocol version negotiation
      if (protocolVersion === 2 && result.protocolVersion === 1) {
        console.log(`[Git Protocol] SSH: Server using protocol v1 (v2 not supported), gracefully continuing`)
      } else {
        console.log(`[Git Protocol] SSH: Using protocol v${result.protocolVersion}`)
      }

      // Convert Set to Array for capabilities
      const capabilities = result.protocolVersion === 1
        ? Array.from(result.capabilities)
        : Object.keys(result.capabilities2)

      // Convert Map to Map for refs (protocol v1) or handle v2
      let refs: Map<string, string>
      let symrefs: Map<string, string>

      if (result.protocolVersion === 1) {
        refs = result.refs
        symrefs = result.symrefs
      } else {
        // Protocol v2 - refs are fetched separately via ls-refs command
        // For now, return empty maps (will be populated during connect phase)
        refs = new Map()
        symrefs = new Map()
      }

      return {
        refs,
        symrefs,
        capabilities,
        auth: { username }, // SSH auth is handled at connection level
        protocolVersion: result.protocolVersion,
      }
    } finally {
      // Close the connection after discovery
      await connection.close()
    }
  }

  /**
   * Connects to a remote Git repository via SSH protocol and sends a request.
   * 
   * Protocol flow:
   * 1. Connect to SSH server
   * 2. Execute: git-upload-pack '/path/to/repo.git'
   * 3. Read reference advertisement (skip it)
   * 4. Send upload-pack request (want/have lines)
   * 5. Read packfile response
   */
  static async connect({
    ssh,
    onProgress,
    service,
    url,
    body,
  }: {
    ssh: SshClient
    onProgress?: SshProgressCallback
    service: string
    url: string
    body?: AsyncIterableIterator<Uint8Array> | Uint8Array | UniversalBuffer | UniversalBuffer[]
  }): Promise<GitSshResponse> {
    const { host, port, username, path } = parseSshUrl(url)

    // Connect to SSH server
    const connection = await ssh.connect({
      host,
      port,
      username,
      onProgress,
    })

    try {
      // Execute Git command: git-upload-pack '/path/to/repo.git'
      // For SSH, we need to execute the command and then send data via stdin
      // This requires a connection that supports bidirectional communication
      const gitCommand = `${service} '${path}'`
      const { stdout, stderr, stdin, exitCode } = await connection.execute(gitCommand)

      // Read and discard the reference advertisement
      // We need to read until we get a flush packet (0000)
      const readStream = stdout
      const reader = GitPktLine.streamReader(readStream)
      
      // Read the service line: "# service=<service>\n"
      let line = await reader()
      while (line === null) line = await reader() // Skip flushes
      
      if (line === true) {
        throw new EmptyServerResponseError()
      }

      // Read until we get a flush packet (end of advertisement)
      while (true) {
        const nextLine = await reader()
        if (nextLine === null || nextLine === true) {
          // Flush packet or end of stream - advertisement is complete
          break
        }
      }

      // Now send the request body (want/have lines for upload-pack, or packfile for receive-pack)
      if (body && stdin) {
        if (Array.isArray(body)) {
          // Array of Buffers
          for (const chunk of body) {
            await (stdin as any)(UniversalBuffer.from(chunk))
          }
        } else if (body instanceof Uint8Array || UniversalBuffer.isBuffer(body)) {
          // @ts-expect-error - UniversalBuffer.from() returns a type that doesn't match overload exactly
          await stdin(UniversalBuffer.from(body))
        } else {
          // AsyncIterableIterator
          for await (const chunk of body) {
            await (stdin as any)(UniversalBuffer.from(chunk))
          }
        }
      } else if (body && !stdin) {
        console.warn('SSH protocol: Request body provided but stdin not available. Using ssh2 package is recommended for full functionality.')
      }

      // Return the response stream (packfile)
      // Continue reading from the same stdout stream
      return {
        body: readStream,
      }
    } catch (error) {
      // Ensure connection is closed on error
      await connection.close().catch(() => {
        // Ignore errors during cleanup
      })
      throw error
    }
  }
}

