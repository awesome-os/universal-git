import { GitRemoteHttp } from './GitRemoteHTTP.ts'
import { GitRemoteSSH } from './GitRemoteSSH.ts'
import { GitRemoteDaemon } from './GitRemoteDaemon.ts'
import type { GitRemoteBackend } from './GitRemoteBackend.ts'
import type { RemoteBackendOptions } from './types.ts'
import { MissingParameterError } from '../../errors/MissingParameterError.ts'

export class RemoteBackendRegistry {
  private static cache = new Map<string, GitRemoteBackend>()

  static getBackend(options: RemoteBackendOptions): GitRemoteBackend {
    const url = options.url.trim()
    const cacheKey = `${options.useRestApi ?? false}:${url.toLowerCase()}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const backend = this.detectBackend(options)
    this.cache.set(cacheKey, backend)
    return backend
  }

  private static detectBackend(
    options: RemoteBackendOptions
  ): GitRemoteBackend {
    const lowerUrl = options.url.toLowerCase()

    // Filesystem protocol (file://)
    if (lowerUrl.startsWith('file://')) {
      // TODO: Implement GitRemoteFs when needed
      throw new Error(
        `RemoteBackendRegistry: file:// protocol not yet implemented. Use GitRemoteFs directly.`
      )
    }

    // Git daemon protocol (git://)
    if (lowerUrl.startsWith('git://')) {
      if (!options.tcp) {
        throw new MissingParameterError(
          'tcp',
          'GitRemoteDaemon requires tcp client for git:// URLs'
        )
      }
      return new GitRemoteDaemon(options.url)
    }

    // SSH protocol (ssh:// or git@host:path)
    if (
      lowerUrl.startsWith('ssh://') ||
      (options.url.includes('@') &&
        options.url.includes(':') &&
        !lowerUrl.startsWith('http') &&
        !lowerUrl.startsWith('git://'))
    ) {
      if (!options.ssh) {
        throw new MissingParameterError(
          'ssh',
          'GitRemoteSSH requires ssh client for SSH URLs'
        )
      }
      return new GitRemoteSSH(options.url)
    }

    // HTTP/HTTPS protocols
    if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
      if (!options.http) {
        throw new MissingParameterError(
          'http',
          'HttpClient required for HTTP/HTTPS URLs'
        )
      }
      // TODO: Support REST API backends (GitHub, GitLab, Bitbucket) when useRestApi is true
      // For now, always use GitRemoteHttp
      // Note: http client is passed in options to discover()/connect(), not stored in instance
      return new GitRemoteHttp(options.url)
    }

    throw new Error(
      `RemoteBackendRegistry: unsupported remote protocol in ${options.url}`
    )
  }
}


