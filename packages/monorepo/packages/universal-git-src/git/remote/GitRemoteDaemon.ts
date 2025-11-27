import { ParseError } from '../../errors/ParseError.ts'
import { EmptyServerResponseError } from '../../errors/EmptyServerResponseError.ts'
import { parseRefsAdResponse } from '../../wire/parseRefsAdResponse.ts'
import type { TcpClient, TcpConnection, TcpProgressCallback } from '../../daemon/TcpClient.ts'
import { GitPktLine } from '../../models/GitPktLine.ts'
import { collect } from '../../utils/collect.ts'
import { fromValue } from '../../utils/fromValue.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { GitRemoteBackend } from './GitRemoteBackend.ts'
import type { RemoteDiscoverOptions, RemoteDiscoverResult, RemoteConnectOptions, RemoteConnection } from './types.ts'
import { MissingParameterError } from '../../errors/MissingParameterError.ts'

// ============================================================================
// GIT DAEMON PROTOCOL TYPES
// ============================================================================

/**
 * Git daemon response structure
 */
export type GitDaemonResponse = {
  body: AsyncIterableIterator<Uint8Array>
}

/**
 * Git auth (not used in daemon protocol, but kept for API compatibility)
 */
export type GitAuth = {
  username?: string
  password?: string
  headers?: Record<string, string>
  cancel?: boolean
}

// ============================================================================
// URL PARSING
// ============================================================================

/**
 * Parse a git:// URL into host, port, and path components
 */
function parseGitDaemonUrl(url: string): { host: string; port: number; path: string } {
  // Remove git:// prefix
  if (!url.startsWith('git://')) {
    throw new ParseError('Invalid git:// URL', url)
  }

  const withoutProtocol = url.slice(6) // Remove 'git://'
  
  // Parse host:port/path or host/path
  const match = withoutProtocol.match(/^([^:]+)(?::(\d+))?(\/.*)?$/)
  if (!match) {
    throw new ParseError('Invalid git:// URL format', url)
  }

  const host = match[1]
  const port = match[2] ? parseInt(match[2], 10) : 9418 // Default Git daemon port
  const path = match[3] || '/'

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ParseError('Invalid port number', url)
  }

  return { host, port, path }
}

// ============================================================================
// GIT REMOTE DAEMON CLASS
// ============================================================================

export class GitRemoteDaemon implements GitRemoteBackend {
  readonly name = 'tcp'
  readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  getUrl(): string {
    return this.baseUrl
  }

  supportsRestApi(): boolean {
    return false
  }

  async discover(
    options: RemoteDiscoverOptions
  ): Promise<RemoteDiscoverResult> {
    return GitRemoteDaemon.performDiscover(options)
  }

  async connect(options: RemoteConnectOptions): Promise<RemoteConnection> {
    return GitRemoteDaemon.performConnect(options)
  }

  /**
   * Returns the capabilities of the GitRemoteDaemon class.
   */
  static async capabilities(): Promise<string[]> {
    return ['discover', 'connect']
  }

