import { UnknownTransportError } from '../../errors/UnknownTransportError.ts'
import { UrlParseError } from '../../errors/UrlParseError.ts'
import { translateSSHtoHTTP } from "../../utils/translateSSHtoHTTP.ts"
import { GitRemoteHTTP } from './GitRemoteHTTP.ts'
import { GitRemoteDaemon } from './GitRemoteDaemon.ts'
import { GitRemoteSSH } from './GitRemoteSSH.ts'
import { GitRemoteHTTPDumb } from './GitRemoteHTTPDumb.ts'

type ParsedRemoteUrl = {
  transport: string
  address: string
}

/**
 * Parses a remote URL and extracts its transport and address.
 * 
 * @param url - The remote URL to parse
 * @returns Parsed remote URL with transport and address, or undefined if parsing fails
 */
function parseRemoteUrl({
  url,
}: {
  url: string
}): ParsedRemoteUrl | undefined {
  // the stupid "shorter scp-like syntax"
  if (url.startsWith('git@')) {
    return {
      transport: 'ssh',
      address: url,
    }
  }
  const matches = url.match(/(\w+)(:\/\/|::)(.*)/)
  if (matches === null) return undefined
  /*
   * When git encounters a URL of the form <transport>://<address>, where <transport> is
   * a protocol that it cannot handle natively, it automatically invokes git remote-<transport>
   * with the full URL as the second argument.
   *
   * @see https://git-scm.com/docs/git-remote-helpers
   */
  if (matches[2] === '://') {
    return {
      transport: matches[1],
      address: matches[0],
    }
  }
  /*
   * A URL of the form <transport>::<address> explicitly instructs git to invoke
   * git remote-<transport> with <address> as the second argument.
   *
   * @see https://git-scm.com/docs/git-remote-helpers
   */
  if (matches[2] === '::') {
    return {
      transport: matches[1],
      address: matches[3],
    }
  }
  return undefined
}

/**
 * Type for remote helper classes (all protocols)
 */
export type RemoteHelper = typeof GitRemoteHTTP | typeof GitRemoteDaemon | typeof GitRemoteSSH | typeof GitRemoteHTTPDumb

/**
 * Determines the appropriate remote helper for the given URL.
 * 
 * Supports:
 * - git:// → GitRemoteDaemon
 * - ssh:// or git@ → GitRemoteSSH
 * - http:// or https:// → GitRemoteHTTP (smart) or GitRemoteHTTPDumb (dumb, fallback)
 * 
 * @param url - The remote URL
 * @returns The remote helper class for the specified transport
 * @throws {UrlParseError} If the URL cannot be parsed
 * @throws {UnknownTransportError} If the transport is not supported
 */
export function getRemoteHelperFor({
  url,
}: {
  url: string
}): RemoteHelper {
  // Check for git:// protocol first (before parsing)
  if (url.startsWith('git://')) {
    return GitRemoteDaemon
  }

  // Check for SSH protocol (ssh:// or git@ scp-style)
  // Note: This will return GitRemoteSSH, but the caller must provide an SSH client
  // If no SSH client is provided, the caller should throw UnknownTransportError
  // We return GitRemoteSSH here so the caller can check for SSH client availability
  if (url.startsWith('ssh://') || (url.includes('@') && url.includes(':') && !url.startsWith('http'))) {
    return GitRemoteSSH
  }

  // TODO: clean up the remoteHelper API and move into PluginCore
  const remoteHelpers = new Map<string, RemoteHelper>()
  remoteHelpers.set('http', GitRemoteHTTP) // Smart HTTP (will fallback to dumb if needed)
  remoteHelpers.set('https', GitRemoteHTTP) // Smart HTTP (will fallback to dumb if needed)
  remoteHelpers.set('git', GitRemoteDaemon)

  const parts = parseRemoteUrl({ url })
  if (!parts) {
    throw new UrlParseError(url)
  }
  if (remoteHelpers.has(parts.transport)) {
    return remoteHelpers.get(parts.transport)!
  }
  throw new UnknownTransportError(
    url,
    parts.transport,
    parts.transport === 'ssh' ? translateSSHtoHTTP(url) : undefined
  )
}

