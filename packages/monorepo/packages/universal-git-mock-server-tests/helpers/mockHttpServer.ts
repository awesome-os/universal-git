// Use relative paths to source code since these are internal APIs
import type { GitHttpRequest, GitHttpResponse, HttpClient } from '@awesome-os/universal-git-src/git/remote/GitRemoteHTTP.ts'
import { uploadPack } from '@awesome-os/universal-git-src/commands/uploadPack.ts'
import { listRefs } from '@awesome-os/universal-git-src/git/refs/listRefs.ts'
import { resolveRef, readSymbolicRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import { writeRefsAdResponse } from '@awesome-os/universal-git-src/wire/writeRefsAdResponse.ts'
import { parseUploadPackRequest } from '@awesome-os/universal-git-src/wire/parseUploadPackRequest.ts'
import { parseReceivePackResponse } from '@awesome-os/universal-git-src/wire/parseReceivePackResponse.ts'
import { writeReceivePackRequest } from '@awesome-os/universal-git-src/wire/writeReceivePackRequest.ts'
import { _pack } from '@awesome-os/universal-git-src/commands/pack.ts'
import { listObjects } from '@awesome-os/universal-git-src/commands/listObjects.ts'
import { listCommitsAndTags } from '@awesome-os/universal-git-src/commands/listCommitsAndTags.ts'
import { hasObject } from '@awesome-os/universal-git-src/git/objects/hasObject.ts'
import { readObject } from '@awesome-os/universal-git-src/git/objects/readObject.ts'
import { parse as parseTag } from '@awesome-os/universal-git-src/core-utils/parsers/Tag.ts'
import { GitPktLine } from '@awesome-os/universal-git-src/models/GitPktLine.ts'
import { GitSideBand } from '@awesome-os/universal-git-src/models/GitSideBand.ts'
import { collect } from '@awesome-os/universal-git-src/utils/collect.ts'
import { fromValue } from '@awesome-os/universal-git-src/utils/fromValue.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import type { ServerRef } from '@awesome-os/universal-git-src/git/refs/types.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

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
 * Mock HTTP server that handles requests directly without using a port.
 * Routes requests to git repositories based on URL patterns.
 */
export class MockHttpServer {
  private repositories: Map<string, { fs: any; gitdir: string }> = new Map()
  private refsCache: Map<string, { refs: Record<string, string>; symrefs: Record<string, string> }> = new Map()

  /**
   * Register a git repository for serving
   * @param name - Repository name (e.g., 'test-listServerRefs')
   * @param fs - File system client
   * @param gitdir - Git directory path
   */
  async registerRepository(name: string, fs: any, gitdir: string): Promise<void> {
    this.repositories.set(name, { fs, gitdir })
  }

  /**
   * Register a repository from a fixture
   * @param fixtureName - Fixture name (e.g., 'test-listServerRefs')
   */
  async registerFixture(fixtureName: string): Promise<void> {
    const { fs, gitdir } = await makeFixture(fixtureName)
    this.repositories.set(fixtureName, { fs, gitdir })
  }

  /**
   * Parse URL to extract repository name and path
   */
  private parseUrl(url: string): { repoName: string; path: string; query: Record<string, string> } | null {
    // Match patterns like:
    // http://localhost:8888/test-listServerRefs.git/info/refs?service=git-upload-pack
    // http://localhost:8888/test-listServerRefs.git/git-upload-pack
    // http://localhost/test-listServerRefs.git/info/refs
    // https://github.com/isomorphic-git/test.empty.git (for submodules)
    // https://github.com/isomorphic-git/test.empty.git/info/refs?service=git-upload-pack
    
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/').filter(p => p)
    
    if (pathParts.length === 0) return null
    
    // Handle GitHub URLs: https://github.com/isomorphic-git/test.empty.git -> test-clone
    // Also handle URLs without .git suffix: https://github.com/isomorphic-git/test.empty
    // Git may add .git to the URL during discovery, so handle both cases
    if (urlObj.hostname === 'github.com' && pathParts.length >= 2) {
      const org = pathParts[0]
      let repoName = pathParts[1]
      // Remove .git suffix if present
      if (repoName.endsWith('.git')) {
        repoName = repoName.slice(0, -4)
      }
      
      // Special mapping for test.empty submodule -> test-clone fixture
      if (repoName === 'test.empty' && this.repositories.has('test-clone')) {
        const path = pathParts.slice(2).join('/')
        const query: Record<string, string> = {}
        urlObj.searchParams.forEach((value, key) => {
          query[key] = value
        })
        return { repoName: 'test-clone', path, query }
      }
      
      // Try to find a matching fixture by converting dots to dashes
      const fixtureName = `test-${repoName.replace(/\./g, '-')}`
      if (this.repositories.has(fixtureName)) {
        const path = pathParts.slice(2).join('/')
        const query: Record<string, string> = {}
        urlObj.searchParams.forEach((value, key) => {
          query[key] = value
        })
        return { repoName: fixtureName, path, query }
      }
      
      // Fall through to try as-is
    }
    
    // First part should be the repository name (with or without .git suffix)
    let repoName = pathParts[0]
    if (repoName.endsWith('.git')) {
      repoName = repoName.slice(0, -4)
    }
    
    // Rest of the path
    const path = pathParts.slice(1).join('/')
    
    // Parse query string
    const query: Record<string, string> = {}
    urlObj.searchParams.forEach((value, key) => {
      query[key] = value
    })
    
    return { repoName, path, query }
  }

  /**
   * Get all refs from a repository (with caching)
   */
  private async getAllRefs(repo: { fs: any; gitdir: string }): Promise<{ refs: Record<string, string>; symrefs: Record<string, string> }> {
    // Check cache first
    const cacheKey = repo.gitdir
    if (this.refsCache.has(cacheKey)) {
      return this.refsCache.get(cacheKey)!
    }
    
    // No timeout wrapper for cached operations - they should be fast
    return (async () => {
      const { fs, gitdir } = repo
    const refs: Record<string, string> = {}
    const symrefs: Record<string, string> = {}
    
    // Add HEAD
    try {
      const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
      refs.HEAD = headOid
      try {
        const headTarget = await readSymbolicRef({ fs, gitdir, ref: 'HEAD' })
        if (headTarget && headTarget.startsWith('refs/')) {
          symrefs.HEAD = headTarget
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
          refs[fullRef] = oid
          
          // Check if it's a symref (for protocol v2)
          // Try readSymbolicRef first, but also try reading the file directly as fallback
          try {
            let symrefTarget = await readSymbolicRef({ fs, gitdir, ref: fullRef })
            if (!symrefTarget) {
              // Fallback: read the file directly
              try {
                const normalizedFs = createFileSystem(fs)
                const refPath = join(gitdir, fullRef)
                const content = await normalizedFs.read(refPath, 'utf8')
                if (content && typeof content === 'string' && content.trim().startsWith('ref: ')) {
                  symrefTarget = content.trim().slice('ref: '.length).trim()
                }
              } catch {
                // File doesn't exist or can't be read
              }
            }
            if (symrefTarget && symrefTarget.startsWith('refs/')) {
              symrefs[fullRef] = symrefTarget
            }
          } catch {
            // Not a symref
          }
          
          // If it's a tag, add peeled ref (^{} suffix) for tag peeling
          if (fullRef.startsWith('refs/tags/')) {
            try {
              const cache: Record<string, unknown> = {}
              const { type, object } = await readObject({ fs, cache, gitdir, oid, format: 'content' })
              if (type === 'tag') {
                const tag = parseTag(object as UniversalBuffer)
                // Add peeled tag ref with ^{} suffix
                refs[`${fullRef}^{}`] = tag.object
              }
            } catch {
              // Not a tag object or can't read it, skip peeling
            }
          }
        } catch {
          // Skip refs that can't be resolved
        }
      }
    } catch {
      // No refs directory
    }
    
    const result = { refs, symrefs }
    // Cache the result
    this.refsCache.set(cacheKey, result)
    return result
    })()
  }

  /**
   * Handle /info/refs request (refs advertisement)
   */
  private async handleInfoRefs(
    repo: { fs: any; gitdir: string },
    service: string,
    protocolVersion: 1 | 2 = 1
  ): Promise<GitHttpResponse> {
    // No timeout wrapper - these operations should be fast, especially with caching
    return (async () => {
      const { fs, gitdir } = repo
    
    if (protocolVersion === 2) {
      // Protocol v2 - return version and capabilities in pkt-line format
      const capabilities = ['ls-refs', 'fetch']
      const response: UniversalBuffer[] = []
      
      // First line: version 2 (without trailing newline, GitPktLine.encode handles it)
      response.push(GitPktLine.encode('version 2'))
      
      // Capability lines (without trailing newline, GitPktLine.encode handles it)
      for (const cap of capabilities) {
        response.push(GitPktLine.encode(cap))
      }
      
      // Flush packet to end capabilities list
      response.push(GitPktLine.flush())
      
      // Create async iterable from array of buffers
      // Arrays are iterable, so getIterator should handle them automatically
      // But we need an async iterable, so use async generator
      // Protocol v1 collects into single buffer, but pkt-line format requires separate packets
      // So we yield each buffer individually
      const body = (async function* (): AsyncIterableIterator<Uint8Array> {
        for (const buf of response) {
          yield buf as Uint8Array
        }
      })()
      
      return {
        url: '',
        method: 'GET',
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': `application/x-${service}-advertisement`,
        },
        body,
      }
    }
    
    // Protocol v1 - use writeRefsAdResponse to generate refs advertisement
    const { refs, symrefs } = await this.getAllRefs(repo)
    
    // Protocol v1 only reports HEAD symref, not others
    const protocolV1Symrefs: Record<string, string> = {}
    if (symrefs.HEAD) {
      protocolV1Symrefs.HEAD = symrefs.HEAD
    }
    
    const capabilities = [
      'thin-pack',
      'side-band',
      'side-band-64k',
      'shallow',
      'deepen-since',
      'deepen-not',
      'allow-tip-sha1-in-want',
      'allow-reachable-sha1-in-want',
    ]
    
    const response = await writeRefsAdResponse({
      capabilities,
      refs,
      symrefs: protocolV1Symrefs,
    })
    
    // Protocol v1 requires "# service=git-upload-pack\n" as first line, then flush
    // writeRefsAdResponse doesn't include this, so we prepend it
    const fullResponse: UniversalBuffer[] = []
    fullResponse.push(GitPktLine.encode(`# service=${service}\n`))
    fullResponse.push(GitPktLine.flush())
    fullResponse.push(...response)
    
    // Create async iterable from array of buffers
    const body = (async function* (): AsyncIterableIterator<Uint8Array> {
      for (const buf of fullResponse) {
        yield buf as Uint8Array
      }
    })()
    
    return {
      url: '',
      method: 'GET',
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        'content-type': `application/x-${service}-advertisement`,
      },
      body,
    }
    })()
  }

  /**
   * Handle service request (upload-pack, receive-pack)
   */
  private async handleService(
    repo: { fs: any; gitdir: string },
    service: string,
    requestBody?: AsyncIterableIterator<Uint8Array> | Uint8Array
  ): Promise<GitHttpResponse> {
    return withTimeout((async () => {
      const { fs, gitdir } = repo
    
    if (service === 'git-upload-pack') {
      // Check if this is a protocol v2 ls-refs request
      if (requestBody) {
        try {
          const bodyBuffer = requestBody instanceof Uint8Array 
            ? requestBody 
            : await collect(requestBody)
          
          // Parse pkt-line format
          const read = GitPktLine.streamReader(fromValue(bodyBuffer))
          const lines: string[] = []
          let line: UniversalBuffer | null | true
          while (true) {
            line = await read()
            if (line === true) break
            if (line === null) continue
            lines.push(line.toString('utf8').replace(/\n$/, ''))
          }
          
          // Check for protocol v2 ls-refs command
          if (lines.some(l => l.includes('command=ls-refs'))) {
            // Parse the request to extract prefix, symrefs, peelTags
            let prefix: string | undefined
            let symrefs = false
            let peelTags = false
            
            for (const line of lines) {
              if (line.startsWith('ref-prefix ')) {
                prefix = line.substring('ref-prefix '.length).trim()
              } else if (line === 'symrefs') {
                symrefs = true
              } else if (line === 'peel') {
                peelTags = true
              }
            }
            
            // Get refs based on prefix
            const { refs, symrefs: symrefsMap } = await this.getAllRefs(repo)
            
            // Filter by prefix if specified
            let filteredRefs = Object.entries(refs)
            if (prefix) {
              filteredRefs = filteredRefs.filter(([ref]) => ref.startsWith(prefix))
            }
            
            // Build protocol v2 ls-refs response
            // Always include at least the flush packet, even if no refs match
            const response: UniversalBuffer[] = []
            for (const [ref, oid] of filteredRefs) {
              // Skip peeled tag refs (^{} suffix) - they're handled separately
              if (ref.endsWith('^{}')) {
                continue
              }
              
              const attrs: string[] = []
              if (symrefs && symrefsMap[ref]) {
                attrs.push(`symref-target:${symrefsMap[ref]}`)
              }
              
              // Handle peelTags for annotated tags
              if (peelTags && ref.startsWith('refs/tags/') && refs[`${ref}^{}`]) {
                attrs.push(`peeled:${refs[`${ref}^{}`]}`)
              }
              
              const line = `${oid} ${ref}${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}\n`
              response.push(GitPktLine.encode(line))
            }
            // Always add flush packet, even if no refs (empty response is valid)
            response.push(GitPktLine.flush())
            
            // Create async iterable from array of buffers
            // fromValue only handles single values, so we need to create an async generator
            const body = (async function* (): AsyncIterableIterator<Uint8Array> {
              for (const buf of response) {
                yield buf as Uint8Array
              }
            })()
            
            return {
              url: '',
              method: 'POST',
              statusCode: 200,
              statusMessage: 'OK',
              headers: {
                // Protocol v2 ls-refs responses use -result, not -advertisement
                'content-type': `application/x-${service}-result`,
              },
              body,
            }
          }
        } catch {
          // If parsing fails, fall through to default handling
        }
      }
      
      // Handle upload-pack request (fetch) - generate packfile
      if (!requestBody) {
        const body = (async function* (): AsyncIterableIterator<Uint8Array> {
          yield GitPktLine.encode('NAK\n') as Uint8Array
        })()
        return {
          url: '',
          method: 'POST',
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'content-type': `application/x-${service}-result`,
          },
          body,
        }
      }
      
      try {
        // Get the body buffer - either it's already a buffer or we need to collect from iterator
        const bodyBuffer = requestBody instanceof Uint8Array
          ? requestBody 
          : await collect(requestBody!)
        // Recreate stream from buffer for parsing - create a fresh iterator
        const requestBodyStream = (async function* (): AsyncIterableIterator<Uint8Array> {
          yield bodyBuffer
        })()
        const request = await parseUploadPackRequest(requestBodyStream)
        const cache: Record<string, unknown> = {}
        
        // Normalize fs to ensure it's a FileSystem instance
        const normalizedFs = createFileSystem(fs)
        
        // Determine which objects to send
        const objectsToSend = new Set<string>()
        
        // Add all wanted objects and their dependencies
        for (const want of request.wants) {
          const objects = await listObjects({ fs: normalizedFs, cache, gitdir, oids: [want] })
          for (const oid of objects) {
            objectsToSend.add(oid)
          }
        }
        
        // Remove objects that client already has
        // The client tells us what it has via the 'haves' list
        // We need to check if the server has these objects, and if so, remove them and their ancestors
        for (const have of request.haves) {
          // Check if server has this object (client says it has it, so we should have it too)
          // If server doesn't have it, client is wrong, but we'll ignore it
          try {
            if (await hasObject({ fs: normalizedFs, cache, gitdir, oid: have })) {
              // Client has this commit, remove it and its ancestors from objectsToSend
              const haveObjects = await listObjects({ fs: normalizedFs, cache, gitdir, oids: [have] })
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
          gitdir,
          oids: Array.from(objectsToSend),
        })
        
        // Build response with ACK and packfile
        const response: UniversalBuffer[] = []
        
        // Send ACK for first want
        if (request.wants.length > 0) {
          response.push(GitPktLine.encode(`ACK ${request.wants[0]}\n`))
        } else {
          response.push(GitPktLine.encode('NAK\n'))
        }
        
        // Send packfile using side-band-64k encoding
        // Combine packfile chunks into single buffer
        const packfileBuffer = UniversalBuffer.concat(packfileChunks)
        
        // Split packfile into chunks and encode with side-band
        const CHUNK_SIZE = 65519 // side-band-64k max data per packet
        for (let i = 0; i < packfileBuffer.length; i += CHUNK_SIZE) {
          const chunk = packfileBuffer.slice(i, i + CHUNK_SIZE)
          // Side-band byte 1 = packfile data
          const sidebandChunk = UniversalBuffer.concat([UniversalBuffer.from([1]), chunk])
          response.push(GitPktLine.encode(sidebandChunk))
        }
        
        // Add flush packet at the end
        response.push(GitPktLine.flush())
        
        // Create async iterable from array of buffers (fromValue only handles single values)
        const body = (async function* (): AsyncIterableIterator<Uint8Array> {
          for (const buf of response) {
            yield buf as Uint8Array
          }
        })()
        
        return {
          url: '',
          method: 'POST',
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'content-type': `application/x-${service}-result`,
          },
          body,
        }
        } catch (err) {
        // Error generating packfile - return NAK
        const body = (async function* (): AsyncIterableIterator<Uint8Array> {
          yield GitPktLine.encode('NAK\n') as Uint8Array
        })()
        return {
          url: '',
          method: 'POST',
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'content-type': `application/x-${service}-result`,
          },
          body,
        }
      }
    }
    
    if (service === 'git-receive-pack') {
      // Handle receive-pack request (push) with server-side hooks
      if (!requestBody) {
        // Create async iterable from single buffer
        const body = (async function* () {
          yield GitPktLine.encode('unpack ok\n')
          yield GitPktLine.flush()
        })()
        return {
          url: '',
          method: 'POST',
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'content-type': `application/x-${service}-result`,
          },
          body,
        }
      }
      
      try {
        // Use the receive-pack handler with hook integration
        const { processReceivePack, formatReceivePackResponse } = await import('@awesome-os/universal-git-src/wire/receivePack.ts')
        
        // Convert Uint8Array to async iterable if needed
        const requestBodyIterable = requestBody instanceof Uint8Array
          ? (async function* (): AsyncIterableIterator<Uint8Array> {
              yield requestBody
            })()
          : requestBody
        
        const result = await processReceivePack({
          fs,
          gitdir,
          requestBody: requestBodyIterable,
          context: {
            // Add any additional context (remote info, etc.) if needed
          },
        })
        
        // Format the response
        const responseBuffers = formatReceivePackResponse(result)
        
        // Create async iterable from array of buffers
        const body = (async function* (): AsyncIterableIterator<Uint8Array> {
          for (const buf of responseBuffers) {
            yield buf as Uint8Array
          }
        })()
        
        return {
          url: '',
          method: 'POST',
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'content-type': `application/x-${service}-result`,
          },
          body,
        }
      } catch (err) {
        // Error processing push
        // Create async iterable from single buffer
        const body = (async function* () {
          yield GitPktLine.encode(`unpack error: ${String(err)}`)
          yield GitPktLine.flush()
        })()
        return {
          url: '',
          method: 'POST',
          statusCode: 200,
          statusMessage: 'OK',
          headers: {
            'content-type': `application/x-${service}-result`,
          },
          body,
        }
      }
    }
    
    // Default response for other services
    const body = (async function* (): AsyncIterableIterator<Uint8Array> {
      // Empty body
    })()
    return {
      url: '',
      method: 'POST',
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        'content-type': `application/x-${service}-result`,
      },
      body,
    }
    })())
  }

  /**
   * Handle HTTP request
   */
  async handleRequest(request: GitHttpRequest & { _bodyBuffer?: Uint8Array }): Promise<GitHttpResponse> {
    // No timeout wrapper - delegate to specific handlers which handle their own timeouts
    return (async () => {
      const parsed = this.parseUrl(request.url)
      
      if (!parsed) {
        return {
          url: request.url,
          method: request.method || 'GET',
          statusCode: 404,
          statusMessage: 'Not Found',
          headers: {},
          body: (async function* (): AsyncIterableIterator<Uint8Array> {
            yield UniversalBuffer.from('Repository not found\n') as Uint8Array
          })(),
        }
      }
      
      const { repoName, path, query } = parsed
      const repo = this.repositories.get(repoName)
      
      if (!repo) {
        return {
          url: request.url,
          method: request.method || 'GET',
          statusCode: 404,
          statusMessage: 'Not Found',
          headers: {},
          body: (async function* (): AsyncIterableIterator<Uint8Array> {
            yield UniversalBuffer.from(`Repository ${repoName} not found\n`) as Uint8Array
          })(),
        }
      }
      
      // Handle /info/refs endpoint
      if (path === 'info/refs') {
        const service = query.service || 'git-upload-pack'
        // Protocol version can be specified in query string or default to 1
        // If version=2 is in query, use protocol v2, otherwise v1
        const protocolVersion = (query.version === '2' || request.headers?.['git-protocol'] === 'version=2') ? 2 : 1
        return this.handleInfoRefs(repo, service, protocolVersion as 1 | 2)
      }
      
      // Handle service endpoints (git-upload-pack, git-receive-pack)
      if (path === 'git-upload-pack' || path === 'git-receive-pack') {
        const service = path
        // Use the stored buffer if available, otherwise use the body iterator
        const requestBody = request._bodyBuffer || request.body
        return this.handleService(repo, service, requestBody)
      }
      
      // Unknown path
      return {
        url: request.url,
        method: request.method || 'GET',
        statusCode: 404,
        statusMessage: 'Not Found',
        headers: {},
        body: (async function* (): AsyncIterableIterator<Uint8Array> {
          yield UniversalBuffer.from('Path not found\n') as Uint8Array
        })(),
      }
    })()
  }

  /**
   * Create an HttpClient that uses this mock server
   */
  createClient(): HttpClient {
    return {
      request: async (req: GitHttpRequest & { _bodyBuffer?: Uint8Array }): Promise<GitHttpResponse> => {
        // Collect the body into a buffer to avoid iterator consumption issues
        // Store the buffer in the request object so it can be reused
        if (req.body) {
          // Collect the body into a buffer to avoid iterator consumption issues
          // Store the buffer in the request object so it can be reused
          // Add timeout to body collection to prevent hanging (reduced from 30s to 5s for faster failure)
          req._bodyBuffer = await withTimeout(collect(req.body), 5000)
          // Create a fresh iterator from the buffer for the handler
          req.body = (async function* (): AsyncIterableIterator<Uint8Array> {
            yield req._bodyBuffer!
          })()
        }
        return this.handleRequest(req)
      },
    }
  }
}

/**
 * Create a mock HTTP server instance
 */
export function createMockHttpServer(): MockHttpServer {
  return new MockHttpServer()
}

/**
 * Helper function to create a mock HTTP client for a fixture
 * @param fixtureName - Name of the fixture to use
 * @param additionalFixtures - Additional fixtures to register (for submodules, etc.)
 * @returns HttpClient that routes to the fixture repository
 */
export async function createMockHttpClient(fixtureName: string, additionalFixtures?: string[]): Promise<HttpClient> {
  const server = createMockHttpServer()
  await server.registerFixture(fixtureName)
  // Register additional fixtures (e.g., for submodules)
  if (additionalFixtures) {
    for (const fixture of additionalFixtures) {
      await server.registerFixture(fixture)
    }
  }
  return server.createClient()
}

