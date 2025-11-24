/**
 * Mock Git Daemon Server for Testing
 * 
 * Provides a TCP-based mock server that simulates Git daemon protocol behavior
 * for testing fetch, clone, and push operations over git:// protocol.
 * 
 * Similar to MockHttpServer but for TCP-based git:// protocol.
 */

import { Server, Socket } from 'net'
import { listRefs } from '@awesome-os/universal-git-src/git/refs/listRefs.ts'
import { resolveRef, readSymbolicRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { writeRefsAdResponse } from '@awesome-os/universal-git-src/wire/writeRefsAdResponse.ts'
import { parseUploadPackRequest } from '@awesome-os/universal-git-src/wire/parseUploadPackRequest.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import type { FileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import { _pack } from '@awesome-os/universal-git-src/commands/pack.ts'
import { listObjects } from '@awesome-os/universal-git-src/commands/listObjects.ts'
import { hasObject } from '@awesome-os/universal-git-src/git/objects/hasObject.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

/**
 * Timeout for mock server operations (30 seconds)
 */
const MOCK_SERVER_TIMEOUT = 30000

/**
 * Creates a promise that rejects after the specified timeout
 */
function createTimeout(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  })
}

/**
 * Wraps a promise with a timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = MOCK_SERVER_TIMEOUT): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(timeoutMs)
  ])
}

/**
 * Repository information stored in mock server
 */
interface RepositoryInfo {
  fs: FileSystemProvider
  gitdir: string
  name: string
}

/**
 * Mock Git Daemon Server
 * 
 * Simulates a Git daemon server that handles:
 * - Reference advertisement (discovery)
 * - Upload-pack (fetch/clone)
 * - Receive-pack (push)
 */
export class MockGitDaemon {
  private server: Server | null = null
  private repositories: Map<string, RepositoryInfo> = new Map()
  private port: number = 0
  private listening: boolean = false

  /**
   * Register a repository for serving
   */
  async registerRepository(name: string, fs: FileSystemProvider, gitdir: string): Promise<void> {
    this.repositories.set(name, { fs, gitdir, name })
  }

  /**
   * Register a repository from a fixture
   */
  async registerFixture(fixtureName: string): Promise<void> {
    const { fs, gitdir } = await makeFixture(fixtureName)
    this.repositories.set(fixtureName, { fs, gitdir, name: fixtureName })
  }

