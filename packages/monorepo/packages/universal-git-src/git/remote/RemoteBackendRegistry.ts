import { GitRemoteHttp } from './GitRemoteHTTP.ts'
import { GitRemoteSSH } from './GitRemoteSSH.ts'
import { GitRemoteDaemon } from './GitRemoteDaemon.ts'
import type { GitRemoteBackend } from './GitRemoteBackend.ts'
import type { RemoteBackendOptions } from './types.ts'
import { MissingParameterError } from '../../errors/MissingParameterError.ts'

/**
 * Registry for Git remote backends, indexed by URL for easy translation between
 * backends and config.
 * 
 * **URL-Indexed Architecture**:
 * 
 * The registry uses normalized URLs as cache keys, enabling bidirectional translation:
 * - **Config → Backend**: Read URL from `.git/config`, look up backend by URL
 * - **Backend → Config**: Get URL from backend via `getUrl()`, find config entry with that URL
 * 
 * This design allows easy mapping between:
 * - Remote names in config (`remote.<name>.url`) and backend instances
 * - Backend instances and their corresponding config entries
 * 
 * **URL Normalization**:
 * 
 * URLs are normalized to lowercase and trimmed for consistent lookup:
 * - `'https://github.com/user/repo.git'` → `'https://github.com/user/repo.git'`
 * - `'git@github.com:user/repo.git'` → `'git@github.com:user/repo.git'`
 * - `'  HTTPS://GITHUB.COM/USER/REPO.GIT  '` → `'https://github.com/user/repo.git'`
 * 
 * **Caching**:
 * 
 * Backends are cached globally by normalized URL. This means:
 * - Multiple remotes with the same URL share the same backend instance
 * - Backends are reused across different Repository instances
 * - Cache persists for the lifetime of the application
 * 
 * **Protocol Detection**:
 * 
 * The registry automatically detects the protocol from the URL:
 * - HTTP/HTTPS URLs → `GitRemoteHttp` backend
 * - SSH URLs (ssh:// or git@host:path) → `GitRemoteSSH` backend
 * - Git daemon URLs (git://) → `GitRemoteDaemon` backend
 * - File URLs (file://) → Not yet implemented
 * 
 * @example
 * ```typescript
 * // Get backend from URL (config → backend)
 * const url = 'https://github.com/user/repo.git'
 * const backend = RemoteBackendRegistry.getBackend({ url, http: httpClient })
 * 
 * // Get URL from backend (backend → config)
 * const backendUrl = backend.getUrl() // 'https://github.com/user/repo.git'
 * 
 * // Find config entry with this URL
 * const config = await repo.getConfig()
 * const remoteNames = await config.getSubsections('remote')
 * for (const name of remoteNames) {
 *   const configUrl = await config.get(`remote.${name}.url`)
 *   if (configUrl === backendUrl) {
 *     console.log(`Remote '${name}' uses this backend`)
 *   }
 * }
 * ```
 */
export class RemoteBackendRegistry {
  /**
   * URL-indexed cache of remote backends.
   * 
   * Key: Normalized URL (lowercase, trimmed)
   * Value: GitRemoteBackend instance
   * 
   * This allows easy translation:
   * - Config → Backend: Read URL from config, look up by URL
   * - Backend → Config: Get URL from backend, find config entry
   */
  private static cache = new Map<string, GitRemoteBackend>()

  /**
   * Gets or creates a remote backend for the given URL.
   * 
   * The backend is cached by normalized URL, so multiple calls with the same URL
   * return the same backend instance. This enables easy translation between
   * config entries and backend instances.
   * 
   * **URL Normalization**:
   * 
   * The URL is normalized (trimmed, lowercase) before use as a cache key.
   * This ensures that URLs with different casing or whitespace map to the same backend.
   * 
   * **Protocol Detection**:
   * 
   * The registry automatically detects the protocol from the URL and creates
   * the appropriate backend type. Protocol-specific clients (http, ssh, tcp)
   * are required unless `urlOnly: true` is specified.
   * 
   * @param options - Backend creation options
   * @param options.url - The remote repository URL (will be normalized for caching)
   * @param options.urlOnly - If `true`, allows creating backends without clients
   * @param options.http - HTTP client for HTTP/HTTPS URLs (required unless `urlOnly: true`)
   * @param options.ssh - SSH client for SSH URLs (required unless `urlOnly: true`)
   * @param options.tcp - TCP client for git:// URLs (required unless `urlOnly: true`)
   * @param options.fs - File system provider for file:// URLs
   * @param options.auth - Authentication credentials for forge APIs
   * @param options.useRestApi - Whether to use REST API backends for supported forges
   * @returns Cached or newly created GitRemoteBackend instance
   * @throws MissingParameterError if required protocol client is missing (when `urlOnly: false`)
   * @throws Error if protocol is not supported or file:// protocol is used
   * 
   * @example
   * ```typescript
   * // Get backend from URL (from config)
   * const url = await config.get('remote.origin.url') // 'https://github.com/user/repo.git'
   * const backend = RemoteBackendRegistry.getBackend({ url, http: httpClient })
   * 
   * // Get URL from backend (to find in config)
   * const backendUrl = backend.getUrl() // 'https://github.com/user/repo.git'
   * 
   * // URL-only mode: Get backend just to read URL
   * const backend = RemoteBackendRegistry.getBackend({ url, urlOnly: true })
   * const url = backend.getUrl()
   * ```
   */
  static getBackend(options: RemoteBackendOptions): GitRemoteBackend {
    // Normalize URL for consistent caching and lookup
    const url = options.url.trim()
    const normalizedUrl = url.toLowerCase()
    
    // Check cache first (URL-indexed lookup)
    const cached = this.cache.get(normalizedUrl)
    if (cached) {
      return cached
    }

    // Create new backend and cache it by normalized URL
    const backend = this.detectBackend(options)
    this.cache.set(normalizedUrl, backend)
    return backend
  }

