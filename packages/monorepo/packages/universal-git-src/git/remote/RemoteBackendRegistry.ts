import { GitRemoteHttp } from './GitRemoteHTTP.ts'
import type { GitRemoteBackend } from './GitRemoteBackend.ts'
import type { RemoteBackendOptions } from './types.ts'

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

    if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
      return new GitRemoteHttp(options.url)
    }

    throw new Error(
      `RemoteBackendRegistry: unsupported remote protocol in ${options.url}`
    )
  }
}