  /**
   * Discovers references from a remote Git repository via git:// protocol.
   * 
   * Protocol flow:
   * 1. Connect to git://host:port
   * 2. Send: "git-upload-pack <path>\n" (or "git-receive-pack <path>\n")
   * 3. Read reference advertisement (pkt-line format)
   * 4. Parse capabilities and refs
   */
  private static async performDiscover(
    options: RemoteDiscoverOptions
  ): Promise<RemoteDiscoverResult> {
    const {
      tcp,
      service,
      url: _origUrl,
      onProgress,
      protocolVersion = 1,
    } = options

    if (!tcp) {
      throw new MissingParameterError('tcp', 'GitRemoteDaemon requires tcp client')
    }
    const { host, port, path } = parseGitDaemonUrl(_origUrl)

    // Connect to the Git daemon server
    const connection = await tcp.connect({
      host,
      port,
      onProgress,
    })

    try {
      // Send service request: "git-upload-pack <path>\n" or "git-receive-pack <path>\n"
      const serviceRequest = `${service} ${path}\n`
      await (connection.write as any)(UniversalBuffer.from(serviceRequest, 'utf8'))

      // Read the reference advertisement
      // The server responds with:
      // 1. "# service=<service>\n" (pkt-line format)
      // 2. Reference list (pkt-line format)
      const responseStream = connection.read()

      // Parse the reference advertisement
      const result = await parseRefsAdResponse(responseStream, { service })

      // Log protocol version negotiation
      if (protocolVersion === 2 && result.protocolVersion === 1) {
        console.log(`[Git Protocol] Git Daemon: Server using protocol v1 (v2 not supported), gracefully continuing`)
      } else {
        console.log(`[Git Protocol] Git Daemon: Using protocol v${result.protocolVersion}`)
      }

      // Convert to RemoteDiscoverResult format
      if (result.protocolVersion === 1) {
        return {
          protocolVersion: 1,
          refs: result.refs,
          symrefs: result.symrefs,
          capabilities: result.capabilities,
          auth: {}, // Git daemon doesn't use authentication
        }
      } else {
        return {
          protocolVersion: 2,
          capabilities2: result.capabilities2,
          auth: {},
        }
      }
    } finally {
      // Close the connection after discovery
      await connection.close()
    }
  }

  /**
   * Connects to a remote Git repository via git:// protocol and sends a request.
   * 
   * Protocol flow:
   * 1. Connect to git://host:port
   * 2. Send service request: "git-upload-pack <path>\n"
   * 3. Read reference advertisement (skip it)
   * 4. Send upload-pack request (want/have lines)
   * 5. Read packfile response
   */
  private static async performConnect(
    options: RemoteConnectOptions
  ): Promise<RemoteConnection> {
    const {
      tcp,
      onProgress,
      service,
      url,
      body,
    } = options

    if (!tcp) {
      throw new MissingParameterError('tcp', 'GitRemoteDaemon requires tcp client')
    }
    const { host, port, path } = parseGitDaemonUrl(url)

    // Connect to the Git daemon server
    const connection = await tcp.connect({
      host,
      port,
      onProgress,
    })

    try {
      // Send service request: "git-upload-pack <path>\n" or "git-receive-pack <path>\n"
      const serviceRequest = `${service} ${path}\n`
      await (connection.write as any)(UniversalBuffer.from(serviceRequest, 'utf8'))

      // Read the reference advertisement and then send request
      // The protocol requires us to read the advertisement first, then send our request
      const readStream = connection.read()
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
      if (body) {
        if (Array.isArray(body)) {
          // Array of Buffers
          for (const chunk of body) {
            await (connection.write as any)(UniversalBuffer.from(chunk))
          }
        } else if (body instanceof Uint8Array || UniversalBuffer.isBuffer(body)) {
          // @ts-expect-error - UniversalBuffer.from() returns a type that doesn't match overload exactly
          await connection.write(UniversalBuffer.from(body))
        } else {
          // AsyncIterableIterator
          for await (const chunk of body) {
            await (connection.write as any)(UniversalBuffer.from(chunk))
          }
        }
      }

      // Return the response stream (packfile) as RemoteConnection
      // Continue reading from the same connection
      return {
        body: readStream, // Continue reading from the same stream
      } as RemoteConnection
    } catch (error) {
      // Ensure connection is closed on error
      await connection.close().catch(() => {
        // Ignore errors during cleanup
      })
      throw error
    }
  }

  // Static methods for backward compatibility
  static async discover(
    options: RemoteDiscoverOptions
  ): Promise<RemoteDiscoverResult> {
    return GitRemoteDaemon.performDiscover(options)
  }

  static async connect(
    options: RemoteConnectOptions
  ): Promise<RemoteConnection> {
    return GitRemoteDaemon.performConnect(options)
  }
}