  /**
   * Gets a backend by URL if it exists in the cache.
   * 
   * This method allows looking up backends by URL without creating them,
   * which is useful for checking if a backend already exists for a given URL.
   * 
   * @param url - The remote repository URL (will be normalized)
   * @returns The cached backend instance, or `undefined` if not found
   * 
   * @example
   * ```typescript
   * // Check if backend exists for URL
   * const url = 'https://github.com/user/repo.git'
   * const backend = RemoteBackendRegistry.getBackendByUrl(url)
   * if (backend) {
   *   console.log('Backend already exists for this URL')
   * }
   * ```
   */
  static getBackendByUrl(url: string): GitRemoteBackend | undefined {
    const normalizedUrl = url.trim().toLowerCase()
    return this.cache.get(normalizedUrl)
  }

  /**
   * Gets the normalized URL for a backend instance.
   * 
   * This is a convenience method that extracts the URL from a backend and
   * normalizes it, which can be used to look up the backend in the cache
   * or find corresponding config entries.
   * 
   * @param backend - The backend instance
   * @returns The normalized URL for this backend
   * 
   * @example
   * ```typescript
   * // Get normalized URL from backend
   * const backend = await repo.getRemote('origin')
   * const normalizedUrl = RemoteBackendRegistry.getNormalizedUrl(backend)
   * // Use to find in config or look up in cache
   * ```
   */
  static getNormalizedUrl(backend: GitRemoteBackend): string {
    return backend.getUrl().trim().toLowerCase()
  }

  /**
   * Clears the backend cache.
   * 
   * This is useful for testing or when you need to force recreation of backends.
   * 
   * @example
   * ```typescript
   * // Clear cache (e.g., in tests)
   * RemoteBackendRegistry.clearCache()
   * ```
   */
  static clearCache(): void {
    this.cache.clear()
  }

  /**
   * Detects the protocol from the URL and creates the appropriate backend type.
   * 
   * This method analyzes the URL to determine which backend implementation to use:
   * - HTTP/HTTPS URLs → `GitRemoteHttp`
   * - SSH URLs (ssh:// or git@host:path) → `GitRemoteSSH`
   * - Git daemon URLs (git://) → `GitRemoteDaemon`
   * - File URLs (file://) → Not yet implemented
   * 
   * Protocol-specific clients are required unless `urlOnly: true` is specified.
   * 
   * @param options - Backend creation options
   * @returns Newly created GitRemoteBackend instance
   * @throws MissingParameterError if required protocol client is missing (when `urlOnly: false`)
   * @throws Error if protocol is not supported or file:// protocol is used
   * @internal
   */
  private static detectBackend(
    options: RemoteBackendOptions
  ): GitRemoteBackend {
    const url = options.url.trim()
    const lowerUrl = url.toLowerCase()
    const urlOnly = options.urlOnly ?? false

    // Filesystem protocol (file://)
    if (lowerUrl.startsWith('file://')) {
      // TODO: Implement GitRemoteFs when needed
      throw new Error(
        `RemoteBackendRegistry: file:// protocol not yet implemented. Use GitRemoteFs directly.`
      )
    }

    // Git daemon protocol (git://)
    if (lowerUrl.startsWith('git://')) {
      if (!urlOnly && !options.tcp) {
        throw new MissingParameterError(
          'tcp',
          'GitRemoteDaemon requires tcp client for git:// URLs'
        )
      }
      return new GitRemoteDaemon(url)
    }

    // SSH protocol (ssh:// or git@host:path)
    if (
      lowerUrl.startsWith('ssh://') ||
      (url.includes('@') &&
        url.includes(':') &&
        !lowerUrl.startsWith('http') &&
        !lowerUrl.startsWith('git://'))
    ) {
      if (!urlOnly && !options.ssh) {
        throw new MissingParameterError(
          'ssh',
          'GitRemoteSSH requires ssh client for SSH URLs'
        )
      }
      return new GitRemoteSSH(url)
    }

    // HTTP/HTTPS protocols
    if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
      if (!urlOnly && !options.http) {
        throw new MissingParameterError(
          'http',
          'HttpClient required for HTTP/HTTPS URLs'
        )
      }
      // TODO: Support REST API backends (GitHub, GitLab, Bitbucket) when useRestApi is true
      // For now, always use GitRemoteHttp
      // Note: http client is passed in options to discover()/connect(), not stored in instance
      return new GitRemoteHttp(url)
    }

    throw new Error(
      `RemoteBackendRegistry: unsupported remote protocol in ${options.url}`
    )
  }
}


