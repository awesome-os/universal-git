/**
 * Browser/Web support for Git daemon protocol (Error Implementation)
 * 
 * This is a lightweight alternative implementation that provides clear error messages
 * when Git daemon protocol is attempted in browser environments.
 * 
 * Use this implementation when:
 * - You don't want to depend on the `ws` package
 * - You don't want to bundle WebSocket proxy support
 * - You want clear, helpful error messages instead of runtime failures
 * - For builds that explicitly exclude TCP/WebSocket functionality
 * 
 * For full Git daemon support in browsers, use the WebSocket proxy implementation
 * in ../web/index.ts instead.
 * 
 * Note: Git daemon protocol requires TCP sockets, which are not available in browser environments.
 * This module provides error handling and clear error messages for unsupported environments.
 */

import type { TcpClient, TcpConnection, TcpConnectOptions } from '../TcpClient.ts'
import type { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Browser implementation of TcpConnection (error-throwing variant)
 * 
 * This implementation throws clear error messages when Git daemon protocol is attempted.
 * Use this for lightweight builds that don't include WebSocket proxy support.
 */
class BrowserTcpConnection implements TcpConnection {
  async write(_data: Uint8Array | UniversalBuffer): Promise<void> {
    throw new Error(
      'Git daemon protocol (git://) is not supported in browser environments. ' +
      'TCP sockets are not available in browsers. ' +
      'Please use HTTP/HTTPS (http:// or https://) or SSH (ssh://) protocols instead.'
    )
  }

  read(): AsyncIterableIterator<Uint8Array> {
    throw new Error(
      'Git daemon protocol (git://) is not supported in browser environments. ' +
      'TCP sockets are not available in browsers. ' +
      'Please use HTTP/HTTPS (http:// or https://) or SSH (ssh://) protocols instead.'
    )
  }

  async close(): Promise<void> {
    // No-op for browser
  }
}

/**
 * Browser implementation of TcpClient (error-throwing variant)
 * 
 * This implementation throws clear error messages when Git daemon protocol is attempted.
 * Use this for lightweight builds that don't include WebSocket proxy support.
 * 
 * For full Git daemon support, use the WebSocket proxy implementation in ../web/index.ts
 */
export const tcpClient: TcpClient = {
  async connect(_options: TcpConnectOptions): Promise<TcpConnection> {
    throw new Error(
      'Git daemon protocol (git://) is not supported in browser environments.\n\n' +
      'TCP sockets are not available in browsers. To use Git daemon protocol, you need:\n' +
      '1. A Node.js environment (use universal-git/daemon/node)\n' +
      '2. Or use alternative protocols:\n' +
      '   - HTTP/HTTPS: http:// or https:// URLs\n' +
      '   - SSH: ssh:// or git@ URLs (requires SSH client)\n\n' +
      'For browser environments, HTTP/HTTPS is the recommended protocol.\n\n' +
      'Alternatively, use the WebSocket proxy implementation:\n' +
      '  import { setWebSocketProxyConfig } from "@awesome-os/universal-git-src/daemon/web"\n' +
      '  setWebSocketProxyConfig({ proxyUrl: "ws://localhost:8080/git-daemon-proxy" })'
    )
  },
}

/**
 * Lightweight error-throwing implementation for Git daemon protocol in browsers.
 * 
 * This is a valid alternative for builds that don't include WebSocket proxy support.
 */
export default { tcpClient }