  /**
   * Start the mock server
   */
  async start(port: number = 0): Promise<number> {
    if (this.server) {
      throw new Error('Server is already running')
    }

    return new Promise((resolve, reject) => {
      this.server = new Server()
      this.port = port

      this.server.on('connection', (socket: Socket) => {
        this.handleConnection(socket).catch((err) => {
          console.error('[MockGitDaemon] Error handling connection:', err)
          if (!socket.destroyed) socket.destroy()
        })
      })

      this.server.on('error', (err) => {
        this.server = null
        reject(err)
      })

      this.server.listen(port, () => {
        const address = this.server!.address()
        const actualPort = typeof address === 'string' ? 0 : address?.port || 0
        this.port = actualPort
        this.listening = true
        resolve(actualPort)
      })
    })
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null
        this.listening = false
        resolve()
      })
    })
  }

  /**
   * Get the server URL
   */
  getUrl(repoName: string): string {
    if (!this.listening) {
      throw new Error('Server is not listening')
    }
    return `git://localhost:${this.port}/${repoName}.git`
  }

  /**
   * Get all refs from a repository
   */
  private async getAllRefs(repo: RepositoryInfo): Promise<{ refs: Map<string, string>; symrefs: Map<string, string> }> {
    const { fs, gitdir } = repo
    const refs = new Map<string, string>()
    const symrefs = new Map<string, string>()
    
    // Add HEAD
    try {
      const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
      refs.set('HEAD', headOid)
      try {
        const headTarget = await readSymbolicRef({ fs, gitdir, ref: 'HEAD' })
        if (headTarget && headTarget.startsWith('refs/')) {
          symrefs.set('HEAD', headTarget)
        }
      } catch {
        // HEAD might not be a symref
      }
    } catch {
      // HEAD might not exist
    }
    
    // List all refs
    try {
      const refList = await listRefs({
        fs,
        gitdir,
        filepath: 'refs',
      })
      
      // Add all other refs
      for (const ref of refList) {
        const fullRef = `refs/${ref}`
        try {
          const oid = await resolveRef({ fs, gitdir, ref: fullRef })
          refs.set(fullRef, oid)
          
          // Check if it's a symref
          try {
            const symrefTarget = await readSymbolicRef({ fs, gitdir, ref: fullRef })
            if (symrefTarget && symrefTarget.startsWith('refs/')) {
              symrefs.set(fullRef, symrefTarget)
            }
          } catch {
            // Not a symref
          }
        } catch {
          // Ref might not exist
        }
      }
    } catch {
      // No refs directory
    }
    
    return { refs, symrefs }
  }

  /**
   * Read service request line from stream (plain text, not pkt-line)
   * Returns the service request string and the stream (which may have been partially consumed)
   * 
   * The key insight: UniversalBuffer.fromNodeStream maintains a queue of all data that arrives via 'data' events.
   * When we read the service request, we consume from that queue. Any remaining data in the
   * same chunk (after the newline) needs to be preserved. The base stream's queue will continue
   * to receive new data (like the upload-pack request) via its event listeners.
   */
  private async readServiceRequestFromStream(stream: AsyncIterableIterator<Uint8Array>): Promise<{ request: string; stream: AsyncIterableIterator<Uint8Array> }> {
    let buffer = Buffer.alloc(0)
    let remainingBuffer: Buffer | null = null
    let request: string = ''
    
    // Read until we get a newline, using next() to preserve iterator state
    while (true) {
      const result = await stream.next()
      if (result.done) {
        throw new Error('Stream ended before service request received')
      }
      
      const chunk = result.value
      buffer = Buffer.concat([buffer, Buffer.from(chunk)])
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex >= 0) {
        request = buffer.slice(0, newlineIndex).toString('utf8')
        // Preserve any data after the newline
        remainingBuffer = buffer.slice(newlineIndex + 1)
        break
      }
    }
    
    // Create a stream that yields the remaining buffer first, then continues with the base stream
    // The base stream's queue will continue to receive new data via UniversalBuffer.fromNodeStream's event listeners
    const newStream = this.createStreamWithRemainingData(remainingBuffer, stream)
    return { request, stream: newStream }
  }

  /**
   * Create a stream that yields remaining buffered data first, then continues with the base stream
   * The base stream (from UniversalBuffer.fromNodeStream) maintains its own queue via event listeners,
   * so new data (like the upload-pack request) will be automatically queued and available
   */
  private createStreamWithRemainingData(remainingBuffer: Buffer | null, baseStream: AsyncIterableIterator<Uint8Array>): AsyncIterableIterator<Uint8Array> {
    let bufferEmitted = false
    
    return {
      async next(): Promise<IteratorResult<Uint8Array>> {
        // First, emit the remaining buffered data if we have it
        if (!bufferEmitted) {
          bufferEmitted = true
          if (remainingBuffer && remainingBuffer.length > 0) {
            // Emit remaining buffer
            return { value: new Uint8Array(remainingBuffer), done: false }
          }
          // If remaining buffer is empty, immediately continue with base stream
        }
        // Then continue with the base stream (which has its own queue from UniversalBuffer.fromNodeStream)
        // This will read from the queue, or wait for new data if queue is empty
        // The UniversalBuffer.fromNodeStream's event listeners will continue to queue new data as it arrives
        return baseStream.next()
      },
      async return(): Promise<IteratorResult<Uint8Array>> {
        return baseStream.return?.() ?? { done: true, value: undefined }
      },
      [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
        return this
      },
    }
  }

  /**
   * Handle a new TCP connection
   */
  private async handleConnection(socket: Socket): Promise<void> {
    try {
      // Create the async iterable stream first (before reading anything)
      // This ensures all data goes through the stream
      const baseStream = UniversalBuffer.fromNodeStream<Uint8Array>(socket)
      
      // Read the service request line from the stream (plain text, not pkt-line formatted)
      // Format: "git-upload-pack /repo.git\n" or "git-receive-pack /repo.git\n"
      const { request, stream: socketStream } = await this.readServiceRequestFromStream(baseStream)
      
      const match = request.match(/^(git-upload-pack|git-receive-pack)\s+\/([^ ]+)/)
      
      if (!match) {
        console.error(`[MockGitDaemon] Invalid service request format: "${request}"`)
        socket.destroy()
        return
      }

      const [, service, repoPath] = match
      const repoName = repoPath.replace(/\.git$/, '')
      const repo = this.repositories.get(repoName)

      if (!repo) {
        console.error(`[MockGitDaemon] Repository not found: "${repoName}"`)
        socket.destroy()
        return
      }

      // Route to the correct service handler, passing the stream
      if (service === 'git-upload-pack') {
        await this.handleUploadPack(socket, repo, socketStream)
      } else if (service === 'git-receive-pack') {
        await this.handleReceivePack(socket, repo, socketStream)
      } else {
        socket.destroy()
      }
    } catch (err) {
      console.error('[MockGitDaemon] Error in handleConnection:', err)
      if (!socket.destroyed) socket.destroy()
    }
  }

  /**
   * Handle upload-pack (fetch/clone)
   */
  private async handleUploadPack(socket: Socket, repo: RepositoryInfo, socketStream: AsyncIterableIterator<Uint8Array>): Promise<void> {
    try {
      await withTimeout((async () => {
        // 1. Send reference advertisement
        const { refs, symrefs } = await this.getAllRefs(repo)
        
        // Write service line
        try {
          await this.writeBuffer(socket, GitPktLine.encode(`# service=git-upload-pack\n`))
          await this.writeBuffer(socket, GitPktLine.flush())
        } catch (err) {
          // Client may have closed connection (e.g., during discover phase)
          if (socket.destroyed) return
          throw err
        }
        
        // Write reference advertisement
        // For empty repos, we need to send the special "no-refs" line
        // Otherwise, writeRefsAdResponse will only send a flush packet
        try {
          if (refs.size === 0) {
            // Send special "no-refs" line for empty repositories
            const capabilitiesArray = ['multi_ack', 'side-band', 'side-band-64k', 'ofs-delta', 'shallow', 'deepen-since', 'deepen-not', 'no-progress', 'include-tag', 'allow-tip-sha1-in-want', 'allow-reachable-sha1-in-want', 'no-done', 'symref', 'filter', 'object-format=sha1', 'agent=git/mock-daemon']
            const caps = `\x00${capabilitiesArray.join(' ')} agent=git/mock-daemon`
            await this.writeBuffer(socket, GitPktLine.encode(`0000000000000000000000000000000000000000 capabilities^{}${caps}\n`))
            // Add flush packet to end advertisement
            await this.writeBuffer(socket, GitPktLine.flush())
          } else {
            const adResponse = await writeRefsAdResponse({
              refs,
              symrefs,
              capabilities: new Set(['multi_ack', 'side-band', 'side-band-64k', 'ofs-delta', 'shallow', 'deepen-since', 'deepen-not', 'no-progress', 'include-tag', 'allow-tip-sha1-in-want', 'allow-reachable-sha1-in-want', 'no-done', 'symref', 'filter', 'object-format=sha1', 'agent=git/mock-daemon'])
            })
            for (const chunk of adResponse) {
              await this.writeBuffer(socket, chunk)
            }
          }
          // Ensure all data is flushed to the client
          // The socket should automatically flush, but we can't easily wait for it
          // The client will read the advertisement and then send the upload-pack request
        } catch (err) {
          // Client may have closed connection after reading advertisement (discover phase)
          if (socket.destroyed) return
          throw err
        }

        // 2. Read the client's upload-pack request
        // Use the same stream that was used to read the service request
        // If the connection was closed (discover phase), this will fail gracefully
        let request
        try {
          request = await parseUploadPackRequest(socketStream)
        } catch (err) {
          // If connection was closed, this is expected (discover phase)
          if (socket.destroyed) return
          throw err
        }

        // 3. Generate and send the packfile
        const normalizedFs = createFileSystem(repo.fs)
        const cache: Record<string, unknown> = {}
        
        // Determine which objects to send
        const objectsToSend = new Set<string>()
        
        // Add all wanted objects and their dependencies
        for (const want of request.wants) {
          const objects = await listObjects({ fs: normalizedFs, cache, gitdir: repo.gitdir, oids: [want] })
          for (const oid of objects) {
            objectsToSend.add(oid)
          }
        }
        
        // Remove objects that client already has
        for (const have of request.haves) {
          try {
            if (await hasObject({ fs: normalizedFs, cache, gitdir: repo.gitdir, oid: have })) {
              // Client has this commit, remove it and its ancestors from objectsToSend
              const haveObjects = await listObjects({ fs: normalizedFs, cache, gitdir: repo.gitdir, oids: [have] })
              for (const oid of haveObjects) {
                objectsToSend.delete(oid)
              }
            }
          } catch {
            // Server doesn't have this object, ignore it
          }
        }
        
        // Generate packfile
        const packfileChunks = await _pack({
          fs: normalizedFs,
          cache,
          gitdir: repo.gitdir,
          oids: Array.from(objectsToSend),
        })
        
        // Build response with ACK and packfile
        // Send ACK for first want
        if (request.wants.length > 0) {
          await this.writeBuffer(socket, GitPktLine.encode(`ACK ${request.wants[0]}\n`))
        } else {
          await this.writeBuffer(socket, GitPktLine.encode('NAK\n'))
        }
        
        // Send packfile using side-band-64k encoding
        const packfileBuffer = Buffer.concat(packfileChunks)
        const CHUNK_SIZE = 65519 // side-band-64k max data per packet
        for (let i = 0; i < packfileBuffer.length; i += CHUNK_SIZE) {
          const chunk = packfileBuffer.slice(i, i + CHUNK_SIZE)
          // Side-band byte 1 = packfile data
          const sidebandChunk = Buffer.concat([Buffer.from([1]), chunk])
          await this.writeBuffer(socket, GitPktLine.encode(sidebandChunk))
        }
        
        // Add flush packet at the end
        await this.writeBuffer(socket, GitPktLine.flush())
        
        // End the socket
        socket.end()
      })())
    } catch (err) {
      console.error('[MockGitDaemon] Error in handleUploadPack:', err)
      if (!socket.destroyed) socket.destroy()
    }
  }

  /**
   * Handle receive-pack (push)
   */
  private async handleReceivePack(socket: Socket, repo: RepositoryInfo, socketStream: AsyncIterableIterator<Uint8Array>): Promise<void> {
    try {
      await withTimeout((async () => {
        // 1. Send reference advertisement
        const { refs, symrefs } = await this.getAllRefs(repo)
        
        // Write service line
        await this.writeBuffer(socket, GitPktLine.encode(`# service=git-receive-pack\n`))
        await this.writeBuffer(socket, GitPktLine.flush())
        
        // Write reference advertisement
        const adResponse = await writeRefsAdResponse({
          refs,
          symrefs,
          capabilities: new Set(['report-status', 'delete-refs', 'quiet', 'atomic', 'ofs-delta', 'push-options', 'allow-tip-sha1-in-want', 'allow-reachable-sha1-in-want', 'push-cert', 'object-format=sha1', 'agent=git/mock-daemon'])
        })
        for (const chunk of adResponse) {
          await this.writeBuffer(socket, chunk)
        }

        // 2. Read receive-pack request (ref updates + packfile)
        // Use the same stream that was used to read the service request
        // Use processReceivePack from wire/receivePack.ts (same as HTTP mock server)
        const { processReceivePack, formatReceivePackResponse } = await import('@awesome-os/universal-git-src/wire/receivePack.ts')
        
        const result = await processReceivePack({
          fs: repo.fs,
          gitdir: repo.gitdir,
          requestBody: socketStream,
          context: {},
        })

        // 3. Format and send response
        const responseBuffers = formatReceivePackResponse(result)
        for (const buf of responseBuffers) {
          await this.writeBuffer(socket, buf)
        }

        // End the socket
        socket.end()
      })())
    } catch (err) {
      console.error('[MockGitDaemon] Error in handleReceivePack:', err)
      // Send error response
      try {
        await this.writeBuffer(socket, GitPktLine.encode(`unpack error: ${String(err)}\n`))
        await this.writeBuffer(socket, GitPktLine.flush())
      } catch {
        // Ignore errors sending error response
      }
      if (!socket.destroyed) socket.destroy()
    }
  }

  /**
   * Write buffer to socket and wait for it to be written
   */
  private async writeBuffer(socket: Socket, buffer: Buffer | UniversalBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (socket.destroyed) {
        reject(new Error('Socket is destroyed'))
        return
      }
      // Convert UniversalBuffer to Node.js Buffer if needed
      const nodeBuffer = buffer instanceof UniversalBuffer 
        ? Buffer.from(buffer)
        : buffer
      socket.write(nodeBuffer, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

/**
 * Create a mock Git daemon server instance
 */
export function createMockGitDaemon(): MockGitDaemon {
  return new MockGitDaemon()
}

/**
 * Helper function to create a mock Git daemon client for a fixture
 */
export async function createMockDaemonClient(fixtureName: string, additionalFixtures?: string[]): Promise<{ daemon: MockGitDaemon; url: string; tcp: any }> {
  const daemon = new MockGitDaemon()
  await daemon.registerFixture(fixtureName)
  if (additionalFixtures) {
    for (const fixture of additionalFixtures) {
      await daemon.registerFixture(fixture)
    }
  }
  const port = await daemon.start()
  const url = daemon.getUrl(fixtureName)
  const { tcpClient } = await import('@awesome-os/universal-git-src/daemon/node/index.ts')
  return { daemon, url, tcp: tcpClient }
}
